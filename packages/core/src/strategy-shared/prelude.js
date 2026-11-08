import { AST_NODE, SETUP_MARKER } from "../constants.js";

const isClosingLine = (trimmed) => {
	return trimmed.startsWith("}");
};
const isOpeningLine = (trimmed) => {
	return trimmed.endsWith("{");
};
const CASE_LABEL_PATTERN = /^(case\b.*|default):$/;
const isCaseLabelLine = (trimmed) => {
	return CASE_LABEL_PATTERN.test(trimmed);
};

// Re-indents a whole function/block from scratch by brace depth (the codegen
// emits each top-level statement at depth 0, so nested blocks need this pass).
// A `case`/`default` label does not open a brace but its body is one level
// deeper, so switch bodies are tracked explicitly; otherwise every case body
// would land at the label's own depth.
const indentBracedLines = (content, startDepth) => {
	let depth = startDepth;
	let caseOffset = 0;
	const switchBodyDepths = [];

	return content
		.split("\n")
		.map((line) => {
			const trimmed = line.trim();
			if (!trimmed) {
				return "";
			}
			if (isClosingLine(trimmed)) {
				depth--;
				while (
					switchBodyDepths.length > 0 &&
					depth < switchBodyDepths[switchBodyDepths.length - 1]
				) {
					switchBodyDepths.pop();
					caseOffset--;
				}
			}
			const isLabel = isCaseLabelLine(trimmed);
			const startsSwitch =
				isLabel && switchBodyDepths[switchBodyDepths.length - 1] !== depth;
			const labelOffset = isLabel && !startsSwitch ? -1 : 0;
			const indent = "\t".repeat(Math.max(0, depth + caseOffset + labelOffset));
			if (startsSwitch) {
				switchBodyDepths.push(depth);
				caseOffset++;
			}
			if (isOpeningLine(trimmed)) {
				depth++;
			}
			return `${indent}${trimmed}`;
		})
		.join("\n");
};

export const indentBlock = (content) => {
	if (!content) {
		return "";
	}

	return indentBracedLines(content, 1);
};

export const generateLibraryIncludes = (libraryModules) => {
	const bundled = new Set(
		Object.values(libraryModules).flatMap((module) => {
			return module.barrel ?? [];
		}),
	);
	return Object.entries(libraryModules)
		.filter(([libraryName]) => {
			return !bundled.has(libraryName);
		})
		.map(([, module]) => {
			return module.renderInclude ? module.renderInclude() : "";
		})
		.filter(Boolean)
		.join("\n");
};

export const generateUserFunctions = (userFunctions) => {
	if (userFunctions.length === 0) {
		return "";
	}

	return userFunctions
		.map((func) => {
			return indentBracedLines(func, 0);
		})
		.join("\n\n");
};

export const collectImportNamespaces = (
	ast,
	libraryNamespaces,
	libraryObjectTypes = {},
) => {
	const namespaces = new Map();
	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.importDeclaration) {
			continue;
		}
		const namespace = libraryNamespaces?.[statement.source];
		if (!namespace) {
			continue;
		}
		for (const specifier of statement.specifiers) {
			namespaces.set(specifier.name, namespace);
		}
		for (const typeName of Object.keys(
			libraryObjectTypes[statement.source] ?? {},
		)) {
			namespaces.set(typeName, namespace);
		}
	}
	return namespaces;
};

export const extractUsedLibraries = (ast) => {
	const libraries = new Set();

	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.importDeclaration) {
			continue;
		}
		if (!statement.source) {
			continue;
		}
		libraries.add(statement.source);
	}

	return libraries;
};

export const sortInitEntries = (libraryModules) => {
	const entries = Object.entries(libraryModules).filter(
		([, module]) => module.initializeName,
	);

	if (entries.length <= 1) {
		return entries;
	}

	const names = entries.map(([, module]) => module.initializeName);
	const inDegree = {};
	const adjacency = {};

	for (const name of names) {
		if (!inDegree[name]) {
			inDegree[name] = 0;
		}
		if (!adjacency[name]) {
			adjacency[name] = [];
		}
	}

	for (const [, module] of entries) {
		if (module.executeBefore) {
			if (!adjacency[module.initializeName]) {
				adjacency[module.initializeName] = [];
			}
			adjacency[module.initializeName].push(module.executeBefore);
			inDegree[module.executeBefore] =
				(inDegree[module.executeBefore] ?? 0) + 1;
		}
	}

	const queue = names.filter((name) => inDegree[name] === 0);
	const sorted = [];

	while (queue.length > 0) {
		const node = queue.shift();
		sorted.push(node);

		for (const neighbor of adjacency[node] ?? []) {
			inDegree[neighbor]--;
			if (inDegree[neighbor] === 0) {
				queue.push(neighbor);
			}
		}
	}

	entries.sort(
		([, a], [, b]) =>
			sorted.indexOf(a.initializeName) - sorted.indexOf(b.initializeName),
	);

	return entries;
};

export const generateInitializeCalls = (initEntries) => {
	if (initEntries.length === 0) {
		return "";
	}

	return initEntries
		.map(([, module]) => {
			return `${module.initializeName}();`;
		})
		.join("\n");
};

export const generateInlinedSetupBody = (setupBody, initializeCalls) => {
	const setupLines = setupBody ? setupBody.split("\n") : [];
	const lines = [initializeCalls, ...setupLines].filter(Boolean);

	return lines.length > 0 ? `${SETUP_MARKER}\n${lines.join("\n")}` : "";
};
