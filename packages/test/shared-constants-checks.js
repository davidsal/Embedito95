import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BUILD_DIRECTORY_NAME,
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	E95_EXTENSION,
	ENTRY_OPTION,
	ERROR_CODE,
	isTruncationWarning,
	JSON_INDENTATION,
	LIBRARIES_DIRECTORY_NAME,
	LIBRARY_PROJECT_TYPE,
	MAIN_FILE,
	MODULES_DIRECTORY_NAME,
	PROJECT_TYPE,
	SEVERITY,
	STRATEGIES_DIRECTORY_NAME,
	UTF8,
} from "embedito95-core";
import { computeDiagnostics } from "../lsp/src/diagnostics.js";
import { expectEqual } from "./reporting.js";

// Regression guards for TICKET-7: the shared project-layout/encoding
// constants and the truncation-warning predicate now live once in
// `embedito95-core`, and the former re-declarations must not come back.
const PACKAGE_DIRECTORY = dirname(fileURLToPath(import.meta.url));

const CLI_CONSTANTS_SOURCE_FILE = join(
	PACKAGE_DIRECTORY,
	"../cli/src/constants.js",
);
const CLI_CONSOLE_FILE = join(PACKAGE_DIRECTORY, "../cli/src/console.js");
const LSP_DIAGNOSTICS_FILE = join(
	PACKAGE_DIRECTORY,
	"../lsp/src/diagnostics.js",
);
const LSP_SERVER_FILE = join(PACKAGE_DIRECTORY, "../lsp/src/server/index.js");
const LSP_LIBRARIES_FILE = join(
	PACKAGE_DIRECTORY,
	"../lsp/src/server/shared/libraries.js",
);
const LSP_LIBRARY_DOCS_FILE = join(
	PACKAGE_DIRECTORY,
	"../lsp/src/server/shared/library-docs.js",
);
const TEST_CONSTANTS_FILE = join(PACKAGE_DIRECTORY, "constants.js");

const readSource = (path) => {
	return readFileSync(path, UTF8);
};

const declaresConstant = (source, name) => {
	return new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=`).test(source);
};

const checkCanonicalConstantValues = () => {
	return [
		expectEqual("core owns the text encoding", UTF8, "utf-8"),
		expectEqual("core owns the config file name", CONFIG_FILE, "config.json"),
		expectEqual(
			"core owns the application project type",
			PROJECT_TYPE,
			"project",
		),
		expectEqual(
			"core owns the library project type",
			LIBRARY_PROJECT_TYPE,
			"library",
		),
		expectEqual(
			"core owns the core-libraries directory name",
			CORE_LIBRARIES_DIRECTORY_NAME,
			"core",
		),
		expectEqual(
			"core owns the client-libraries directory name",
			LIBRARIES_DIRECTORY_NAME,
			"libraries",
		),
		expectEqual(
			"core owns the build directory name",
			BUILD_DIRECTORY_NAME,
			"build",
		),
		expectEqual(
			"core owns the modules directory name",
			MODULES_DIRECTORY_NAME,
			"modules",
		),
		expectEqual(
			"core owns the registry strategies directory name",
			STRATEGIES_DIRECTORY_NAME,
			"strategies",
		),
		expectEqual("core owns the entry file name", MAIN_FILE, "main.e95"),
		expectEqual("core owns the e95 extension", E95_EXTENSION, ".e95"),
		expectEqual("core owns the JSON indentation", JSON_INDENTATION, 2),
		expectEqual("core owns the entry flag", ENTRY_OPTION, "--entry"),
	];
};

const checkNoResidualCliDeclarations = () => {
	const source = readSource(CLI_CONSTANTS_SOURCE_FILE);
	const removedNames = [
		"UTF8",
		"CONFIG_FILE",
		"LIBRARIES_DIRECTORY_NAME",
		"CORE_LIBRARIES_DIRECTORY_NAME",
		"PROJECT_TYPE",
		"LIBRARY_PROJECT_TYPE",
		"BUILD_DIRECTORY_NAME",
		"MODULES_DIRECTORY_NAME",
		"HEADER_FILE_EXTENSION",
		"SOURCE_FILE_EXTENSION",
		"DEFAULT_ENTRY",
		"ENTRY_FLAG",
		"STRATEGIES_DIRECTORY_NAME",
	];

	return removedNames.map((name) => {
		return expectEqual(
			`cli constants.js no longer declares ${name}`,
			declaresConstant(source, name),
			false,
		);
	});
};

const checkNoResidualLspDeclarations = () => {
	const serverSource = readSource(LSP_SERVER_FILE);
	const librariesSource = readSource(LSP_LIBRARIES_FILE);
	const libraryDocsSource = readSource(LSP_LIBRARY_DOCS_FILE);

	return [
		expectEqual(
			"lsp server no longer declares UTF8",
			declaresConstant(serverSource, "UTF8"),
			false,
		),
		expectEqual(
			"lsp server no longer declares CONFIG_FILE",
			declaresConstant(serverSource, "CONFIG_FILE"),
			false,
		),
		expectEqual(
			"lsp server no longer declares LIBRARY_TYPE",
			declaresConstant(serverSource, "LIBRARY_TYPE"),
			false,
		),
		expectEqual(
			"lsp libraries no longer declares CONFIG_FILE",
			declaresConstant(librariesSource, "CONFIG_FILE"),
			false,
		),
		expectEqual(
			"lsp libraries no longer declares LIBRARY_TYPE",
			declaresConstant(librariesSource, "LIBRARY_TYPE"),
			false,
		),
		expectEqual(
			"lsp libraries no longer declares LIBRARIES_DIRECTORY_NAME",
			declaresConstant(librariesSource, "LIBRARIES_DIRECTORY_NAME"),
			false,
		),
		expectEqual(
			"lsp libraries no longer declares CORE_LIBRARIES_DIRECTORY_NAME",
			declaresConstant(librariesSource, "CORE_LIBRARIES_DIRECTORY_NAME"),
			false,
		),
		expectEqual(
			"lsp library docs no longer declares LIBRARY_MAIN_FILE",
			declaresConstant(libraryDocsSource, "LIBRARY_MAIN_FILE"),
			false,
		),
		expectEqual(
			"lsp library docs no longer declares UTF8",
			declaresConstant(libraryDocsSource, "UTF8"),
			false,
		),
	];
};

const checkNoResidualTestDeclarations = () => {
	const source = readSource(TEST_CONSTANTS_FILE);
	const removedNames = [
		"CONFIG_FILE",
		"TEXT_ENCODING",
		"ENTRY_FILE_EXTENSION",
		"PROJECT_TYPE",
		"JSON_INDENTATION",
		"ENTRY_OPTION",
	];

	return removedNames.map((name) => {
		return expectEqual(
			`test constants.js no longer declares ${name}`,
			declaresConstant(source, name),
			false,
		);
	});
};

const checkTruncationPredicateNotDuplicated = () => {
	return [
		expectEqual(
			"cli console no longer declares isTruncationWarning",
			declaresConstant(readSource(CLI_CONSOLE_FILE), "isTruncationWarning"),
			false,
		),
		expectEqual(
			"lsp diagnostics no longer declares isTruncationWarning",
			declaresConstant(readSource(LSP_DIAGNOSTICS_FILE), "isTruncationWarning"),
			false,
		),
	];
};

const makeTruncationDiagnostic = (code, severity) => {
	return { code, severity };
};

const checkTruncationPredicateSemantics = () => {
	return [
		expectEqual(
			"assignment truncation at warning severity is a truncation warning",
			isTruncationWarning(
				makeTruncationDiagnostic(
					ERROR_CODE.assignmentTypeMismatch,
					SEVERITY.warning,
				),
			),
			true,
		),
		expectEqual(
			"argument truncation at warning severity is a truncation warning",
			isTruncationWarning(
				makeTruncationDiagnostic(
					ERROR_CODE.argumentTypeMismatch,
					SEVERITY.warning,
				),
			),
			true,
		),
		expectEqual(
			"an error-severity assignment mismatch is not a truncation warning",
			isTruncationWarning(
				makeTruncationDiagnostic(
					ERROR_CODE.assignmentTypeMismatch,
					SEVERITY.error,
				),
			),
			false,
		),
		expectEqual(
			"a missing severity defaults to an error, not a truncation warning",
			isTruncationWarning(
				makeTruncationDiagnostic(ERROR_CODE.assignmentTypeMismatch, undefined),
			),
			false,
		),
		expectEqual(
			"an unrelated warning code is not a truncation warning",
			isTruncationWarning(
				makeTruncationDiagnostic(ERROR_CODE.unusedConstant, SEVERITY.warning),
			),
			false,
		),
	];
};

const TRUNCATION_SOURCE =
	"const f = (value: u16) => {\n  const small: u8 = value;\n  return small;\n};\nconst setup = () => { f(1); };\nconst main = () => { f(2); };\n";

const checkLspFiltersTruncationWarnings = async () => {
	const diagnostics = await computeDiagnostics(
		TRUNCATION_SOURCE,
		null,
		{},
		false,
		true,
	);
	const hasTruncationWarning = diagnostics.some((diagnostic) => {
		return isTruncationWarning({
			code: diagnostic.code,
			severity: (diagnostic.severity ?? 1) - 1,
		});
	});
	const hasOtherWarning = diagnostics.some((diagnostic) => {
		return diagnostic.code === ERROR_CODE.unusedFunction;
	});

	return [
		expectEqual(
			"lsp diagnostics drop the truncation warning",
			hasTruncationWarning,
			false,
		),
		expectEqual("lsp diagnostics keep other warnings", hasOtherWarning, true),
	];
};

export const runSharedConstantsChecks = async () => {
	return [
		...checkCanonicalConstantValues(),
		...checkNoResidualCliDeclarations(),
		...checkNoResidualLspDeclarations(),
		...checkNoResidualTestDeclarations(),
		...checkTruncationPredicateNotDuplicated(),
		...checkTruncationPredicateSemantics(),
		...(await checkLspFiltersTruncationWarnings()),
	];
};
