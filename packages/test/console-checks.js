import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BUILD_DIRECTORY_NAME,
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	check,
	collectLibraryModuleInfo,
	ERROR_CODE,
	installLibrary,
	JSON_INDENTATION,
	loadProjectLibraries,
	PROJECT_TYPE,
	parse,
	readPackageNames,
	resolvePlatformTypes,
	tokenize,
	UTF8,
} from "embedito95-core";
import { platforms } from "embedito95-registry/platforms";
import { strategies } from "embedito95-registry/strategies";
import {
	copyLibraries,
	listCoreLibraries,
} from "../cli/src/commands/shared/libraries.js";
import { CONSOLE_OUTPUT } from "../registry/src/platforms/enums.js";
import { REGISTRY_LIBRARIES_DIRECTORY } from "./constants.js";
import { expectEqual } from "./reporting.js";

const CONSOLE_LIBRARY_NAME = "console";
const CONSOLE_PACKAGE_NAME = "@embedito95/console";
const CONSOLE_METHOD_NAME = "log";
const CONSOLE_TYPE_NAME = "Console";
const CONSOLE_HEADER_FILE_NAME = "core_console.h";
const CONSOLE_SOURCE_FILE_NAME = "core_console.cpp";
const CONSOLE_NAMESPACE_DECLARATION = "namespace core_console";
const CONSOLE_STRING_OVERLOAD = "void log(const core_string::String &data);";
const CONSOLE_WRITE_CALL = "fputs(";
const CONSOLE_TERMINATOR_CALL = "fputc(";
const MACOS_PLATFORM_NAME = "macos-arm64";
const BOARD_PLATFORM_NAMES = [
	"arduino-nano",
	"arduino-uno",
	"nodemcu32s",
	"stm32-bluepill",
];
const BOARD_PROJECT_NAME_PREFIX = "console-check-";
const PLATFORM_TYPES = [
	"u8",
	"i8",
	"u16",
	"i16",
	"u32",
	"i32",
	"u64",
	"i64",
	"f32",
	"f64",
	"string",
	"char",
	"boolean",
];
const ACCEPTED_ARGUMENT_SOURCE = [
	`import { console } from '${CONSOLE_PACKAGE_NAME}'`,
	"const show = (text: string, letter: char, small: u8, signedSmall: i8, medium: u16, signedMedium: i16, wide: u32, signedWide: i32, huge: u64, signedHuge: i64, real: f32, doubleReal: f64, flag: boolean, maybe: string | null) => {",
	"    console.log(text)",
	"    console.log(letter)",
	"    console.log(small)",
	"    console.log(signedSmall)",
	"    console.log(medium)",
	"    console.log(signedMedium)",
	"    console.log(wide)",
	"    console.log(signedWide)",
	"    console.log(huge)",
	"    console.log(signedHuge)",
	"    console.log(real)",
	"    console.log(doubleReal)",
	"    console.log(flag)",
	"    console.log(maybe)",
	"    console.log(null)",
	"}",
].join("\n");
const MISSING_CONSOLE_SOURCE = [
	"const main = () => {",
	'    console.log("Hello")',
	"}",
	"main()",
].join("\n");
const BOARD_CONSOLE_IMPORT_SOURCE = [
	`import { console } from '${CONSOLE_PACKAGE_NAME}'`,
	"const main = () => {",
	'    console.log("Hello")',
	"}",
	"main()",
].join("\n");

const CONSOLE_CONFIGURATION_PATH = join(
	REGISTRY_LIBRARIES_DIRECTORY,
	CONSOLE_LIBRARY_NAME,
	"config.json",
);
const CONSOLE_MAIN_PATH = join(
	REGISTRY_LIBRARIES_DIRECTORY,
	CONSOLE_LIBRARY_NAME,
	"main.e95",
);

const findPlatform = (platformName) => {
	return platforms.find((platform) => {
		return platform.name === platformName;
	});
};

const readConsoleConfiguration = () => {
	return JSON.parse(readFileSync(CONSOLE_CONFIGURATION_PATH, UTF8));
};

const readConsoleModuleInfo = () => {
	return collectLibraryModuleInfo(
		readFileSync(CONSOLE_MAIN_PATH, UTF8),
		CONSOLE_PACKAGE_NAME,
	);
};

const checkConsoleAutoImportConfiguration = () => {
	const configuration = readConsoleConfiguration();

	return [
		expectEqual(
			"console auto-import is conditioned to the stdout console capability",
			JSON.stringify(configuration.autoImport),
			JSON.stringify({ platform: { console: CONSOLE_OUTPUT.STDOUT } }),
		),
		expectEqual(
			"console installation requires the stdout console capability",
			JSON.stringify(configuration.requires),
			JSON.stringify({ platform: { console: CONSOLE_OUTPUT.STDOUT } }),
		),
	];
};

const checkHostPlatformCapability = () => {
	const platform = findPlatform(MACOS_PLATFORM_NAME);

	return [
		expectEqual(
			"macos-arm64 declares the stdout console capability",
			platform?.console,
			CONSOLE_OUTPUT.STDOUT,
		),
		expectEqual(
			"macos-arm64 installs the console core library",
			platform?.coreLibraries?.includes(CONSOLE_LIBRARY_NAME),
			true,
		),
	];
};

const checkBoardsDoNotDeclareConsole = () => {
	return BOARD_PLATFORM_NAMES.map((platformName) => {
		const platform = findPlatform(platformName);
		return expectEqual(
			`${platformName} does not declare the console capability`,
			platform?.console,
			undefined,
		);
	}).concat(
		BOARD_PLATFORM_NAMES.map((platformName) => {
			const platform = findPlatform(platformName);
			return expectEqual(
				`${platformName} does not install the console core library`,
				platform?.coreLibraries?.includes(CONSOLE_LIBRARY_NAME) ?? false,
				false,
			);
		}),
	);
};

const checkConsoleApiSurface = () => {
	const moduleInfo = readConsoleModuleInfo();
	const consoleMethod =
		moduleInfo.objectTypes?.[CONSOLE_TYPE_NAME]?.methods?.[CONSOLE_METHOD_NAME];
	const { tokens } = tokenize(ACCEPTED_ARGUMENT_SOURCE);
	const { ast } = parse(tokens);
	const { errors } = check(ast, {
		isEntry: false,
		libraryFunctions: {
			[CONSOLE_PACKAGE_NAME]: moduleInfo.functions,
		},
		libraryTypes: {
			[CONSOLE_PACKAGE_NAME]: moduleInfo.types,
		},
		libraryObjectTypes: {
			[CONSOLE_PACKAGE_NAME]: moduleInfo.objectTypes,
		},
		libraryEnumInfo: {},
		knownLibraries: new Set([CONSOLE_PACKAGE_NAME]),
		libraryExports: {
			[CONSOLE_PACKAGE_NAME]: moduleInfo.exports,
		},
		platformTypes: new Set(PLATFORM_TYPES),
		wordSize: 64,
	});
	const unexpectedErrors = errors.filter((error) => {
		return error.code !== ERROR_CODE.unusedFunction;
	});

	return [
		expectEqual(
			"console exposes a Console type with a log method",
			Boolean(consoleMethod),
			true,
		),
		expectEqual(
			"console.log accepts the documented value types without diagnostics",
			unexpectedErrors.map((error) => error.code).join(","),
			"",
		),
	];
};

const checkConsoleIsAbsentWithoutTheLibrary = () => {
	const { tokens } = tokenize(MISSING_CONSOLE_SOURCE);
	const { ast } = parse(tokens);
	const { errors } = check(ast, {
		platformTypes: new Set(PLATFORM_TYPES),
		wordSize: 64,
	});
	const undefinedConsole = errors.find((error) => {
		return (
			error.code === ERROR_CODE.undefinedReference &&
			error.params?.name === CONSOLE_LIBRARY_NAME
		);
	});

	return [
		expectEqual(
			"console.log is an undefined reference when the library is not installed",
			Boolean(undefinedConsole),
			true,
		),
	];
};

const installConsoleForPlatform = async (platform) => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), `embedito95-console-${platform.name}-`),
	);
	await installLibrary({
		sourceDirectory: REGISTRY_LIBRARIES_DIRECTORY,
		libraryName: CONSOLE_LIBRARY_NAME,
		projectPath: projectDirectory,
		platform,
		enumStyle: strategies[platform.strategy]?.enumStyle,
	});

	return {
		projectDirectory,
		buildDirectory: join(
			projectDirectory,
			CORE_LIBRARIES_DIRECTORY_NAME,
			CONSOLE_LIBRARY_NAME,
			BUILD_DIRECTORY_NAME,
		),
	};
};

const checkConsoleRuntimeArtifacts = async () => {
	const platform = findPlatform(MACOS_PLATFORM_NAME);
	const { projectDirectory, buildDirectory } =
		await installConsoleForPlatform(platform);
	const headerPath = join(buildDirectory, CONSOLE_HEADER_FILE_NAME);
	const sourcePath = join(buildDirectory, CONSOLE_SOURCE_FILE_NAME);

	try {
		const header = existsSync(headerPath) ? readFileSync(headerPath, UTF8) : "";
		const source = existsSync(sourcePath) ? readFileSync(sourcePath, UTF8) : "";

		return [
			expectEqual(
				"console install generates the host console header",
				existsSync(headerPath),
				true,
			),
			expectEqual(
				"console install generates the host console source",
				existsSync(sourcePath),
				true,
			),
			expectEqual(
				"console header declares the core_console namespace",
				header.includes(CONSOLE_NAMESPACE_DECLARATION),
				true,
			),
			expectEqual(
				"console header declares the text overload",
				header.includes(CONSOLE_STRING_OVERLOAD),
				true,
			),
			expectEqual(
				"console source writes to stdout with fputs",
				source.includes(CONSOLE_WRITE_CALL),
				true,
			),
			expectEqual(
				"console source finishes every line with fputc",
				source.includes(CONSOLE_TERMINATOR_CALL),
				true,
			),
			expectEqual(
				"console source reuses the core_string runtime",
				source.includes("core_string::String"),
				true,
			),
		];
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

const listCoreDirectoryNames = (projectDirectory) => {
	const coreDirectory = join(projectDirectory, CORE_LIBRARIES_DIRECTORY_NAME);

	if (!existsSync(coreDirectory)) {
		return [];
	}

	return readdirSync(coreDirectory, { withFileTypes: true })
		.filter((entry) => {
			return entry.isDirectory();
		})
		.map((entry) => {
			return entry.name;
		})
		.sort();
};

const listExpectedBoardCoreLibraries = () => {
	return listCoreLibraries().filter((library) => {
		return library.directoryName !== CONSOLE_LIBRARY_NAME;
	});
};

const installBoardCoreLibraries = async (platform) => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), `embedito95-console-${platform.name}-`),
	);
	const configuration = {
		name: `${BOARD_PROJECT_NAME_PREFIX}${platform.name}`,
		type: PROJECT_TYPE,
		platform: platform.name,
		core: [],
		libraries: [],
	};
	await copyLibraries(projectDirectory, configuration, platform);
	writeFileSync(
		join(projectDirectory, CONFIG_FILE),
		`${JSON.stringify(configuration, null, JSON_INDENTATION)}\n`,
		UTF8,
	);

	return { projectDirectory, configuration };
};

const checkBoardConsoleImportIsRejected = (platform, projectDirectory) => {
	const libraries = loadProjectLibraries(projectDirectory);
	const { tokens } = tokenize(BOARD_CONSOLE_IMPORT_SOURCE);
	const { ast } = parse(tokens);
	const { errors } = check(ast, {
		...libraries,
		isLibrary: false,
		wordSize: platform.specs.wordSize,
		platformTypes: resolvePlatformTypes(platform),
	});
	const unknownLibrary = errors.find((error) => {
		return (
			error.code === ERROR_CODE.unknownLibrary &&
			error.params?.name === CONSOLE_PACKAGE_NAME
		);
	});

	return [
		expectEqual(
			`${platform.name} rejects the console import as an unknown library`,
			Boolean(unknownLibrary),
			true,
		),
	];
};

const checkBoardCoreLibraries = async () => {
	const expectedLibraries = listExpectedBoardCoreLibraries();
	const expectedDirectoryNames = expectedLibraries
		.map((library) => {
			return library.directoryName;
		})
		.sort()
		.join(",");
	const expectedPackageNames = expectedLibraries
		.map((library) => {
			return library.packageName;
		})
		.sort()
		.join(",");
	const results = [];

	for (const platformName of BOARD_PLATFORM_NAMES) {
		const platform = findPlatform(platformName);
		const { projectDirectory, configuration } =
			await installBoardCoreLibraries(platform);

		try {
			const directoryNames = listCoreDirectoryNames(projectDirectory);
			const packageNames = readPackageNames(configuration.core).sort();

			results.push(
				expectEqual(
					`${platformName} core/ excludes console`,
					directoryNames.includes(CONSOLE_LIBRARY_NAME),
					false,
				),
				expectEqual(
					`${platformName} config.core excludes console`,
					packageNames.includes(CONSOLE_PACKAGE_NAME),
					false,
				),
				expectEqual(
					`${platformName} core/ keeps every other core library`,
					directoryNames.join(","),
					expectedDirectoryNames,
				),
				expectEqual(
					`${platformName} config.core keeps every other core library`,
					packageNames.join(","),
					expectedPackageNames,
				),
				...checkBoardConsoleImportIsRejected(platform, projectDirectory),
			);
		} finally {
			rmSync(projectDirectory, { recursive: true, force: true });
		}
	}

	return results;
};

export const runConsoleChecks = async () => {
	return [
		...checkConsoleAutoImportConfiguration(),
		...checkHostPlatformCapability(),
		...checkBoardsDoNotDeclareConsole(),
		...checkConsoleApiSurface(),
		...checkConsoleIsAbsentWithoutTheLibrary(),
		...(await checkConsoleRuntimeArtifacts()),
		...(await checkBoardCoreLibraries()),
	];
};
