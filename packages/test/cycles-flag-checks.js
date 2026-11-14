// T-036: the refcount cycle collector switch reaches every translation unit
// through the generated `e95_config.h`, not through a `-DE95_CYCLES=0|1`
// compile argument. The platform compile strategies no longer inject the define
// (that would still leave one body per argument and bypass the config header);
// they rely on the header the build writes into the project, core, libraries
// and modules directories. These checks lock in the header rendering, the tree
// writer and the absence of the define argument in posix, arduino and stm32.
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { shared, UTF8 } from "embedito95-core";
import { strategies } from "embedito95-registry/strategies";
import { compile } from "../registry/src/strategies/stm32-ll/compile.js";
import { checkCollectorIsCompiledOutWhenDisabled } from "./cycles-runtime-checks.js";
import { expectEqual } from "./reporting.js";

const CYCLES_CONFIG_FILE_NAME = shared.CYCLES_CONFIG_FILE_NAME;
const CYCLES_ARGUMENT_PREFIX = "-DE95_CYCLES=";
const CYCLES_OFF_DEFINE = "#define E95_CYCLES 0";
const CYCLES_ON_DEFINE = "#define E95_CYCLES 1";
const CYCLES_GUARD_DEFINE = "#define E95_CONFIG_H";
const TEMPORARY_DIRECTORY_PREFIX = "embedito95-cycles-";
const EXECUTABLE_FILE_MODE = 0o755;
const HOST_PROJECT_NAME = "cycles-project";
const HOST_SOURCE_FILE_NAME = `${HOST_PROJECT_NAME}.cpp`;
const CORE_SOURCE_FILE_NAME = "core_mem.cpp";
const LIBRARY_SOURCE_FILE_NAME = "core_math.cpp";
const MODULE_SOURCE_FILE_NAME = "user_module.cpp";
const ASYNC_SOURCE_FILE_NAME = "async_task.cpp";
const CORE_DIRECTORY_NAME = "core";
const LIBRARIES_DIRECTORY_NAME = "libraries";
const MODULES_DIRECTORY_NAME = "modules";
const CORE_MODULE_DIRECTORY_NAME = "mem";
const LIBRARY_MODULE_DIRECTORY_NAME = "math";
const USER_MODULE_DIRECTORY_NAME = "user";
const ASYNC_MODULE_DIRECTORY_NAME = "async-task";
const CONFIG_TREE_DIRECTORY_NAMES = [
	`${CORE_DIRECTORY_NAME}/a`,
	`${LIBRARIES_DIRECTORY_NAME}/b`,
	`${MODULES_DIRECTORY_NAME}/c`,
];
const STM32_PROJECT_NAME = "cycles-stm32";
const STM32_TOOLCHAIN_DIRECTORY_NAME = "toolchain";
const STM32_FIRMWARE_DIRECTORY_NAME = "firmware";
const OBJECT_ARGUMENT = "-c";
const OUTPUT_ARGUMENT = "-o";
const ARDUINO_PLATFORM_NAME = "arduino-nano";
const ARDUINO_EXTRA_FLAGS_PREFIX = "build.extra_flags=";
const ARDUINO_FWRAPV_FLAG = "-fwrapv";
const ARDUINO_COMPILE_SIZES_OUTPUT = JSON.stringify({
	builder_result: {
		executable_sections_size: [
			{ name: "text", size: 100, max_size: 1000 },
			{ name: "data", size: 10, max_size: 100 },
		],
	},
});

const writeUnitSource = (filePath) => {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, "int unit() { return 0; }\n", UTF8);
};

const createHostProject = (rootDirectory) => {
	const outputDirectory = join(rootDirectory, HOST_PROJECT_NAME);
	const unitPaths = {
		project: join(outputDirectory, HOST_SOURCE_FILE_NAME),
		core: join(
			outputDirectory,
			CORE_DIRECTORY_NAME,
			CORE_MODULE_DIRECTORY_NAME,
			CORE_SOURCE_FILE_NAME,
		),
		library: join(
			outputDirectory,
			LIBRARIES_DIRECTORY_NAME,
			LIBRARY_MODULE_DIRECTORY_NAME,
			LIBRARY_SOURCE_FILE_NAME,
		),
		module: join(
			outputDirectory,
			MODULES_DIRECTORY_NAME,
			USER_MODULE_DIRECTORY_NAME,
			MODULE_SOURCE_FILE_NAME,
		),
		async: join(
			outputDirectory,
			MODULES_DIRECTORY_NAME,
			ASYNC_MODULE_DIRECTORY_NAME,
			ASYNC_SOURCE_FILE_NAME,
		),
	};

	for (const filePath of Object.values(unitPaths)) {
		writeUnitSource(filePath);
	}

	return { outputDirectory, unitPaths };
};

const createRecordingSpawn = () => {
	const calls = [];
	const runSpawnedProcess = async (command, args) => {
		calls.push({ command, args });
		const outputIndex = args.indexOf(OUTPUT_ARGUMENT);
		if (outputIndex !== -1) {
			writeFileSync(args[outputIndex + 1], "", {
				mode: EXECUTABLE_FILE_MODE,
			});
		}
		return { code: 0, stdout: "", stderr: "" };
	};
	return { calls, runSpawnedProcess };
};

const runPosixCompile = async ({ outputDirectory }) => {
	const recording = createRecordingSpawn();
	await strategies.posix.compile({
		outputDir: outputDirectory,
		projectName: HOST_PROJECT_NAME,
		shared: {
			runSpawnedProcess: recording.runSpawnedProcess,
		},
		spawnSync: () => {
			return { status: 0 };
		},
		log: () => {},
	});
	return recording.calls[0]?.args ?? [];
};

const countCyclesArguments = (argumentsList) => {
	return argumentsList.filter((argument) => {
		return argument.startsWith(CYCLES_ARGUMENT_PREFIX);
	}).length;
};

const checkPosixUnitsSkipTheDefine = async (rootDirectory) => {
	const results = [];
	const { outputDirectory, unitPaths } = createHostProject(
		join(rootDirectory, "posix"),
	);
	const argumentsList = await runPosixCompile({ outputDirectory });

	for (const [unit, filePath] of Object.entries(unitPaths)) {
		results.push(
			expectEqual(
				`posix compiles the ${unit} unit`,
				argumentsList.includes(filePath),
				true,
			),
		);
	}
	results.push(
		expectEqual(
			"posix does not pass a cycles define argument",
			countCyclesArguments(argumentsList),
			0,
		),
	);

	return results;
};

const runArduinoCompile = async ({ outputDirectory }) => {
	const calls = [];
	await strategies.arduino.compile({
		outputDir: outputDirectory,
		projectName: HOST_PROJECT_NAME,
		platform: { name: ARDUINO_PLATFORM_NAME },
		shared: {
			runTool: async (tool, args) => {
				calls.push({ tool, args });
				return ARDUINO_COMPILE_SIZES_OUTPUT;
			},
		},
	});
	return calls[0]?.args ?? [];
};

const findExtraFlags = (argumentsList) => {
	const propertyIndex = argumentsList.findIndex((argument) => {
		return argument.startsWith(ARDUINO_EXTRA_FLAGS_PREFIX);
	});
	return propertyIndex === -1 ? null : argumentsList[propertyIndex];
};

const checkArduinoKeepsFwrapvWithoutTheDefine = async (rootDirectory) => {
	const outputDirectory = join(rootDirectory, "arduino");
	mkdirSync(outputDirectory, { recursive: true });
	const argumentsList = await runArduinoCompile({ outputDirectory });
	const extraFlags = findExtraFlags(argumentsList);

	return [
		expectEqual(
			"arduino keeps -fwrapv in build.extra_flags",
			extraFlags?.includes(ARDUINO_FWRAPV_FLAG) ?? false,
			true,
		),
		expectEqual(
			"arduino build.extra_flags does not carry the cycles define",
			extraFlags?.includes(CYCLES_ARGUMENT_PREFIX) ?? false,
			false,
		),
	];
};

const createStm32Shared = ({
	toolchainDirectory,
	firmwareDirectory,
	compileCalls,
}) => {
	return {
		STM32_FW_CACHE: firmwareDirectory,
		ARM_COMPILER_EXECUTABLE: shared.ARM_COMPILER_EXECUTABLE,
		ARM_OBJCOPY_EXECUTABLE: shared.ARM_OBJCOPY_EXECUTABLE,
		ARM_SIZE_EXECUTABLE: shared.ARM_SIZE_EXECUTABLE,
		findStm32FirmwareCache: () => {
			return firmwareDirectory;
		},
		findStm32Toolchain: () => {
			return toolchainDirectory;
		},
		runSpawnedProcess: async (_command, args) => {
			if (args.includes(OBJECT_ARGUMENT)) {
				compileCalls.push(args);
			}
			return { code: 0, stdout: "", stderr: "" };
		},
	};
};

const runStm32Compile = async ({ outputDirectory }) => {
	const compileCalls = [];
	const toolchainDirectory = join(
		outputDirectory,
		STM32_TOOLCHAIN_DIRECTORY_NAME,
	);
	const firmwareDirectory = join(
		outputDirectory,
		STM32_FIRMWARE_DIRECTORY_NAME,
	);
	mkdirSync(toolchainDirectory, { recursive: true });
	mkdirSync(firmwareDirectory, { recursive: true });

	await compile({
		outputDir: outputDirectory,
		projectName: STM32_PROJECT_NAME,
		shared: createStm32Shared({
			toolchainDirectory,
			firmwareDirectory,
			compileCalls,
		}),
		log: () => {},
	});

	return compileCalls;
};

const checkStm32TranslationUnitsSkipTheDefine = async (rootDirectory) => {
	const { outputDirectory } = createHostProject(join(rootDirectory, "stm32"));
	const compileCalls = await runStm32Compile({ outputDirectory });
	const cyclesArgumentCount = compileCalls.reduce((count, argumentsList) => {
		return count + countCyclesArguments(argumentsList);
	}, 0);

	return [
		expectEqual(
			"stm32 compiles one translation unit per source",
			compileCalls.length,
			5,
		),
		expectEqual(
			"stm32 does not pass a cycles define argument",
			cyclesArgumentCount,
			0,
		),
	];
};

const checkCyclesHelper = () => {
	return [
		expectEqual(
			"cycles option defaults to enabled",
			shared.resolveCyclesEnabled({}),
			true,
		),
		expectEqual(
			"cycles option false disables the collector",
			shared.resolveCyclesEnabled({ enableCycleCollector: false }),
			false,
		),
		expectEqual(
			"cycles config header for disabled contains the off define",
			shared.renderCyclesConfigHeader(false).includes(CYCLES_OFF_DEFINE),
			true,
		),
		expectEqual(
			"cycles config header for enabled contains the on define",
			shared.renderCyclesConfigHeader(true).includes(CYCLES_ON_DEFINE),
			true,
		),
		expectEqual(
			"cycles config header carries the include guard",
			shared.renderCyclesConfigHeader(true).includes(CYCLES_GUARD_DEFINE),
			true,
		),
	];
};

const readConfigHeader = (directory) => {
	return readFileSync(join(directory, CYCLES_CONFIG_FILE_NAME), UTF8);
};

const checkWriteCyclesConfigHeaders = (rootDirectory) => {
	const results = [];

	for (const cycles of [false, true]) {
		const expectedDefine = cycles ? CYCLES_ON_DEFINE : CYCLES_OFF_DEFINE;
		const treeDirectory = join(rootDirectory, `config-tree-${cycles}`);
		const directories = [
			treeDirectory,
			...CONFIG_TREE_DIRECTORY_NAMES.map((directoryName) => {
				return join(treeDirectory, directoryName);
			}),
		];
		for (const directoryName of CONFIG_TREE_DIRECTORY_NAMES) {
			mkdirSync(join(treeDirectory, directoryName), { recursive: true });
		}

		shared.writeCyclesConfigHeaders(treeDirectory, cycles);

		for (const directory of directories) {
			results.push(
				expectEqual(
					`config tree ${directory.replace(treeDirectory, "") || "/"} has ${expectedDefine}`,
					readConfigHeader(directory).includes(expectedDefine),
					true,
				),
			);
		}
	}

	return results;
};

export const runCyclesFlagChecks = async () => {
	const rootDirectory = mkdtempSync(join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX));
	try {
		return [
			...checkCyclesHelper(),
			...checkWriteCyclesConfigHeaders(rootDirectory),
			...(await checkPosixUnitsSkipTheDefine(rootDirectory)),
			...(await checkArduinoKeepsFwrapvWithoutTheDefine(rootDirectory)),
			...(await checkStm32TranslationUnitsSkipTheDefine(rootDirectory)),
			...checkCollectorIsCompiledOutWhenDisabled(),
		];
	} finally {
		rmSync(rootDirectory, { recursive: true, force: true });
	}
};
