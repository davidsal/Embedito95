import {
	check,
	HEADER_EXTENSION,
	MODULE_PREFIX,
	mergeModuleLibraries,
	parse,
	resolvePlatformTypes,
	SOURCE_EXTENSION,
	shared,
	tokenize,
} from "embedito95-core";
import { hasErrorDiagnostics, printDiagnostics } from "../../console.js";

const checkModule = (
	moduleInfo,
	overlay,
	projectLibraries,
	platform,
	defaultWordSize,
) => {
	const { tokens, errors: lexErrors } = tokenize(moduleInfo.source);

	if (lexErrors.length > 0) {
		return lexErrors;
	}

	const { ast, errors: parseErrors } = parse(tokens);

	if (parseErrors.length > 0) {
		return parseErrors;
	}

	const libraries = mergeModuleLibraries(projectLibraries, overlay);

	return check(ast, {
		...libraries,
		isLibrary: false,
		isEntry: false,
		source: moduleInfo.source,
		wordSize: platform?.specs?.wordSize ?? defaultWordSize,
		platformTypes: resolvePlatformTypes(platform),
	}).errors;
};

const compileModule = (
	moduleInfo,
	overlay,
	strategy,
	platform,
	projectLibraries,
	libraryModules,
	headerIncludes,
	cycles,
) => {
	const libraries = mergeModuleLibraries(projectLibraries, overlay);
	const compiled = shared.compileProjectLibrary({
		source: moduleInfo.source,
		sourceLines: moduleInfo.source.split("\n"),
		platform,
		libraryModules,
		libraryFunctions: libraries.libraryFunctions,
		libraryEnumInfo: libraries.libraryEnumInfo,
		libraryObjectTypes: libraries.libraryObjectTypes,
		libraryNamespaces: libraries.libraryNamespaces,
		namespace: moduleInfo.namespace,
		headerIncludes,
		cycles,
		...shared.resolvePlatformRenderOptions(platform),
	});

	const directory = moduleInfo.namespace.replace(MODULE_PREFIX, "");
	const headerFileName = `${moduleInfo.namespace}${HEADER_EXTENSION}`;
	const sourceFileName = `${moduleInfo.namespace}${SOURCE_EXTENSION}`;

	return {
		include: strategy.renderModuleInclude({ directory, headerFileName }),
		file: {
			directory,
			headerFileName,
			sourceFileName,
			header: compiled.header,
			source: compiled.source,
		},
	};
};

const buildHeaderIncludes = (
	moduleInfo,
	localModules,
	projectLibraryFiles,
	strategy,
) => {
	const includes = projectLibraryFiles.map((file) => {
		return strategy.renderDependencyInclude({
			headerFileName: file.headerFileName,
		});
	});

	for (const imported of moduleInfo.imports) {
		const dependency = imported.path
			? localModules.byPath.get(imported.path)
			: null;
		if (dependency) {
			includes.push(
				strategy.renderDependencyInclude({
					headerFileName: `${dependency.namespace}${HEADER_EXTENSION}`,
				}),
			);
		}
	}

	return [...new Set(includes)];
};

export const compileProjectModules = (
	localModules,
	strategy,
	platform,
	projectLibraries,
	libraryModules,
	defaultWordSize,
	projectLibraryFiles = [],
	cycles = true,
) => {
	const includes = [];
	const files = [];

	for (const moduleInfo of localModules.modules) {
		const overlay = localModules.librariesFor(moduleInfo.path);
		const errors = checkModule(
			moduleInfo,
			overlay,
			projectLibraries,
			platform,
			defaultWordSize,
		);

		if (hasErrorDiagnostics(errors)) {
			printDiagnostics(errors, moduleInfo.path);
			process.exit(1);
		}

		const { include, file } = compileModule(
			moduleInfo,
			overlay,
			strategy,
			platform,
			projectLibraries,
			libraryModules,
			buildHeaderIncludes(
				moduleInfo,
				localModules,
				projectLibraryFiles,
				strategy,
			),
			cycles,
		);

		includes.push(include);
		files.push(file);
	}

	return { moduleIncludes: includes, moduleFiles: files };
};
