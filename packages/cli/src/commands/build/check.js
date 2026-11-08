import {
	check,
	DEFAULT_WORD_SIZE,
	loadLocalModules,
	loadProjectLibraries,
	mergeModuleLibraries,
	parse,
	resolvePlatformTypes,
	tokenize,
} from "embedito95-core";
import { hasErrorDiagnostics, printDiagnostics } from "../../console.js";

const parseSource = (source, sourcePath) => {
	const { tokens, errors: lexErrors } = tokenize(source);

	if (lexErrors.length > 0) {
		printDiagnostics(lexErrors, sourcePath);
		process.exit(1);
	}

	const { ast, errors: parseErrors, comments } = parse(tokens);

	if (parseErrors.length > 0) {
		printDiagnostics(parseErrors, sourcePath);
		process.exit(1);
	}

	return { ast, comments };
};

export const checkProject = (
	source,
	entryFile,
	entryPath,
	platform,
	workingDirectory,
) => {
	const { ast, comments } = parseSource(source, entryFile);

	const projectLibraries = loadProjectLibraries(workingDirectory);
	const localModules = loadLocalModules(entryPath);
	const libraries = mergeModuleLibraries(
		projectLibraries,
		localModules.entryLibraries,
	);
	const wordSize = platform?.specs?.wordSize ?? DEFAULT_WORD_SIZE;
	const platformTypes = resolvePlatformTypes(platform);
	const { errors: checkErrors, variableTypes } = check(ast, {
		...libraries,
		isLibrary: false,
		comments,
		source,
		wordSize,
		platformTypes,
	});

	if (checkErrors.length > 0) {
		printDiagnostics(checkErrors, entryFile);
	}

	if (hasErrorDiagnostics(checkErrors)) {
		process.exit(1);
	}

	const libraryTypeContext = { libraries, wordSize, platformTypes };

	return {
		ast,
		projectLibraries,
		localModules,
		variableTypes,
		libraryTypeContext,
	};
};

// Re-checks a generated intermediate (main or async) so that a desugaring bug
// surfaces as a diagnostic against the written intermediate file instead of
// producing C++ that does not compile.
export const checkIntermediate = (source, sourcePath, libraries, platform) => {
	const { ast } = parseSource(source, sourcePath);

	const { errors } = check(ast, {
		...libraries,
		isLibrary: false,
		isEntry: false,
		source,
		wordSize: platform?.specs?.wordSize ?? DEFAULT_WORD_SIZE,
		platformTypes: resolvePlatformTypes(platform),
	});

	if (hasErrorDiagnostics(errors)) {
		printDiagnostics(errors, sourcePath);
		process.exit(1);
	}
};
