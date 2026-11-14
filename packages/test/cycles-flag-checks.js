// F-008: the refcount cycle collector switch must reach every translation unit
// as a compile argument, not only the generated project headers. A unit that
// keeps the `1` default from `ref.h` while the project defines `E95_CYCLES 0`
// gets a different body for the shared inline functions (ODR violation), and
// `enableCycleCollector: false` behaves like `true`.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { shared, UTF8 } from "embedito95-core";
import { strategies } from "embedito95-registry/strategies";
import { compile } from "../registry/src/strategies/stm32-ll/compile.js";
import { checkCollectorIsCompiledOutWhenDisabled } from "./cycles-runtime-checks.js";
import { expectEqual } from "./reporting.js";

const CYCLES_OFF_ARGUMENT = "-DE95_CYCLES=0";
const CYCLES_ON_ARGUMENT = "-DE95_CYCLES=1";
const CYCLES_ARGUMENT_PREFIX = "-DE95_CYCLES=";
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

const runPosixCompile = async ({ outputDirectory, cycles }) => {
	const recording = createRecordingSpawn();
	await strategies.posix.compile({
		outputDir: outputDirectory,
		projectName: HOST_PROJECT_NAME,
		shared: {
			renderCyclesDefineArgument: shared.renderCyclesDefineArgument,
			runSpawnedProcess: recording.runSpawnedProcess,
		},
		spawnSync: () => {
			return { status: 0 };
		},
		cycles,
		log: () => {},
	});
	return recording.calls[0]?.args ?? [];
};

const countCyclesArguments = (argumentsList) => {
	return argumentsList.filter((argument) => {
		return argument.startsWith(CYCLES_ARGUMENT_PREFIX);
	}).length;
};

const checkPosixUnitsReceiveTheDefine = async (rootDirectory) => {
	const results = [];

	for (const { cycles, expected } of [
		{ cycles: false, expected: CYCLES_OFF_ARGUMENT },
		{ cycles: true, expected: CYCLES_ON_ARGUMENT },
	]) {
		const { outputDirectory, unitPaths } = createHostProject(
			join(rootDirectory, `posix-${cycles}`),
		);
		const argumentsList = await runPosixCompile({ outputDirectory, cycles });

		for (const [unit, filePath] of Object.entries(unitPaths)) {
			results.push(
				expectEqual(
					`posix compiles the ${unit} unit with ${expected}`,
					argumentsList.includes(filePath) && argumentsList.includes(expected),
					true,
				),
			);
		}
		results.push(
			expectEqual(
				`posix passes a single cycles define for every unit (${cycles})`,
				countCyclesArguments(argumentsList),
				1,
			),
		);
	}

	return results;
};

const runArduinoCompile = async ({ outputDirectory, cycles }) => {
	const calls = [];
	await strategies.arduino.compile({
		outputDir: outputDirectory,
		projectName: HOST_PROJECT_NAME,
		platform: { name: ARDUINO_PLATFORM_NAME },
		shared: {
			renderCyclesDefineArgument: shared.renderCyclesDefineArgument,
			runTool: async (tool, args) => {
				calls.push({ tool, args });
				return ARDUINO_COMPILE_SIZES_OUTPUT;
			},
		},
		cycles,
	});
	return calls[0]?.args ?? [];
};

const findExtraFlags = (argumentsList) => {
	const propertyIndex = argumentsList.findIndex((argument) => {
		return argument.startsWith(ARDUINO_EXTRA_FLAGS_PREFIX);
	});
	return propertyIndex === -1 ? null : argumentsList[propertyIndex];
};

const checkArduinoReceivesTheDefine = async (rootDirectory) => {
	const results = [];

	for (const { cycles, expected } of [
		{ cycles: false, expected: CYCLES_OFF_ARGUMENT },
		{ cycles: true, expected: CYCLES_ON_ARGUMENT },
	]) {
		const outputDirectory = join(rootDirectory, `arduino-${cycles}`);
		mkdirSync(outputDirectory, { recursive: true });
		const argumentsList = await runArduinoCompile({ outputDirectory, cycles });
		const extraFlags = findExtraFlags(argumentsList);

		results.push(
			expectEqual(
				`arduino forwards ${expected} to build.extra_flags`,
				extraFlags?.includes(expected) ?? false,
				true,
			),
		);
		results.push(
			expectEqual(
				`arduino keeps -fwrapv next to the cycles define (${cycles})`,
				extraFlags?.includes(ARDUINO_FWRAPV_FLAG) ?? false,
				true,
			),
		);
	}

	return results;
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
		renderCyclesDefineArgument: shared.renderCyclesDefineArgument,
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

const runStm32Compile = async ({ outputDirectory, cycles }) => {
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
		cycles,
		log: () => {},
	});

	return compileCalls;
};

const checkStm32TranslationUnitsReceiveTheDefine = async (rootDirectory) => {
	const results = [];

	for (const { cycles, expected } of [
		{ cycles: false, expected: CYCLES_OFF_ARGUMENT },
		{ cycles: true, expected: CYCLES_ON_ARGUMENT },
	]) {
		const { outputDirectory } = createHostProject(
			join(rootDirectory, `stm32-${cycles}`),
		);
		const compileCalls = await runStm32Compile({ outputDirectory, cycles });
		const allUnitsHaveTheDefine = compileCalls.every((argumentsList) => {
			return argumentsList.includes(expected);
		});

		results.push(
			expectEqual(
				`stm32 compiles one translation unit per source (${cycles})`,
				compileCalls.length,
				5,
			),
		);
		results.push(
			expectEqual(
				`stm32 compiles every translation unit with ${expected}`,
				allUnitsHaveTheDefine,
				true,
			),
		);
	}

	return results;
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
			"cycles define argument for disabled",
			shared.renderCyclesDefineArgument(false),
			CYCLES_OFF_ARGUMENT,
		),
		expectEqual(
			"cycles define argument for enabled",
			shared.renderCyclesDefineArgument(true),
			CYCLES_ON_ARGUMENT,
		),
	];
};

export const runCyclesFlagChecks = async () => {
	const rootDirectory = mkdtempSync(join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX));
	try {
		return [
			...checkCyclesHelper(),
			...(await checkPosixUnitsReceiveTheDefine(rootDirectory)),
			...(await checkArduinoReceivesTheDefine(rootDirectory)),
			...(await checkStm32TranslationUnitsReceiveTheDefine(rootDirectory)),
			...checkCollectorIsCompiledOutWhenDisabled(),
		];
	} finally {
		rmSync(rootDirectory, { recursive: true, force: true });
	}
};
