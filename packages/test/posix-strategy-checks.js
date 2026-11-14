import { execFile, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	BUILD_DIRECTORY_NAME,
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	HEADER_EXTENSION,
	installLibrary,
	JSON_INDENTATION,
	PROJECT_TYPE,
	SOURCE_EXTENSION,
	shared,
	UTF8,
} from "embedito95-core";
import { platforms } from "embedito95-registry/platforms";
import {
	loadLibraryDefinition,
	strategies,
} from "embedito95-registry/strategies";
import { loadLibraryModules } from "../cli/src/commands/build/loadLibraryModules.js";
import { resolveExecutionExitCode } from "../cli/src/commands/run.js";
import { ensurePlatformRequirements } from "../cli/src/commands/shared/requirements.js";
import { LIBRARY_FILE_PREFIX } from "../core/src/constants.js";
import { ASYNC_MODE, INT128_MODE } from "../registry/src/platforms/enums.js";
import {
	CLANG_PATH_CONFIG_KEY,
	findClangCompiler,
	setClangPath,
} from "../registry/src/strategies/posix/clang.js";
import {
	BUILD_COMMAND,
	CLI_PATH,
	EMBEDITO95_PROJECT_VERSION,
	NODE_EXECUTABLE,
	REGISTRY_LIBRARIES_DIRECTORY,
} from "./constants.js";
import { expectEqual } from "./reporting.js";

// T-028a: the host `posix` strategy must generate native `f64`/`__int128` types
// and must not emit the software `f64`/`int128` runtimes. The absence of
// `strategies/posix/f64/support.js` and `strategies/posix/int128/support.js` is
// the actual gate: `renderBundledArtifacts` only writes artifacts when a
// strategy definition exists for the bundled library.
const TYPE_LIBRARY_NAME = "type";
const F64_LIBRARY_NAME = "f64";
const INT128_LIBRARY_NAME = "int128";
const POSIX_STRATEGY_NAME = "posix";
const POSIX_TYPE_ARTIFACT_NAME = TYPE_LIBRARY_NAME;
const POSIX_TYPE_PACKAGE_NAME = "@embedito95/type";
const MACOS_ARM64_PLATFORM = "macos-arm64";
const POSIX_ENUM_STYLE = "enum";
const POSIX_DISPLAY_NAME = "POSIX host";
const PLATFORM_TOOLCHAIN_LABEL = "clang++";
const CLANG_NOT_FOUND_HINT =
	"clang++ not found. Install Xcode Command Line Tools (xcode-select --install) or run `embedito95-cli doctor` to set its path.";
const INT128_CONFIG_PATH = join(
	REGISTRY_LIBRARIES_DIRECTORY,
	TYPE_LIBRARY_NAME,
	INT128_LIBRARY_NAME,
	"config.json",
);
const TYPE_LIBRARY_DIRECTORY = join(
	REGISTRY_LIBRARIES_DIRECTORY,
	TYPE_LIBRARY_NAME,
);
const F64_LIBRARY_DIRECTORY = join(TYPE_LIBRARY_DIRECTORY, F64_LIBRARY_NAME);
const INT128_LIBRARY_DIRECTORY = join(
	TYPE_LIBRARY_DIRECTORY,
	INT128_LIBRARY_NAME,
);
const STRING_LIBRARY_NAME = "string";
const ARRAY_LIBRARY_NAME = "array";
const CONSOLE_LIBRARY_NAME = "console";
const CONSOLE_PACKAGE_NAME = "@embedito95/console";
const TIME_LIBRARY_NAME = "time";
const TIME_PACKAGE_NAME = "@embedito95/time";
const ASYNC_LIBRARY_NAME = "async";
const ASYNC_PACKAGE_NAME = "@embedito95/async";
const TIME_LIBRARY_DIRECTORY = join(
	REGISTRY_LIBRARIES_DIRECTORY,
	TIME_LIBRARY_NAME,
);
const ASYNC_LIBRARY_DIRECTORY = join(
	REGISTRY_LIBRARIES_DIRECTORY,
	ASYNC_LIBRARY_NAME,
);
const ASYNC_CONFIGURATION_PATH = join(ASYNC_LIBRARY_DIRECTORY, "config.json");
const POSIX_ASYNC_CAPABILITY = ASYNC_MODE.SCHEDULER;
const CONSOLE_INCLUDE_LINE = '#include "core/console/core_console.h"';
const CONSOLE_LOG_ARGUMENT = "core_console::log(GREETING)";
const CONSOLE_LIBRARY_DIRECTORY = join(
	REGISTRY_LIBRARIES_DIRECTORY,
	CONSOLE_LIBRARY_NAME,
);
const STRING_LIBRARY_DIRECTORY = join(
	TYPE_LIBRARY_DIRECTORY,
	STRING_LIBRARY_NAME,
);
const ARRAY_LIBRARY_DIRECTORY = join(
	TYPE_LIBRARY_DIRECTORY,
	ARRAY_LIBRARY_NAME,
);

const INT128_CAPABILITIES = [
	"arduino-nano",
	"arduino-uno",
	"nodemcu32s",
	"stm32-bluepill",
	"macos-arm64",
].map((platformName) => {
	return {
		platformName,
		expectedMode:
			platformName === "macos-arm64"
				? INT128_MODE.NATIVE
				: INT128_MODE.SOFTWARE,
	};
});

const FORBIDDEN_POSIX_CAPABILITIES = ["upload", "prepare", "detectPorts"];

const POSIX_PROJECT_NAME = "posix-project";
const POSIX_PROJECT_MAIN_FILE_NAME = "main.e95";
const POSIX_PROJECT_SOURCE_FILE_NAME = `${POSIX_PROJECT_NAME}${SOURCE_EXTENSION}`;
const POSIX_PROJECT_FIXTURE_DIRECTORY = new URL(
	"./fixtures/posix-project/",
	import.meta.url,
);
const SOFTWARE_F64_HEADER = "core_f64.h";
const SOFTWARE_INT128_HEADER = "core_int128.h";
const NATIVE_I128_ALIAS = "using i128 = __int128;";
const NATIVE_F64_ALIAS = "using f64 = double;";
const NATIVE_WORD_LET_DECLARATION = "i64 var1";
const C_MAIN_ENTRY = "int main(";
const FORBIDDEN_CPP_TOKENS = [
	"if constexpr",
	"std::string_view",
	"std::optional",
	"std::variant",
];

const CLANG_EXECUTABLE = "clang++";
const CXX11_STANDARD_FLAG = "-std=c++11";
const OPTIMIZATION_FLAG = "-O2";
const WARNING_FLAGS = ["-Wall", "-Wextra"];
const NO_EXCEPTIONS_FLAG = "-fno-exceptions";
const NO_RTTI_FLAG = "-fno-rtti";
const OUTPUT_FLAG = "-o";
const ARTIFACTS_DIRECTORY_NAME = "artifacts";
const COMPILE_COMMAND = "compile";
const RUN_COMMAND = "run";
const NON_ZERO_EXIT_CODE = 7;
const INHERITED_STDIO = "inherit";
const DETACHED_CHILD = false;
const MISSING_EXECUTABLE_PROJECT_NAME = "missing-executable";
const SIGNAL_INTERRUPT = "SIGINT";
const SIGNAL_TERMINATE = "SIGTERM";
const SIGNAL_HANGUP = "SIGHUP";
const SIGNAL_KILL = "SIGKILL";
const FORWARDED_SIGNALS = [SIGNAL_INTERRUPT, SIGNAL_TERMINATE, SIGNAL_HANGUP];
const FAKE_CHILD_PID = 4242;
const SHORT_FORCED_TERMINATION_TIMEOUT_MILLISECONDS = 20;
const FORCED_TERMINATION_WAIT_MILLISECONDS = 80;
const EXECUTE_SPAWN_ERROR_MESSAGE = "spawn failed";
const SIGINT_EXIT_CODE = 130;
const SIGTERM_EXIT_CODE = 143;
const SIGHUP_EXIT_CODE = 129;
const CHILD_EXIT_EVENT = "exit";
const CHILD_ERROR_EVENT = "error";
const PROCESS_EXIT_EVENT = "exit";
const INTERRUPTED_OUTPUT = "Interrupted";
const E2E_PROJECT_NAME = "posix-interrupt-project";
const E2E_READY_OUTPUT = "ready";
const E2E_TIMEOUT_MILLISECONDS = 60000;
const E2E_ORPHAN_POLL_INTERVAL_MILLISECONDS = 50;
const E2E_ORPHAN_CHECK_ATTEMPTS = 40;
const PGREP_EXECUTABLE = "pgrep";
const PKILL_EXECUTABLE = "pkill";
const PROCESS_MATCH_FLAG = "-f";
const FORCE_KILL_FLAG = "-KILL";
const E2E_PROGRAM_SOURCE = `import { console } from '@embedito95/console'
import { sleep } from '@embedito95/async'

const setup = () => {}

const worker = async () => {
    while (true) {
        console.log("${E2E_READY_OUTPUT}")
        await sleep(50)
    }
}

const main = () => {
    setup()
    worker()
}

main()
`;
const GREETING_OUTPUT = "Hello World!";
const HERMETIC_PROJECT_NAME = "hermetic-project";
const HERMETIC_SOURCE_FILE_NAME = `${HERMETIC_PROJECT_NAME}${SOURCE_EXTENSION}`;
const HERMETIC_LIBRARY_FILE_NAME = `core_string${SOURCE_EXTENSION}`;
const HERMETIC_COMPILER_STDERR = "hermetic compiler failure";
const SYNTAX_ONLY_FLAG = "-fsyntax-only";
const INCLUDE_DIRECTORY_FLAG = "-I";
const CLANG_VERSION_FLAG = "--version";
const FLASH_STRING_CALL = "_E95_FLASH_STRING(";
const POSIX_STRING_LIBRARY_NAME = "string";
const POSIX_ARRAY_LIBRARY_NAME = "array";
const ARRAY_HEADER_INCLUDE = '#include "core_array.h"';
const STRING_HEADER_INCLUDE = '#include "core_string.h"';
const TIME_HEADER_INCLUDE = '#include "core_time.h"';
const ASYNC_HEADER_INCLUDE = '#include "core_async.h"';
const INCLUDE_MATRIX_DIRECTORY_NAME = "include-matrix";
const INCLUDE_MATRIX_CASES = [
	{ name: "array-only", contents: `${ARRAY_HEADER_INCLUDE}\n` },
	{ name: "string-only", contents: `${STRING_HEADER_INCLUDE}\n` },
	{
		name: "array-then-string",
		contents: `${ARRAY_HEADER_INCLUDE}\n${STRING_HEADER_INCLUDE}\n`,
	},
	{
		name: "string-then-array",
		contents: `${STRING_HEADER_INCLUDE}\n${ARRAY_HEADER_INCLUDE}\n`,
	},
	{ name: "time-only", contents: `${TIME_HEADER_INCLUDE}\n` },
	{ name: "async-only", contents: `${ASYNC_HEADER_INCLUDE}\n` },
	{
		name: "async-then-time",
		contents: `${ASYNC_HEADER_INCLUDE}\n${TIME_HEADER_INCLUDE}\n`,
	},
	{
		name: "time-then-async",
		contents: `${TIME_HEADER_INCLUDE}\n${ASYNC_HEADER_INCLUDE}\n`,
	},
];
const HOST_GREETING_CONSTANT =
	'const core_string::String GREETING = core_string::String("Hello World!");';
const HOST_FAREWELL_CONSTANT =
	'const core_string::String byecito = core_string::String("Bye!");';
const HOST_LOCAL_GREETING =
	'core_string::String localGreeting = "Hello from main";';
const HOST_LOCAL_FAREWELL =
	'core_string::String localFarewell = "Bye from main";';

const runProcess = promisify(execFile);

const HOST_TYPE_HEADER = join(
	CORE_LIBRARIES_DIRECTORY_NAME,
	TYPE_LIBRARY_NAME,
	BUILD_DIRECTORY_NAME,
	`${LIBRARY_FILE_PREFIX}${TYPE_LIBRARY_NAME}${HEADER_EXTENSION}`,
);

const findPlatform = (platformName) => {
	return platforms.find((platform) => {
		return platform.name === platformName;
	});
};

const artifactFileName = (libraryName, extension) => {
	return `${LIBRARY_FILE_PREFIX}${libraryName}${extension}`;
};

const findArtifactPath = (buildDirectory, libraryName, extension) => {
	return join(buildDirectory, artifactFileName(libraryName, extension));
};

const installTypeLibraryForPlatform = async (platform) => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), `embedito95-posix-${platform.name}-`),
	);
	await installLibrary({
		sourceDirectory: REGISTRY_LIBRARIES_DIRECTORY,
		libraryName: TYPE_LIBRARY_NAME,
		projectPath: projectDirectory,
		platform,
		enumStyle: strategies[platform.strategy]?.enumStyle,
	});

	return {
		projectDirectory,
		buildDirectory: join(
			projectDirectory,
			CORE_LIBRARIES_DIRECTORY_NAME,
			TYPE_LIBRARY_NAME,
			BUILD_DIRECTORY_NAME,
		),
	};
};

const readTypeHeader = (projectDirectory) => {
	return readFileSync(join(projectDirectory, HOST_TYPE_HEADER), UTF8);
};

const checkInt128Capabilities = () => {
	return INT128_CAPABILITIES.map(({ platformName, expectedMode }) => {
		return expectEqual(
			`platform ${platformName} declares int128 as ${expectedMode}`,
			findPlatform(platformName)?.int128,
			expectedMode,
		);
	});
};

const checkInt128AutoImportIsConditioned = () => {
	const configuration = JSON.parse(readFileSync(INT128_CONFIG_PATH, UTF8));

	return [
		expectEqual(
			"int128 auto-import is conditioned to the software int128 capability",
			JSON.stringify(configuration.autoImport),
			JSON.stringify({ platform: { int128: INT128_MODE.SOFTWARE } }),
		),
	];
};

const checkAsyncAutoImportIsConditioned = () => {
	const configuration = JSON.parse(
		readFileSync(ASYNC_CONFIGURATION_PATH, UTF8),
	);
	const platform = findPlatform(MACOS_ARM64_PLATFORM);

	return [
		expectEqual(
			"async auto-import is conditioned to the scheduler capability",
			JSON.stringify(configuration.autoImport),
			JSON.stringify({ platform: { async: POSIX_ASYNC_CAPABILITY } }),
		),
		expectEqual(
			"macos-arm64 declares the scheduler async capability",
			platform?.async,
			POSIX_ASYNC_CAPABILITY,
		),
	];
};

const BOARD_PLATFORM_NAMES = [
	"arduino-nano",
	"arduino-uno",
	"nodemcu32s",
	"stm32-bluepill",
];

const checkBoardsKeepTheirAsyncSurface = () => {
	return BOARD_PLATFORM_NAMES.map((platformName) => {
		const platform = findPlatform(platformName);
		return expectEqual(
			`${platformName} does not declare the scheduler async capability`,
			platform?.async,
			undefined,
		);
	});
};

const writeAsyncAutoImportFixture = (projectDirectory) => {
	const libraryDirectory = join(
		projectDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		ASYNC_LIBRARY_NAME,
	);
	mkdirSync(libraryDirectory, { recursive: true });
	writeFileSync(
		join(libraryDirectory, CONFIG_FILE),
		readFileSync(ASYNC_CONFIGURATION_PATH, UTF8),
		UTF8,
	);
};

const checkAsyncAutoImportBehavior = async () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "embedito95-posix-auto-import-"),
	);
	writeAsyncAutoImportFixture(projectDirectory);
	const hostPlatform = findPlatform(MACOS_ARM64_PLATFORM);
	const boardPlatform = findPlatform("arduino-nano");

	try {
		const hostModules = await loadLibraryModules(
			[],
			hostPlatform.strategy,
			projectDirectory,
			hostPlatform,
		);
		const boardModules = await loadLibraryModules(
			[],
			boardPlatform.strategy,
			projectDirectory,
			boardPlatform,
		);

		return [
			expectEqual(
				"macos-arm64 auto-imports async through the scheduler capability",
				Boolean(hostModules.modules[ASYNC_LIBRARY_NAME]),
				true,
			),
			expectEqual(
				"macos-arm64 auto-imports the async time dependency",
				Boolean(hostModules.modules[TIME_LIBRARY_NAME]),
				true,
			),
			expectEqual(
				"arduino-nano does not auto-import async",
				Boolean(boardModules.modules[ASYNC_LIBRARY_NAME]),
				false,
			),
			expectEqual(
				"arduino-nano does not auto-import time through async",
				Boolean(boardModules.modules[TIME_LIBRARY_NAME]),
				false,
			),
		];
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

const checkPosixLibraryDefinitions = async () => {
	const typeDefinition = await loadLibraryDefinition({
		libraryDirectory: TYPE_LIBRARY_DIRECTORY,
		target: POSIX_STRATEGY_NAME,
	});
	const f64Definition = await loadLibraryDefinition({
		libraryDirectory: F64_LIBRARY_DIRECTORY,
		target: POSIX_STRATEGY_NAME,
	});
	const int128Definition = await loadLibraryDefinition({
		libraryDirectory: INT128_LIBRARY_DIRECTORY,
		target: POSIX_STRATEGY_NAME,
	});
	const stringDefinition = await loadLibraryDefinition({
		libraryDirectory: STRING_LIBRARY_DIRECTORY,
		target: POSIX_STRATEGY_NAME,
	});
	const arrayDefinition = await loadLibraryDefinition({
		libraryDirectory: ARRAY_LIBRARY_DIRECTORY,
		target: POSIX_STRATEGY_NAME,
	});
	const consoleDefinition = await loadLibraryDefinition({
		libraryDirectory: CONSOLE_LIBRARY_DIRECTORY,
		target: POSIX_STRATEGY_NAME,
	});
	const timeDefinition = await loadLibraryDefinition({
		libraryDirectory: TIME_LIBRARY_DIRECTORY,
		target: POSIX_STRATEGY_NAME,
	});
	const asyncDefinition = await loadLibraryDefinition({
		libraryDirectory: ASYNC_LIBRARY_DIRECTORY,
		target: POSIX_STRATEGY_NAME,
	});

	return [
		expectEqual(
			"posix exposes the type library definition",
			typeDefinition?.name,
			POSIX_STRATEGY_NAME,
		),
		expectEqual(
			"posix exposes the host string runtime definition",
			stringDefinition?.name,
			POSIX_STRATEGY_NAME,
		),
		expectEqual(
			"posix exposes the host array runtime definition",
			arrayDefinition?.name,
			POSIX_STRATEGY_NAME,
		),
		expectEqual(
			"posix exposes the host console runtime definition",
			consoleDefinition?.name,
			POSIX_STRATEGY_NAME,
		),
		expectEqual(
			"posix exposes the host time runtime definition",
			timeDefinition?.name,
			POSIX_STRATEGY_NAME,
		),
		expectEqual(
			"posix time runtime depends on the type runtime",
			timeDefinition?.dependencies?.join(","),
			TYPE_LIBRARY_NAME,
		),
		expectEqual(
			"posix exposes the host async runtime definition",
			asyncDefinition?.name,
			POSIX_STRATEGY_NAME,
		),
		expectEqual(
			"posix async runtime depends on the time runtime",
			asyncDefinition?.dependencies?.join(","),
			TIME_LIBRARY_NAME,
		),
		expectEqual(
			"posix has no software f64 library definition",
			f64Definition,
			null,
		),
		expectEqual(
			"posix has no software int128 library definition",
			int128Definition,
			null,
		),
	];
};

const createClangLookup = ({ available }) => {
	return () => {
		return { status: available ? 0 : 1 };
	};
};

const checkPosixStrategySurface = async () => {
	const platform = findPlatform(MACOS_ARM64_PLATFORM);
	const strategy = strategies[platform.strategy];
	const availableRequirements = await ensurePlatformRequirements({
		platform,
		spawnSync: createClangLookup({ available: true }),
	});
	const missingRequirements = await ensurePlatformRequirements({
		platform,
		spawnSync: createClangLookup({ available: false }),
	});
	const forbiddenCapabilities = FORBIDDEN_POSIX_CAPABILITIES.filter(
		(capability) => {
			return typeof strategy?.[capability] !== "undefined";
		},
	);

	return [
		expectEqual(
			"macos-arm64 resolves to the posix strategy",
			platform.strategy,
			POSIX_STRATEGY_NAME,
		),
		expectEqual(
			"posix declares the enum enumStyle consumed by copyLibraries",
			strategy?.enumStyle,
			POSIX_ENUM_STYLE,
		),
		expectEqual(
			"posix declares the display name shown by doctor",
			strategy?.displayName,
			POSIX_DISPLAY_NAME,
		),
		expectEqual(
			"posix exposes the generate capability consumed by build",
			typeof strategy?.generate,
			"function",
		),
		expectEqual(
			"posix exposes the compile capability consumed by compile",
			typeof strategy?.compile,
			"function",
		),
		expectEqual(
			"posix exposes the execute capability consumed by run",
			typeof strategy?.execute,
			"function",
		),
		expectEqual(
			"posix declares the C++ source extension used by build output",
			strategy?.extension,
			SOURCE_EXTENSION,
		),
		expectEqual(
			"posix declares the C++ main entry used by codegen",
			strategy?.mainEntry,
			"int main",
		),
		expectEqual(
			"posix does not expose unsupported platform capabilities",
			forbiddenCapabilities.join(","),
			"",
		),
		expectEqual(
			"init reports the host compiler requirement",
			availableRequirements[0]?.label,
			PLATFORM_TOOLCHAIN_LABEL,
		),
		expectEqual(
			"macOS checks only the host compiler and no board firmware",
			availableRequirements.length,
			1,
		),
		expectEqual(
			"init keeps the platform toolchain requirement satisfied when clang++ is available",
			availableRequirements[0]?.satisfied,
			true,
		),
		expectEqual(
			"init keeps the toolchain install hint for a missing clang++",
			missingRequirements[0]?.fixHint,
			CLANG_NOT_FOUND_HINT,
		),
		expectEqual(
			"init marks the platform toolchain requirement unsatisfied without clang++",
			missingRequirements[0]?.satisfied,
			false,
		),
	];
};

const checkPosixTypeArtifacts = async () => {
	const platform = findPlatform(MACOS_ARM64_PLATFORM);
	const { projectDirectory, buildDirectory } =
		await installTypeLibraryForPlatform(platform);

	try {
		const header = readTypeHeader(projectDirectory);

		return [
			expectEqual(
				"posix generates the type header",
				existsSync(
					findArtifactPath(
						buildDirectory,
						POSIX_TYPE_ARTIFACT_NAME,
						HEADER_EXTENSION,
					),
				),
				true,
			),
			expectEqual(
				"posix maps f64 to the native double",
				header.includes("using f64 = double;"),
				true,
			),
			expectEqual(
				"posix maps i128 to the native __int128",
				header.includes("using i128 = __int128;"),
				true,
			),
			expectEqual(
				"posix maps u128 to the native unsigned __int128",
				header.includes("using u128 = unsigned __int128;"),
				true,
			),
			expectEqual(
				"posix type header does not include the f64 software runtime",
				header.includes("core_f64.h"),
				false,
			),
			expectEqual(
				"posix type header does not include the int128 software runtime",
				header.includes("core_int128.h"),
				false,
			),
			expectEqual(
				"posix type header includes the host array runtime",
				header.includes('#include "core_array.h"'),
				true,
			),
			expectEqual(
				"posix type header includes the host string runtime",
				header.includes('#include "core_string.h"'),
				true,
			),
			expectEqual(
				"posix does not generate the f64 software header",
				existsSync(
					findArtifactPath(buildDirectory, F64_LIBRARY_NAME, HEADER_EXTENSION),
				),
				false,
			),
			expectEqual(
				"posix does not generate the f64 software source",
				existsSync(
					findArtifactPath(buildDirectory, F64_LIBRARY_NAME, SOURCE_EXTENSION),
				),
				false,
			),
			expectEqual(
				"posix does not generate the int128 software header",
				existsSync(
					findArtifactPath(
						buildDirectory,
						INT128_LIBRARY_NAME,
						HEADER_EXTENSION,
					),
				),
				false,
			),
			expectEqual(
				"posix does not generate the int128 software source",
				existsSync(
					findArtifactPath(
						buildDirectory,
						INT128_LIBRARY_NAME,
						SOURCE_EXTENSION,
					),
				),
				false,
			),
		];
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

const checkArduinoTypeArtifactsAreUnchanged = async () => {
	const platform = findPlatform("arduino-nano");
	const { projectDirectory, buildDirectory } =
		await installTypeLibraryForPlatform(platform);

	try {
		const header = readTypeHeader(projectDirectory);

		return [
			expectEqual(
				"arduino-nano keeps generating the f64 software header",
				existsSync(
					findArtifactPath(buildDirectory, F64_LIBRARY_NAME, HEADER_EXTENSION),
				),
				true,
			),
			expectEqual(
				"arduino-nano keeps generating the f64 software source",
				existsSync(
					findArtifactPath(buildDirectory, F64_LIBRARY_NAME, SOURCE_EXTENSION),
				),
				true,
			),
			expectEqual(
				"arduino-nano type header keeps including the f64 software runtime",
				header.includes("#include <core_f64.h>"),
				true,
			),
			expectEqual(
				"arduino-nano maps f64 to the software type",
				header.includes("using f64 = _e95_f64;"),
				true,
			),
			expectEqual(
				"arduino-nano keeps generating the int128 software header",
				existsSync(
					findArtifactPath(
						buildDirectory,
						INT128_LIBRARY_NAME,
						HEADER_EXTENSION,
					),
				),
				true,
			),
			expectEqual(
				"arduino-nano type header keeps including the int128 software runtime",
				header.includes("#include <core_int128.h>"),
				true,
			),
		];
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

const checkStm32TypeArtifactsAreUnchanged = async () => {
	const platform = findPlatform("stm32-bluepill");
	const { projectDirectory, buildDirectory } =
		await installTypeLibraryForPlatform(platform);

	try {
		const header = readTypeHeader(projectDirectory);

		return [
			expectEqual(
				"stm32-bluepill keeps the native double type",
				header.includes("using f64 = double;"),
				true,
			),
			expectEqual(
				"stm32-bluepill does not generate the f64 software header",
				existsSync(
					findArtifactPath(buildDirectory, F64_LIBRARY_NAME, HEADER_EXTENSION),
				),
				false,
			),
			expectEqual(
				"stm32-bluepill keeps generating the int128 software header",
				existsSync(
					findArtifactPath(
						buildDirectory,
						INT128_LIBRARY_NAME,
						HEADER_EXTENSION,
					),
				),
				true,
			),
			expectEqual(
				"stm32-bluepill keeps generating the int128 software source",
				existsSync(
					findArtifactPath(
						buildDirectory,
						INT128_LIBRARY_NAME,
						SOURCE_EXTENSION,
					),
				),
				true,
			),
			expectEqual(
				"stm32-bluepill type header keeps including the int128 software runtime",
				header.includes("#include <core_int128.h>"),
				true,
			),
		];
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

const EXECUTABLE_FILE_MODE = 0o755;

const writeHermeticProject = (projectDirectory) => {
	writeFileSync(
		join(projectDirectory, HERMETIC_SOURCE_FILE_NAME),
		"int main() { return 0; }\n",
		UTF8,
	);
	const libraryDirectory = join(
		projectDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		TYPE_LIBRARY_NAME,
	);
	mkdirSync(libraryDirectory, { recursive: true });
	writeFileSync(join(libraryDirectory, HERMETIC_LIBRARY_FILE_NAME), "", UTF8);
	return { libraryDirectory };
};

const createHermeticShared = ({ calls }) => {
	return {
		renderCyclesDefineArgument: shared.renderCyclesDefineArgument,
		runSpawnedProcess: async (command, args) => {
			calls.push({ command, args });
			const outputIndex = args.indexOf(OUTPUT_FLAG);
			const outputPath = args[outputIndex + 1];
			writeFileSync(outputPath, "", { mode: EXECUTABLE_FILE_MODE });
			return { code: 0, stdout: "", stderr: "" };
		},
	};
};

const createFailingShared = ({ stderr }) => {
	return {
		renderCyclesDefineArgument: shared.renderCyclesDefineArgument,
		runSpawnedProcess: async () => {
			return { code: 1, stdout: "", stderr };
		},
	};
};

const captureCompileError = async (options) => {
	try {
		await strategies[POSIX_STRATEGY_NAME].compile(options);
		return null;
	} catch (error) {
		return error.message;
	}
};

const createFakeChildKill = ({ child }) => {
	return (signal) => {
		child.receivedSignals.push(signal);
		return true;
	};
};

const createFakeChild = () => {
	const child = new EventEmitter();
	child.pid = FAKE_CHILD_PID;
	child.exitCode = null;
	child.signalCode = null;
	child.receivedSignals = [];
	child.kill = createFakeChildKill({ child });
	return child;
};

const createSpawnRecorder = ({ child, calls }) => {
	return (command, args, options) => {
		calls.push({ command, args, options });
		return child;
	};
};

const executeHermetic = ({
	projectDirectory,
	projectName,
	child,
	calls,
	forcedTerminationTimeoutMilliseconds,
}) => {
	return strategies[POSIX_STRATEGY_NAME].execute({
		outputDir: projectDirectory,
		projectName,
		spawn: createSpawnRecorder({ child, calls }),
		forcedTerminationTimeoutMilliseconds,
	});
};

const captureExecuteError = async (options) => {
	try {
		await strategies[POSIX_STRATEGY_NAME].execute(options);
		return null;
	} catch (error) {
		return error.message;
	}
};

const captureExecutionError = async ({ execution }) => {
	try {
		await execution;
		return null;
	} catch (error) {
		return error.message;
	}
};

const waitForMilliseconds = (milliseconds) => {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
};

const snapshotExecutionListeners = () => {
	return {
		signals: FORWARDED_SIGNALS.map((signal) => {
			return process.listenerCount(signal);
		}),
		processExit: process.listenerCount(PROCESS_EXIT_EVENT),
	};
};

const listenerSnapshotsMatch = ({ before, after }) => {
	return JSON.stringify(before) === JSON.stringify(after);
};

const checkExecutionExitCodeMapping = () => {
	return [
		expectEqual(
			"posix run keeps a zero exit code",
			resolveExecutionExitCode({ exitCode: 0, signal: null }),
			0,
		),
		expectEqual(
			"posix run keeps a non-zero exit code",
			resolveExecutionExitCode({
				exitCode: NON_ZERO_EXIT_CODE,
				signal: null,
			}),
			NON_ZERO_EXIT_CODE,
		),
		expectEqual(
			"posix run maps SIGINT to 130",
			resolveExecutionExitCode({ exitCode: null, signal: SIGNAL_INTERRUPT }),
			SIGINT_EXIT_CODE,
		),
		expectEqual(
			"posix run maps SIGTERM to 143",
			resolveExecutionExitCode({ exitCode: null, signal: SIGNAL_TERMINATE }),
			SIGTERM_EXIT_CODE,
		),
		expectEqual(
			"posix run maps SIGHUP to 129",
			resolveExecutionExitCode({ exitCode: null, signal: SIGNAL_HANGUP }),
			SIGHUP_EXIT_CODE,
		),
	];
};

const checkExecuteNormalExit = async ({ projectDirectory, executablePath }) => {
	const child = createFakeChild();
	const calls = [];
	const execution = executeHermetic({
		projectDirectory,
		projectName: HERMETIC_PROJECT_NAME,
		child,
		calls,
	});

	child.exitCode = NON_ZERO_EXIT_CODE;
	child.emit(CHILD_EXIT_EVENT, NON_ZERO_EXIT_CODE, null);

	const result = await execution;
	const call = calls[0];

	return [
		expectEqual(
			"posix execute returns the program exit code",
			result.exitCode,
			NON_ZERO_EXIT_CODE,
		),
		expectEqual(
			"posix execute reports no signal on a normal exit",
			result.signal,
			null,
		),
		expectEqual(
			"posix execute launches the executable from artifacts",
			call?.command,
			executablePath,
		),
		expectEqual(
			"posix execute passes no extra arguments",
			call?.args.join(","),
			"",
		),
		expectEqual(
			"posix execute inherits stdin, stdout and stderr",
			call?.options.stdio,
			INHERITED_STDIO,
		),
		expectEqual(
			"posix execute keeps the child in the foreground group",
			call?.options.detached,
			DETACHED_CHILD,
		),
	];
};

const checkExecuteMissingExecutable = async ({ projectDirectory }) => {
	const child = createFakeChild();
	const missingExecutableError = await captureExecuteError({
		outputDir: projectDirectory,
		projectName: MISSING_EXECUTABLE_PROJECT_NAME,
		spawn: createSpawnRecorder({ child, calls: [] }),
	});

	return [
		expectEqual(
			"posix execute reports a missing executable with the compile hint",
			missingExecutableError?.includes("Run 'compile' first"),
			true,
		),
	];
};

const checkExecuteSpawnError = async ({ projectDirectory }) => {
	const child = createFakeChild();
	const execution = executeHermetic({
		projectDirectory,
		projectName: HERMETIC_PROJECT_NAME,
		child,
		calls: [],
	});

	child.emit(CHILD_ERROR_EVENT, new Error(EXECUTE_SPAWN_ERROR_MESSAGE));

	const errorMessage = await captureExecutionError({ execution });

	return [
		expectEqual(
			"posix execute surfaces a spawn error",
			errorMessage,
			EXECUTE_SPAWN_ERROR_MESSAGE,
		),
	];
};

const checkExecuteSignalForwarding = async ({ projectDirectory }) => {
	const child = createFakeChild();
	const before = snapshotExecutionListeners();
	const execution = executeHermetic({
		projectDirectory,
		projectName: HERMETIC_PROJECT_NAME,
		child,
		calls: [],
	});

	process.emit(SIGNAL_INTERRUPT);
	const receivedSignals = [...child.receivedSignals];
	child.emit(CHILD_EXIT_EVENT, null, SIGNAL_INTERRUPT);

	const result = await execution;
	const after = snapshotExecutionListeners();

	return [
		expectEqual(
			"posix execute forwards SIGINT to the child",
			receivedSignals.join(","),
			SIGNAL_INTERRUPT,
		),
		expectEqual(
			"posix execute reports the interrupting signal",
			result.signal,
			SIGNAL_INTERRUPT,
		),
		expectEqual(
			"posix execute reports no exit code when interrupted",
			result.exitCode,
			null,
		),
		expectEqual(
			"posix execute removes its listeners after the run",
			listenerSnapshotsMatch({ before, after }),
			true,
		),
	];
};

const checkExecuteForcedTermination = async ({ projectDirectory }) => {
	const child = createFakeChild();
	const execution = executeHermetic({
		projectDirectory,
		projectName: HERMETIC_PROJECT_NAME,
		child,
		calls: [],
		forcedTerminationTimeoutMilliseconds:
			SHORT_FORCED_TERMINATION_TIMEOUT_MILLISECONDS,
	});

	process.emit(SIGNAL_TERMINATE);
	await waitForMilliseconds(FORCED_TERMINATION_WAIT_MILLISECONDS);
	const receivedSignals = [...child.receivedSignals];
	child.emit(CHILD_EXIT_EVENT, null, SIGNAL_KILL);

	const result = await execution;

	return [
		expectEqual(
			"posix execute forwards SIGTERM to the child",
			receivedSignals[0],
			SIGNAL_TERMINATE,
		),
		expectEqual(
			"posix execute escalates to SIGKILL after the timeout",
			receivedSignals.includes(SIGNAL_KILL),
			true,
		),
		expectEqual(
			"posix execute keeps the received signal after SIGKILL",
			result.signal,
			SIGNAL_TERMINATE,
		),
	];
};

const checkExecuteDeadChild = async ({ projectDirectory }) => {
	const child = createFakeChild();
	child.exitCode = 0;
	const execution = executeHermetic({
		projectDirectory,
		projectName: HERMETIC_PROJECT_NAME,
		child,
		calls: [],
	});

	process.emit(SIGNAL_INTERRUPT);
	const receivedSignals = [...child.receivedSignals];
	child.emit(CHILD_EXIT_EVENT, 0, null);

	const result = await execution;

	return [
		expectEqual(
			"posix execute does not signal an already dead child",
			receivedSignals.length,
			0,
		),
		expectEqual(
			"posix execute still reports the dead child exit code",
			result.exitCode,
			0,
		),
	];
};

const checkPosixExecute = async () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "embedito95-posix-execute-"),
	);

	try {
		const artifactsDirectory = join(projectDirectory, ARTIFACTS_DIRECTORY_NAME);
		const executablePath = join(artifactsDirectory, HERMETIC_PROJECT_NAME);
		mkdirSync(artifactsDirectory, { recursive: true });
		writeFileSync(executablePath, "", { mode: EXECUTABLE_FILE_MODE });

		return [
			...checkExecutionExitCodeMapping(),
			...(await checkExecuteNormalExit({ projectDirectory, executablePath })),
			...(await checkExecuteSpawnError({ projectDirectory })),
			...(await checkExecuteSignalForwarding({ projectDirectory })),
			...(await checkExecuteForcedTermination({ projectDirectory })),
			...(await checkExecuteDeadChild({ projectDirectory })),
			...(await checkExecuteMissingExecutable({ projectDirectory })),
		];
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

const checkPosixCompile = async () => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "embedito95-posix-compile-"),
	);

	try {
		const { libraryDirectory } = writeHermeticProject(projectDirectory);
		const calls = [];
		await strategies[POSIX_STRATEGY_NAME].compile({
			outputDir: projectDirectory,
			projectName: HERMETIC_PROJECT_NAME,
			shared: createHermeticShared({ calls }),
			spawnSync: createClangLookup({ available: true }),
			log: () => {},
		});

		const executablePath = join(
			projectDirectory,
			ARTIFACTS_DIRECTORY_NAME,
			HERMETIC_PROJECT_NAME,
		);
		const compileArguments = calls[0]?.args ?? [];

		const missingClangError = await captureCompileError({
			outputDir: projectDirectory,
			projectName: HERMETIC_PROJECT_NAME,
			shared: createFailingShared({ stderr: "" }),
			spawnSync: createClangLookup({ available: false }),
			log: () => {},
		});
		const failedCompileError = await captureCompileError({
			outputDir: projectDirectory,
			projectName: HERMETIC_PROJECT_NAME,
			shared: createFailingShared({ stderr: HERMETIC_COMPILER_STDERR }),
			spawnSync: createClangLookup({ available: true }),
			log: () => {},
		});

		return [
			expectEqual(
				"posix compile links the executable into artifacts",
				existsSync(executablePath),
				true,
			),
			expectEqual(
				"posix compile uses the C++11 standard",
				compileArguments.includes(CXX11_STANDARD_FLAG),
				true,
			),
			expectEqual(
				"posix compile enables optimization",
				compileArguments.includes(OPTIMIZATION_FLAG),
				true,
			),
			expectEqual(
				"posix compile enables the warning flags",
				WARNING_FLAGS.every((flag) => {
					return compileArguments.includes(flag);
				}),
				true,
			),
			expectEqual(
				"posix compile disables exceptions and RTTI",
				compileArguments.includes(NO_EXCEPTIONS_FLAG) &&
					compileArguments.includes(NO_RTTI_FLAG),
				true,
			),
			expectEqual(
				"posix compile compiles the project source",
				compileArguments.includes(
					join(projectDirectory, HERMETIC_SOURCE_FILE_NAME),
				),
				true,
			),
			expectEqual(
				"posix compile compiles the library sources",
				compileArguments.includes(
					join(libraryDirectory, HERMETIC_LIBRARY_FILE_NAME),
				),
				true,
			),
			expectEqual(
				"posix compile adds the library directory to the include path",
				compileArguments.includes(libraryDirectory),
				true,
			),
			expectEqual(
				"posix compile reports the missing clang++ with the install hint",
				missingClangError,
				CLANG_NOT_FOUND_HINT,
			),
			expectEqual(
				"posix compile surfaces the compiler stderr on failure",
				failedCompileError?.includes(HERMETIC_COMPILER_STDERR),
				true,
			),
		];
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

const runPosixProjectCommand = async ({
	projectDirectory,
	command,
	timeout,
}) => {
	try {
		const result = await runProcess(NODE_EXECUTABLE, [CLI_PATH, command], {
			cwd: projectDirectory,
			env: { ...process.env, INIT_CWD: projectDirectory },
			encoding: UTF8,
			timeout,
		});
		return { succeeded: true, output: `${result.stdout}${result.stderr}` };
	} catch (error) {
		return {
			succeeded: false,
			output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
		};
	}
};

const spawnCliRun = ({ projectDirectory }) => {
	return spawn(NODE_EXECUTABLE, [CLI_PATH, RUN_COMMAND], {
		cwd: projectDirectory,
		env: { ...process.env, INIT_CWD: projectDirectory },
	});
};

const interruptCliWhenExecutableRuns = ({
	projectDirectory,
	executablePath,
	signal,
}) => {
	return new Promise((resolve, reject) => {
		const child = spawnCliRun({ projectDirectory });
		let output = "";
		let interrupted = false;
		let timeoutTimer = null;
		let pollTimer = null;

		const stopTimers = () => {
			if (timeoutTimer !== null) {
				clearTimeout(timeoutTimer);
				timeoutTimer = null;
			}
			if (pollTimer !== null) {
				clearTimeout(pollTimer);
				pollTimer = null;
			}
		};

		const interruptOnce = () => {
			if (interrupted) {
				return;
			}
			interrupted = true;
			stopTimers();
			child.kill(signal);
		};

		const pollExecutable = async () => {
			if (interrupted) {
				return;
			}
			if (await hasExecutableProcess({ executablePath })) {
				interruptOnce();
				return;
			}
			pollTimer = setTimeout(
				pollExecutable,
				E2E_ORPHAN_POLL_INTERVAL_MILLISECONDS,
			);
		};

		const handleData = (chunk) => {
			output += chunk;
		};

		const handleError = (error) => {
			stopTimers();
			reject(error);
		};

		const handleExit = (code, exitSignal) => {
			stopTimers();
			resolve({ code, signal: exitSignal, output, interrupted });
		};

		timeoutTimer = setTimeout(() => {
			stopTimers();
			child.kill(SIGNAL_KILL);
			reject(new Error(`timed out waiting for ${RUN_COMMAND} to start`));
		}, E2E_TIMEOUT_MILLISECONDS);
		pollTimer = setTimeout(
			pollExecutable,
			E2E_ORPHAN_POLL_INTERVAL_MILLISECONDS,
		);

		child.stdout.on("data", handleData);
		child.stderr.on("data", handleData);
		child.on("error", handleError);
		child.on("exit", handleExit);
	});
};

const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;
const REGEXP_ESCAPE_REPLACEMENT = "\\$&";

const escapeRegularExpression = (text) => {
	return text.replace(REGEXP_SPECIAL_CHARACTERS, REGEXP_ESCAPE_REPLACEMENT);
};

const buildExecutableProcessPattern = ({ executablePath }) => {
	return `^${escapeRegularExpression(executablePath)}$`;
};

const hasExecutableProcess = async ({ executablePath }) => {
	try {
		const result = await runProcess(
			PGREP_EXECUTABLE,
			[PROCESS_MATCH_FLAG, buildExecutableProcessPattern({ executablePath })],
			{ encoding: UTF8 },
		);
		return result.stdout.trim() !== "";
	} catch {
		return false;
	}
};

const waitForExecutableExit = async ({ executablePath }) => {
	for (let attempt = 0; attempt < E2E_ORPHAN_CHECK_ATTEMPTS; attempt += 1) {
		if (!(await hasExecutableProcess({ executablePath }))) {
			return true;
		}

		await waitForMilliseconds(E2E_ORPHAN_POLL_INTERVAL_MILLISECONDS);
	}

	return false;
};

const killExecutableProcesses = async ({ executablePath }) => {
	try {
		await runProcess(
			PKILL_EXECUTABLE,
			[
				FORCE_KILL_FLAG,
				PROCESS_MATCH_FLAG,
				buildExecutableProcessPattern({ executablePath }),
			],
			{ encoding: UTF8 },
		);
	} catch {
		// pkill exits with a non-zero code when no process matches the pattern.
	}
};

const checkPosixRunInterruption = async ({ clangAvailable }) => {
	if (!clangAvailable) {
		return [
			expectEqual(
				"posix run interruption skipped because clang++ is unavailable",
				clangAvailable,
				false,
			),
		];
	}

	const projectDirectory = await createPosixProjectWithMain({
		projectName: E2E_PROJECT_NAME,
		mainSource: E2E_PROGRAM_SOURCE,
	});
	const executablePath = join(
		projectDirectory,
		BUILD_DIRECTORY_NAME,
		E2E_PROJECT_NAME,
		ARTIFACTS_DIRECTORY_NAME,
		E2E_PROJECT_NAME,
	);

	try {
		const interruptResult = await interruptCliWhenExecutableRuns({
			projectDirectory,
			executablePath,
			signal: SIGNAL_INTERRUPT,
		});
		const interruptExecutableExited = await waitForExecutableExit({
			executablePath,
		});
		const terminateResult = await interruptCliWhenExecutableRuns({
			projectDirectory,
			executablePath,
			signal: SIGNAL_TERMINATE,
		});
		const terminateExecutableExited = await waitForExecutableExit({
			executablePath,
		});

		return [
			expectEqual(
				"posix run exits with 130 on SIGINT",
				interruptResult.code,
				SIGINT_EXIT_CODE,
			),
			expectEqual(
				"posix run prints the interruption message on SIGINT",
				interruptResult.output.includes(INTERRUPTED_OUTPUT),
				true,
			),
			expectEqual(
				"posix run does not leave the executable running after SIGINT",
				interruptExecutableExited,
				true,
			),
			expectEqual(
				"posix run exits with 143 on SIGTERM",
				terminateResult.code,
				SIGTERM_EXIT_CODE,
			),
			expectEqual(
				"posix run prints the interruption message on SIGTERM",
				terminateResult.output.includes(INTERRUPTED_OUTPUT),
				true,
			),
			expectEqual(
				"posix run does not leave the executable running after SIGTERM",
				terminateExecutableExited,
				true,
			),
		];
	} finally {
		await killExecutableProcesses({ executablePath });
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

const runCompiledExecutable = async (executablePath) => {
	try {
		const result = await runProcess(executablePath, [], { encoding: UTF8 });
		return { succeeded: true, output: `${result.stdout}${result.stderr}` };
	} catch (error) {
		return {
			succeeded: false,
			output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
		};
	}
};

const readFileIfPresent = (path) => {
	return existsSync(path) ? readFileSync(path, UTF8) : "";
};

const isClangAvailable = async () => {
	try {
		await runProcess(CLANG_EXECUTABLE, [CLANG_VERSION_FLAG], {
			encoding: UTF8,
		});
		return true;
	} catch {
		return false;
	}
};

const runClangSyntaxCheck = async ({
	projectDirectory,
	buildDirectory,
	sourcePath,
}) => {
	try {
		await runProcess(
			CLANG_EXECUTABLE,
			[
				CXX11_STANDARD_FLAG,
				SYNTAX_ONLY_FLAG,
				INCLUDE_DIRECTORY_FLAG,
				buildDirectory,
				INCLUDE_DIRECTORY_FLAG,
				join(buildDirectory, CORE_LIBRARIES_DIRECTORY_NAME, TYPE_LIBRARY_NAME),
				INCLUDE_DIRECTORY_FLAG,
				join(buildDirectory, CORE_LIBRARIES_DIRECTORY_NAME, TIME_LIBRARY_NAME),
				INCLUDE_DIRECTORY_FLAG,
				join(buildDirectory, CORE_LIBRARIES_DIRECTORY_NAME, ASYNC_LIBRARY_NAME),
				sourcePath,
			],
			{ cwd: projectDirectory, encoding: UTF8 },
		);
		return { succeeded: true, output: "" };
	} catch (error) {
		return {
			succeeded: false,
			output: `${error.stdout ?? ""}${error.stderr ?? ""}`.trim(),
		};
	}
};

const writeIncludeMatrixCase = (projectDirectory, includeCase) => {
	const directory = join(projectDirectory, INCLUDE_MATRIX_DIRECTORY_NAME);
	mkdirSync(directory, { recursive: true });
	const sourcePath = join(directory, `${includeCase.name}.cpp`);
	writeFileSync(sourcePath, includeCase.contents, UTF8);
	return sourcePath;
};

const runIncludeMatrixChecks = async ({ projectDirectory, buildDirectory }) => {
	const checks = [];
	for (const includeCase of INCLUDE_MATRIX_CASES) {
		const sourcePath = writeIncludeMatrixCase(projectDirectory, includeCase);
		const result = await runClangSyntaxCheck({
			projectDirectory,
			buildDirectory,
			sourcePath,
		});
		checks.push(
			expectEqual(
				`posix core headers compile in ${includeCase.name} include order${result.succeeded ? "" : `: ${result.output}`}`,
				result.succeeded,
				true,
			),
		);
	}
	return checks;
};

const runPosixCompilationChecks = async ({
	projectDirectory,
	buildDirectory,
	generatedSourcePath,
	stringSourcePath,
	consoleSourcePath,
	timeSourcePath,
	clangAvailable,
}) => {
	if (!clangAvailable) {
		return [
			expectEqual(
				"posix clang++ syntax check skipped because clang++ is unavailable",
				clangAvailable,
				false,
			),
		];
	}

	const generatedSourceCheck = await runClangSyntaxCheck({
		projectDirectory,
		buildDirectory,
		sourcePath: generatedSourcePath,
	});
	const stringSourceCheck = await runClangSyntaxCheck({
		projectDirectory,
		buildDirectory,
		sourcePath: stringSourcePath,
	});
	const consoleSourceCheck = await runClangSyntaxCheck({
		projectDirectory,
		buildDirectory,
		sourcePath: consoleSourcePath,
	});
	const timeSourceCheck = await runClangSyntaxCheck({
		projectDirectory,
		buildDirectory,
		sourcePath: timeSourcePath,
	});
	const includeMatrixChecks = await runIncludeMatrixChecks({
		projectDirectory,
		buildDirectory,
	});

	return [
		expectEqual(
			`posix generated source passes clang++ -std=c++11 -fsyntax-only${generatedSourceCheck.succeeded ? "" : `: ${generatedSourceCheck.output}`}`,
			generatedSourceCheck.succeeded,
			true,
		),
		expectEqual(
			`posix core_string.cpp passes clang++ -std=c++11 -fsyntax-only${stringSourceCheck.succeeded ? "" : `: ${stringSourceCheck.output}`}`,
			stringSourceCheck.succeeded,
			true,
		),
		expectEqual(
			`posix core_console.cpp passes clang++ -std=c++11 -fsyntax-only${consoleSourceCheck.succeeded ? "" : `: ${consoleSourceCheck.output}`}`,
			consoleSourceCheck.succeeded,
			true,
		),
		expectEqual(
			`posix core_time.cpp passes clang++ -std=c++11 -fsyntax-only${timeSourceCheck.succeeded ? "" : `: ${timeSourceCheck.output}`}`,
			timeSourceCheck.succeeded,
			true,
		),
		...includeMatrixChecks,
	];
};

const installPosixCoreLibraries = async (projectDirectory, platform) => {
	for (const libraryName of [
		TYPE_LIBRARY_NAME,
		CONSOLE_LIBRARY_NAME,
		TIME_LIBRARY_NAME,
		ASYNC_LIBRARY_NAME,
	]) {
		await installLibrary({
			sourceDirectory: REGISTRY_LIBRARIES_DIRECTORY,
			libraryName,
			projectPath: projectDirectory,
			platform,
			enumStyle: strategies[platform.strategy]?.enumStyle,
		});
	}
};

const writePosixProjectConfiguration = (
	projectDirectory,
	projectName = POSIX_PROJECT_NAME,
) => {
	const configuration = {
		name: projectName,
		type: PROJECT_TYPE,
		embedito95Version: EMBEDITO95_PROJECT_VERSION,
		platform: MACOS_ARM64_PLATFORM,
		core: [
			POSIX_TYPE_PACKAGE_NAME,
			CONSOLE_PACKAGE_NAME,
			TIME_PACKAGE_NAME,
			ASYNC_PACKAGE_NAME,
		],
		libraries: [],
	};
	writeFileSync(
		join(projectDirectory, CONFIG_FILE),
		`${JSON.stringify(configuration, null, JSON_INDENTATION)}\n`,
		UTF8,
	);
};

const createPosixProjectWithMain = async ({ projectName, mainSource }) => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), "embedito95-posix-build-"),
	);
	const platform = findPlatform(MACOS_ARM64_PLATFORM);
	mkdirSync(projectDirectory, { recursive: true });
	writePosixProjectConfiguration(projectDirectory, projectName);
	writeFileSync(
		join(projectDirectory, POSIX_PROJECT_MAIN_FILE_NAME),
		mainSource,
		UTF8,
	);
	await installPosixCoreLibraries(projectDirectory, platform);
	return projectDirectory;
};

const createPosixProjectDirectory = async () => {
	return createPosixProjectWithMain({
		projectName: POSIX_PROJECT_NAME,
		mainSource: readFileSync(
			new URL(POSIX_PROJECT_MAIN_FILE_NAME, POSIX_PROJECT_FIXTURE_DIRECTORY),
			UTF8,
		),
	});
};

const runPosixCompileChecks = async ({
	projectDirectory,
	buildRootDirectory,
	clangAvailable,
}) => {
	if (!clangAvailable) {
		return [
			expectEqual(
				"posix compile skipped because clang++ is unavailable",
				clangAvailable,
				false,
			),
		];
	}

	const compileResult = await runPosixProjectCommand({
		projectDirectory,
		command: COMPILE_COMMAND,
	});
	const runResult = await runPosixProjectCommand({
		projectDirectory,
		command: RUN_COMMAND,
	});
	const executablePath = join(
		buildRootDirectory,
		ARTIFACTS_DIRECTORY_NAME,
		POSIX_PROJECT_NAME,
	);
	const executionResult = existsSync(executablePath)
		? await runCompiledExecutable(executablePath)
		: { succeeded: false, output: "" };

	return [
		expectEqual(
			"posix project compile succeeds with the compile capability",
			compileResult.succeeded,
			true,
		),
		expectEqual(
			"posix compile writes the native executable under artifacts",
			existsSync(executablePath),
			true,
		),
		expectEqual(
			"posix compiled executable prints the greeting",
			executionResult.output.trim(),
			GREETING_OUTPUT,
		),
		expectEqual("posix run command succeeds", runResult.succeeded, true),
		expectEqual(
			"posix run command prints the greeting",
			runResult.output.includes(GREETING_OUTPUT),
			true,
		),
	];
};

const checkPosixProjectBuild = async () => {
	const projectDirectory = await createPosixProjectDirectory();
	const buildRootDirectory = join(
		projectDirectory,
		BUILD_DIRECTORY_NAME,
		POSIX_PROJECT_NAME,
	);
	const generatedSourcePath = join(
		buildRootDirectory,
		POSIX_PROJECT_SOURCE_FILE_NAME,
	);
	const copiedTypeArtifactPath = join(
		buildRootDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		TYPE_LIBRARY_NAME,
		artifactFileName(TYPE_LIBRARY_NAME, HEADER_EXTENSION),
	);
	const copiedStringHeaderPath = join(
		buildRootDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		TYPE_LIBRARY_NAME,
		artifactFileName(POSIX_STRING_LIBRARY_NAME, HEADER_EXTENSION),
	);
	const copiedStringSourcePath = join(
		buildRootDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		TYPE_LIBRARY_NAME,
		artifactFileName(POSIX_STRING_LIBRARY_NAME, SOURCE_EXTENSION),
	);
	const copiedArrayHeaderPath = join(
		buildRootDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		TYPE_LIBRARY_NAME,
		artifactFileName(POSIX_ARRAY_LIBRARY_NAME, HEADER_EXTENSION),
	);
	const copiedConsoleHeaderPath = join(
		buildRootDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		CONSOLE_LIBRARY_NAME,
		artifactFileName(CONSOLE_LIBRARY_NAME, HEADER_EXTENSION),
	);
	const copiedConsoleSourcePath = join(
		buildRootDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		CONSOLE_LIBRARY_NAME,
		artifactFileName(CONSOLE_LIBRARY_NAME, SOURCE_EXTENSION),
	);
	const copiedTimeHeaderPath = join(
		buildRootDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		TIME_LIBRARY_NAME,
		artifactFileName(TIME_LIBRARY_NAME, HEADER_EXTENSION),
	);
	const copiedTimeSourcePath = join(
		buildRootDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		TIME_LIBRARY_NAME,
		artifactFileName(TIME_LIBRARY_NAME, SOURCE_EXTENSION),
	);
	const copiedAsyncHeaderPath = join(
		buildRootDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		ASYNC_LIBRARY_NAME,
		artifactFileName(ASYNC_LIBRARY_NAME, HEADER_EXTENSION),
	);
	const copiedObjectHeaderPath = join(
		buildRootDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		TYPE_LIBRARY_NAME,
		artifactFileName("object", HEADER_EXTENSION),
	);

	try {
		const buildResult = await runPosixProjectCommand({
			projectDirectory,
			command: BUILD_COMMAND,
		});
		const generatedSource = existsSync(generatedSourcePath)
			? readFileSync(generatedSourcePath, UTF8)
			: "";
		const copiedTypeArtifact = existsSync(copiedTypeArtifactPath)
			? readFileSync(copiedTypeArtifactPath, UTF8)
			: "";
		const copiedStringArtifact = readFileIfPresent(copiedStringHeaderPath);
		const copiedArrayArtifact = readFileIfPresent(copiedArrayHeaderPath);
		const copiedConsoleArtifact = readFileIfPresent(copiedConsoleHeaderPath);
		const copiedTimeHeader = readFileIfPresent(copiedTimeHeaderPath);
		const copiedTimeSource = readFileIfPresent(copiedTimeSourcePath);
		const copiedAsyncHeader = readFileIfPresent(copiedAsyncHeaderPath);
		const forbiddenCppTokens = FORBIDDEN_CPP_TOKENS.filter((token) => {
			return generatedSource.includes(token);
		});
		const clangAvailable = await isClangAvailable();
		const compilationCheckResults = await runPosixCompilationChecks({
			projectDirectory,
			buildDirectory: buildRootDirectory,
			generatedSourcePath,
			stringSourcePath: copiedStringSourcePath,
			consoleSourcePath: copiedConsoleSourcePath,
			timeSourcePath: copiedTimeSourcePath,
			clangAvailable,
		});
		const compileCheckResults = await runPosixCompileChecks({
			projectDirectory,
			buildRootDirectory,
			clangAvailable,
		});

		return [
			expectEqual(
				"posix project build succeeds with the generate capability",
				buildResult.succeeded,
				true,
			),
			expectEqual(
				"posix build writes the generated C++ source",
				existsSync(generatedSourcePath),
				true,
			),
			expectEqual(
				"posix build declares the C++ main entry",
				generatedSource.includes(C_MAIN_ENTRY),
				true,
			),
			expectEqual(
				"posix build emits the native i128 type",
				generatedSource.includes("i128"),
				true,
			),
			expectEqual(
				"posix build emits the native f64 type",
				generatedSource.includes("f64"),
				true,
			),
			expectEqual(
				"posix build widens untyped let to the 64-bit native word",
				generatedSource.includes(NATIVE_WORD_LET_DECLARATION),
				true,
			),
			expectEqual(
				"posix generated source does not include the f64 software runtime",
				generatedSource.includes(SOFTWARE_F64_HEADER),
				false,
			),
			expectEqual(
				"posix generated source does not include the int128 software runtime",
				generatedSource.includes(SOFTWARE_INT128_HEADER),
				false,
			),
			expectEqual(
				"posix generated source stays within the C++11 syntax floor",
				forbiddenCppTokens.join(","),
				"",
			),
			expectEqual(
				"posix build copies the native type artifact",
				copiedTypeArtifact.includes(NATIVE_F64_ALIAS),
				true,
			),
			expectEqual(
				"posix build copies the native i128 artifact",
				copiedTypeArtifact.includes(NATIVE_I128_ALIAS),
				true,
			),
			expectEqual(
				"posix copied type artifact does not include the f64 software runtime",
				copiedTypeArtifact.includes(SOFTWARE_F64_HEADER),
				false,
			),
			expectEqual(
				"posix copied type artifact does not include the int128 software runtime",
				copiedTypeArtifact.includes(SOFTWARE_INT128_HEADER),
				false,
			),
			expectEqual(
				"posix build emits the global GREETING constant as an ordinary String",
				generatedSource.includes(HOST_GREETING_CONSTANT),
				true,
			),
			expectEqual(
				"posix build emits the global byecito constant as an ordinary String",
				generatedSource.includes(HOST_FAREWELL_CONSTANT),
				true,
			),
			expectEqual(
				"posix build emits local string literals as ordinary String values",
				generatedSource.includes(HOST_LOCAL_GREETING) &&
					generatedSource.includes(HOST_LOCAL_FAREWELL),
				true,
			),
			expectEqual(
				"posix build does not emit flash strings",
				generatedSource.includes(FLASH_STRING_CALL),
				false,
			),
			expectEqual(
				"posix build generates the host string header",
				existsSync(copiedStringHeaderPath),
				true,
			),
			expectEqual(
				"posix build generates the host string source",
				existsSync(copiedStringSourcePath),
				true,
			),
			expectEqual(
				"posix build generates the host array header",
				existsSync(copiedArrayHeaderPath),
				true,
			),
			expectEqual(
				"posix string header reuses the shared string runtime",
				copiedStringArtifact.includes("namespace core_string"),
				true,
			),
			expectEqual(
				"posix array header reuses the shared array runtime",
				copiedArrayArtifact.includes("namespace core_array"),
				true,
			),
			expectEqual(
				"posix build includes the console runtime header",
				generatedSource.includes(CONSOLE_INCLUDE_LINE),
				true,
			),
			expectEqual(
				"posix build emits console.log as the core_console::log call",
				generatedSource.includes(CONSOLE_LOG_ARGUMENT),
				true,
			),
			expectEqual(
				"posix build generates the host console header",
				existsSync(copiedConsoleHeaderPath),
				true,
			),
			expectEqual(
				"posix build generates the host console source",
				existsSync(copiedConsoleSourcePath),
				true,
			),
			expectEqual(
				"posix console header declares the core_console namespace",
				copiedConsoleArtifact.includes("namespace core_console"),
				true,
			),
			expectEqual(
				"posix build generates the host time header",
				existsSync(copiedTimeHeaderPath),
				true,
			),
			expectEqual(
				"posix build generates the host time source",
				existsSync(copiedTimeSourcePath),
				true,
			),
			expectEqual(
				"posix time header declares the core_time namespace",
				copiedTimeHeader.includes("namespace core_time"),
				true,
			),
			expectEqual(
				"posix time source uses the monotonic clock",
				copiedTimeSource.includes("CLOCK_MONOTONIC"),
				true,
			),
			expectEqual(
				"posix time source waits with nanosleep",
				copiedTimeSource.includes("nanosleep("),
				true,
			),
			expectEqual(
				"posix build generates the host async header",
				existsSync(copiedAsyncHeaderPath),
				true,
			),
			expectEqual(
				"posix async header declares the core_async namespace",
				copiedAsyncHeader.includes("namespace core_async"),
				true,
			),
			expectEqual(
				"posix async header delegates sleep to core_time",
				copiedAsyncHeader.includes("core_time::delay"),
				true,
			),
			expectEqual(
				"posix build generates the bundled object runtime",
				existsSync(copiedObjectHeaderPath),
				true,
			),
			...compilationCheckResults,
			...compileCheckResults,
		];
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

const POSIX_TIME_PROJECT_NAME = "posix-time-project";
const POSIX_ASYNC_PROJECT_NAME = "posix-async-project";
const POSIX_TIME_PROGRAM_SOURCE = `import { console } from '@embedito95/console'
import { delay, getMillis, hasElapsed } from '@embedito95/time'

const setup = () => {}

const main = () => {
    setup()
    const start = getMillis()
    delay(40)
    console.log(hasElapsed(start, 20))
    console.log(hasElapsed(start, 100000))
}

main()
`;
const POSIX_ASYNC_PROGRAM_SOURCE = `import { console } from '@embedito95/console'
import { sleep } from '@embedito95/async'

const setup = () => {}

const worker = async () => {
    console.log("before")
    await sleep(50)
    console.log("after")
}

const main = () => {
    setup()
    console.log("start")
    worker()
    console.log("end")
}

main()
`;
const POSIX_TIME_EXPECTED_OUTPUT = "true\nfalse";
const POSIX_ASYNC_EXPECTED_OUTPUT = "start\nend\nbefore\nafter";
const POSIX_PROGRAM_TIMEOUT_MILLISECONDS = 5000;
const POSIX_TIME_MINIMUM_DURATION_MILLISECONDS = 30;
const POSIX_ASYNC_MINIMUM_DURATION_MILLISECONDS = 40;

const runPosixProgramCheck = async ({
	projectName,
	mainSource,
	expectedOutput,
	minimumDurationMilliseconds,
	clangAvailable,
}) => {
	if (!clangAvailable) {
		return [
			expectEqual(
				`${projectName} skipped because clang++ is unavailable`,
				clangAvailable,
				false,
			),
		];
	}

	const projectDirectory = await createPosixProjectWithMain({
		projectName,
		mainSource,
	});
	const buildRootDirectory = join(
		projectDirectory,
		BUILD_DIRECTORY_NAME,
		projectName,
	);
	const executablePath = join(
		buildRootDirectory,
		ARTIFACTS_DIRECTORY_NAME,
		projectName,
	);

	try {
		const buildResult = await runPosixProjectCommand({
			projectDirectory,
			command: BUILD_COMMAND,
			timeout: POSIX_PROGRAM_TIMEOUT_MILLISECONDS,
		});
		const compileResult = await runPosixProjectCommand({
			projectDirectory,
			command: COMPILE_COMMAND,
			timeout: POSIX_PROGRAM_TIMEOUT_MILLISECONDS,
		});
		const runResult = await runPosixProjectCommand({
			projectDirectory,
			command: RUN_COMMAND,
			timeout: POSIX_PROGRAM_TIMEOUT_MILLISECONDS,
		});
		const programStart = Date.now();
		const executionResult = existsSync(executablePath)
			? await runCompiledExecutable(executablePath)
			: { succeeded: false, output: "" };
		const elapsedMilliseconds = Date.now() - programStart;

		return [
			expectEqual(`${projectName} build succeeds`, buildResult.succeeded, true),
			expectEqual(
				`${projectName} compile succeeds`,
				compileResult.succeeded,
				true,
			),
			expectEqual(`${projectName} run succeeds`, runResult.succeeded, true),
			expectEqual(
				`${projectName} run prints the expected output`,
				runResult.output.trim().endsWith(expectedOutput),
				true,
			),
			expectEqual(
				`${projectName} executable prints the expected output`,
				executionResult.output.trim(),
				expectedOutput,
			),
			expectEqual(
				`${projectName} takes at least ${minimumDurationMilliseconds}ms`,
				elapsedMilliseconds >= minimumDurationMilliseconds,
				true,
			),
			expectEqual(
				`${projectName} terminates within the timeout`,
				elapsedMilliseconds < POSIX_PROGRAM_TIMEOUT_MILLISECONDS,
				true,
			),
		];
	} finally {
		rmSync(projectDirectory, { recursive: true, force: true });
	}
};

const FAKE_CLANG_FILE_NAME = "clang++";
const FAKE_CLANG_ROOT_PREFIX = "e95-clang-path-";
const FAKE_CLANG_TOOLS_DIRECTORY_NAME = "CommandLineTools";
const FAKE_CLANG_CONFIG_DIRECTORY_NAME = "config";
const FAKE_CLANG_CONFIG_FILE_NAME = "config.json";
const FAKE_CLANG_INVALID_CONFIG_FILE_NAME = "invalid-config.json";
const MACOS_PLATFORM_NAME = "darwin";

const createClangPathLookup = ({ executablePath }) => {
	return (command) => {
		return { status: command === executablePath ? 0 : 1, stdout: "" };
	};
};

const checkClangPathConfiguration = () => {
	const rootDirectory = mkdtempSync(join(tmpdir(), FAKE_CLANG_ROOT_PREFIX));
	const toolsDirectory = join(rootDirectory, FAKE_CLANG_TOOLS_DIRECTORY_NAME);
	const executablePath = join(toolsDirectory, FAKE_CLANG_FILE_NAME);
	const configDirectory = join(rootDirectory, FAKE_CLANG_CONFIG_DIRECTORY_NAME);
	const globalConfigFile = join(configDirectory, FAKE_CLANG_CONFIG_FILE_NAME);
	const invalidGlobalConfigFile = join(
		rootDirectory,
		FAKE_CLANG_INVALID_CONFIG_FILE_NAME,
	);

	mkdirSync(toolsDirectory, { recursive: true });
	writeFileSync(executablePath, "", { mode: EXECUTABLE_FILE_MODE });

	const spawnSync = createClangPathLookup({ executablePath });

	try {
		const stored = setClangPath({
			path: toolsDirectory,
			spawnSync,
			platform: MACOS_PLATFORM_NAME,
			globalConfigFile,
		});
		const resolved = findClangCompiler({
			spawnSync,
			platform: MACOS_PLATFORM_NAME,
			globalConfigFile,
		});
		const configuration = JSON.parse(readFileSync(globalConfigFile, UTF8));
		const rejected = setClangPath({
			path: join(rootDirectory, "missing"),
			spawnSync,
			platform: MACOS_PLATFORM_NAME,
			globalConfigFile: invalidGlobalConfigFile,
		});

		return [
			expectEqual(
				"doctor stores the clang++ executable from a tool directory",
				stored,
				true,
			),
			expectEqual(
				"doctor stores the resolved clang++ path in the global config",
				configuration[CLANG_PATH_CONFIG_KEY],
				executablePath,
			),
			expectEqual(
				"doctor reuses the configured clang++ path",
				resolved,
				executablePath,
			),
			expectEqual(
				"doctor rejects a path without a clang++ executable",
				rejected,
				false,
			),
		];
	} finally {
		rmSync(rootDirectory, { recursive: true, force: true });
	}
};

export const runPosixStrategyChecks = async () => {
	const clangAvailable = await isClangAvailable();
	return [
		...checkInt128Capabilities(),
		...checkInt128AutoImportIsConditioned(),
		...checkAsyncAutoImportIsConditioned(),
		...checkBoardsKeepTheirAsyncSurface(),
		...checkClangPathConfiguration(),
		...(await checkAsyncAutoImportBehavior()),
		...(await checkPosixLibraryDefinitions()),
		...(await checkPosixStrategySurface()),
		...(await checkPosixTypeArtifacts()),
		...(await checkPosixProjectBuild()),
		...(await checkPosixCompile()),
		...(await checkPosixExecute()),
		...(await checkPosixRunInterruption({ clangAvailable })),
		...(await checkArduinoTypeArtifactsAreUnchanged()),
		...(await checkStm32TypeArtifactsAreUnchanged()),
		...(await runPosixProgramCheck({
			projectName: POSIX_TIME_PROJECT_NAME,
			mainSource: POSIX_TIME_PROGRAM_SOURCE,
			expectedOutput: POSIX_TIME_EXPECTED_OUTPUT,
			minimumDurationMilliseconds: POSIX_TIME_MINIMUM_DURATION_MILLISECONDS,
			clangAvailable,
		})),
		...(await runPosixProgramCheck({
			projectName: POSIX_ASYNC_PROJECT_NAME,
			mainSource: POSIX_ASYNC_PROGRAM_SOURCE,
			expectedOutput: POSIX_ASYNC_EXPECTED_OUTPUT,
			minimumDurationMilliseconds: POSIX_ASYNC_MINIMUM_DURATION_MILLISECONDS,
			clangAvailable,
		})),
	];
};
