import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
	AST_NODE,
	E95_EXTENSION,
	MAIN_FILE,
	MODULE_PREFIX,
	UTF8,
} from "../constants.js";
import { tokenize } from "../lexer/index.js";
import { parse } from "../parser/index.js";
import { processLibraryAST, sanitizeNamespace } from "./libraries.js";

const isRelativeSource = (source) => {
	return (
		typeof source === "string" &&
		(source.startsWith("./") || source.startsWith("../"))
	);
};

const isFile = (path) => {
	return existsSync(path) && statSync(path).isFile();
};

const resolveFromDirectory = (source, fromDirectory) => {
	const candidate = resolve(fromDirectory, source);

	if (isFile(candidate)) {
		return candidate;
	}

	const withExtension = candidate.endsWith(E95_EXTENSION)
		? candidate
		: `${candidate}${E95_EXTENSION}`;

	if (isFile(withExtension)) {
		return withExtension;
	}

	const mainPath = join(candidate, MAIN_FILE);

	if (isFile(mainPath)) {
		return mainPath;
	}

	return null;
};

const resolveModuleFile = (source, fromDirectories) => {
	for (const fromDirectory of fromDirectories) {
		const resolved = resolveFromDirectory(source, fromDirectory);
		if (resolved) {
			return resolved;
		}
	}

	return null;
};

const moduleName = (path) => {
	const base = path.split(/[\\/]/).pop() ?? path;
	return base.endsWith(E95_EXTENSION)
		? base.slice(0, -E95_EXTENSION.length)
		: base;
};

const collectRelativeImports = (ast) => {
	const imports = [];

	for (const statement of ast.body) {
		if (
			statement.type === AST_NODE.importDeclaration &&
			isRelativeSource(statement.source)
		) {
			imports.push({ source: statement.source, path: null });
		}
	}

	return imports;
};

const readModule = (path) => {
	const source = readFileSync(path, UTF8);
	const { tokens } = tokenize(source);
	const { ast, comments } = parse(tokens);
	const name = moduleName(path);
	const libraryEnumInfo = {};
	const libraryObjectTypes = {};
	const { exportNames, functions, types } = processLibraryAST(
		ast,
		path,
		libraryEnumInfo,
		libraryObjectTypes,
		{ onlyExported: true, comments },
	);

	return {
		path,
		name,
		namespace: `${MODULE_PREFIX}${sanitizeNamespace(name)}`,
		source,
		ast,
		exports: exportNames,
		functions,
		types,
		enumInfo: libraryEnumInfo[path] ?? null,
		objectTypes: libraryObjectTypes[path] ?? {},
		imports: collectRelativeImports(ast),
	};
};

const readEntryImports = (entryPath) => {
	if (!isFile(entryPath)) {
		return [];
	}

	const source = readFileSync(entryPath, UTF8);
	const { tokens } = tokenize(source);
	const { ast } = parse(tokens);

	return collectRelativeImports(ast);
};

const buildImportOverlay = (imports, byPath) => {
	const overlay = {
		knownLibraries: new Set(),
		libraryExports: {},
		libraryFunctions: {},
		libraryTypes: {},
		libraryEnumInfo: {},
		libraryObjectTypes: {},
		libraryNamespaces: {},
	};

	for (const imported of imports) {
		if (!imported.path) {
			continue;
		}
		const info = byPath.get(imported.path);
		if (!info) {
			continue;
		}
		overlay.knownLibraries.add(imported.source);
		overlay.libraryExports[imported.source] = info.exports;
		overlay.libraryFunctions[imported.source] = info.functions;
		overlay.libraryTypes[imported.source] = info.types;
		overlay.libraryNamespaces[imported.source] = info.namespace;
		if (info.enumInfo) {
			overlay.libraryEnumInfo[imported.source] = info.enumInfo;
		}
		if (info.objectTypes) {
			overlay.libraryObjectTypes[imported.source] = info.objectTypes;
		}
	}

	return overlay;
};

const visitModule = (path, graph) => {
	const existing = graph.byPath.get(path);
	if (existing) {
		return existing;
	}
	const info = readModule(path);
	graph.byPath.set(path, info);
	for (const imported of info.imports) {
		const resolved = resolveModuleFile(imported.source, [dirname(path)]);
		if (!resolved) {
			continue;
		}
		imported.path = resolved;
		visitModule(resolved, graph);
	}
	graph.order.push(info);
	return info;
};

const resolveModuleLibraries = (filePath, entryPath, entryImports, byPath) => {
	if (filePath === entryPath) {
		return buildImportOverlay(entryImports, byPath);
	}
	const info = byPath.get(filePath);
	return buildImportOverlay(info?.imports ?? [], byPath);
};

const makeLibrariesResolver = (entryPath, entryImports, byPath) => {
	return (filePath) => {
		return resolveModuleLibraries(filePath, entryPath, entryImports, byPath);
	};
};

export const loadLocalModules = (entryPath, options = {}) => {
	const { extraDirectories = [] } = options;
	const graph = { byPath: new Map(), order: [] };
	const entryDirectories = [dirname(entryPath), ...extraDirectories];
	const entryImports = readEntryImports(entryPath);

	for (const imported of entryImports) {
		const resolved = resolveModuleFile(imported.source, entryDirectories);
		if (!resolved) {
			continue;
		}
		imported.path = resolved;
		visitModule(resolved, graph);
	}

	const librariesFor = makeLibrariesResolver(
		entryPath,
		entryImports,
		graph.byPath,
	);

	return {
		modules: graph.order,
		byPath: graph.byPath,
		entryImports,
		entryLibraries: buildImportOverlay(entryImports, graph.byPath),
		librariesFor,
	};
};

export const mergeModuleLibraries = (libraries, overlay) => {
	if (!overlay) {
		return libraries;
	}

	const merged = { ...libraries };

	merged.knownLibraries = new Set([
		...(libraries.knownLibraries ?? []),
		...(overlay.knownLibraries ?? []),
	]);

	for (const key of [
		"libraryExports",
		"libraryFunctions",
		"libraryTypes",
		"libraryEnumInfo",
		"libraryObjectTypes",
		"libraryNamespaces",
	]) {
		merged[key] = { ...(libraries[key] ?? {}), ...(overlay[key] ?? {}) };
	}

	return merged;
};
