import { existsSync, readFileSync } from "node:fs";
import {
	check,
	excludeLibrary,
	HEADER_EXTENSION,
	parse,
	resolvePlatformTypes,
	SOURCE_EXTENSION,
	shared,
	tokenize,
	UTF8,
} from "embedito95-core";
import { hasErrorDiagnostics, printDiagnostics } from "../../console.js";
import { LIB_PREFIX } from "../../constants.js";

const collectLibraryErrors = (
	librarySource,
	packageName,
	platform,
	compileParameters,
) => {
	const { tokens: libraryTokens, errors: libraryLexErrors } =
		tokenize(librarySource);

	if (libraryLexErrors.length > 0) {
		return libraryLexErrors;
	}

	const { ast: libraryAst, errors: libraryParseErrors } = parse(libraryTokens);

	if (libraryParseErrors.length > 0) {
		return libraryParseErrors;
	}

	return check(libraryAst, {
		...excludeLibrary(compileParameters.projectLibraries, packageName),
		isLibrary: true,
		libraryPackage: packageName,
		wordSize: platform?.specs?.wordSize ?? compileParameters.defaultWordSize,
		platformTypes: resolvePlatformTypes(platform),
	}).errors;
};

const compileProjectLibrary = (
	librarySource,
	packageName,
	platform,
	compileParameters,
) => {
	const libraryErrors = collectLibraryErrors(
		librarySource,
		packageName,
		platform,
		compileParameters,
	);

	if (hasErrorDiagnostics(libraryErrors)) {
		printDiagnostics(libraryErrors, librarySource);
		process.exit(1);
	}

	const namespace =
		compileParameters.projectLibraries.libraryNamespaces?.[packageName] ?? null;

	return shared.compileProjectLibrary({
		source: librarySource,
		sourceLines: librarySource.split("\n"),
		platform,
		libraryModules: compileParameters.libraryModules,
		libraryFunctions: compileParameters.projectLibraries.libraryFunctions,
		libraryEnumInfo: compileParameters.projectLibraries.libraryEnumInfo,
		libraryObjectTypes: compileParameters.projectLibraries.libraryObjectTypes,
		libraryNamespaces: compileParameters.projectLibraries.libraryNamespaces,
		namespace,
		cycles: compileParameters.cycles,
		...shared.resolvePlatformRenderOptions(platform),
	});
};

const readLibrarySource = (projectLibraries, packageName) => {
	const librarySourcePath = projectLibraries.librarySources?.[packageName];
	if (!librarySourcePath || !existsSync(librarySourcePath)) {
		return null;
	}
	return readFileSync(librarySourcePath, UTF8);
};

const collectLibraryFile = (strategy, compiledLibrary, namespace, outputs) => {
	if (compiledLibrary.header && compiledLibrary.source && namespace) {
		const libraryFolderName = namespace.replace(LIB_PREFIX, "");
		const headerFileName = `${namespace}${HEADER_EXTENSION}`;
		const sourceFileName = `${namespace}${SOURCE_EXTENSION}`;
		outputs.includes.push(
			strategy.renderProjectInclude({
				directory: libraryFolderName,
				headerFileName,
			}),
		);
		outputs.files.push({
			directory: libraryFolderName,
			headerFileName,
			sourceFileName,
			header: compiledLibrary.header,
			source: compiledLibrary.source,
		});
	} else if (compiledLibrary.main) {
		outputs.parts.push(compiledLibrary.main);
	}
};

const collectUserObjectMethods = (compiledLibrary, target) => {
	for (const [typeName, methods] of compiledLibrary.userObjectMethods) {
		if (!target.has(typeName)) {
			target.set(typeName, new Map());
		}
		for (const [methodName, functionExpression] of methods) {
			target.get(typeName).set(methodName, functionExpression);
		}
	}
};

const collectObjectTypeInfo = (compiledLibrary, target) => {
	for (const [typeName, info] of compiledLibrary.objectTypeInfo ?? []) {
		target.set(typeName, info);
	}
};

export const compileProjectLibraries = (
	usedLibraries,
	strategy,
	platform,
	projectLibraries,
	libraryModules,
	defaultWordSize,
	cycles = true,
) => {
	const outputs = {
		parts: [],
		includes: [],
		files: [],
		userObjectMethods: new Map(),
		objectTypeInfo: new Map(),
	};

	for (const packageName of projectLibraries.projectLibraryPackages) {
		if (!usedLibraries.has(packageName)) {
			continue;
		}
		const librarySource = readLibrarySource(projectLibraries, packageName);
		if (!librarySource) {
			continue;
		}

		const compiledLibrary = compileProjectLibrary(
			librarySource,
			packageName,
			platform,
			{
				projectLibraries,
				libraryModules,
				defaultWordSize,
				cycles,
			},
		);

		const namespace = projectLibraries.libraryNamespaces?.[packageName] ?? null;
		collectLibraryFile(strategy, compiledLibrary, namespace, outputs);
		collectUserObjectMethods(compiledLibrary, outputs.userObjectMethods);
		collectObjectTypeInfo(compiledLibrary, outputs.objectTypeInfo);
	}

	return {
		projectLibraryParts: outputs.parts,
		projectLibraryIncludes: outputs.includes,
		projectLibraryFiles: outputs.files,
		additionalUserObjectMethods: outputs.userObjectMethods,
		libraryObjectInfo: outputs.objectTypeInfo,
	};
};
