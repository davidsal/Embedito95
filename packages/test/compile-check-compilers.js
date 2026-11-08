// Real compiler drivers used by the opt-in `test:compile` pipeline. Arduino
// sketches go through `arduino-cli`; STM32 projects reuse the registry compile
// strategy (the TICKET-85 scheduler). Artifacts are verified after each compile.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
	CORE_LIBRARIES_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	MODULES_DIRECTORY_NAME,
	shared,
	UTF8,
} from "embedito95-core";
import { strategies } from "embedito95-registry/strategies";
import {
	parseArduinoCompileSizes,
	parseArmCompileSizes,
} from "./compile-check-sizes.js";
import {
	ARDUINO_CLI_COMMAND,
	ARM_SIZE_COMMAND_NAME,
	ARTIFACTS_DIRECTORY_NAME,
	COMPILE_FQBN_BY_PLATFORM,
	COMPILE_STRATEGY_BY_PLATFORM,
	REGISTRY_PLATFORMS_DIRECTORY,
} from "./constants.js";

const ARDUINO_FWRAPV_BUILD_PROPERTY = "build.extra_flags=-fwrapv";
const ARDUINO_JOBS_ARGUMENT = "1";
const ARDUINO_JSON_FLAG = "--json";
const ARDUINO_BUILD_DIRECTORY_NAME = "arduino-build";
const ARDUINO_BUILD_CACHE_DIRECTORY_NAME = "arduino-core-cache";
const COMPILE_OUTPUT_MAXIMUM_BYTES = 10 * 1024 * 1024;
const runExecFile = promisify(execFile);

const writeNothing = () => {};

export const runCompileStrategySilently = async ({
	compileStrategy,
	options,
}) => {
	return await compileStrategy({ ...options, log: writeNothing });
};

const buildArduinoLibraryArguments = ({ outputDirectory }) => {
	const libraryArguments = [
		"--libraries",
		join(outputDirectory, CORE_LIBRARIES_DIRECTORY_NAME),
		"--libraries",
		join(outputDirectory, LIBRARIES_DIRECTORY_NAME),
	];
	const modulesDirectory = join(outputDirectory, MODULES_DIRECTORY_NAME);

	if (existsSync(modulesDirectory)) {
		libraryArguments.push("--libraries", modulesDirectory);
	}

	return libraryArguments;
};

export const verifyCompileArtifacts = ({ directory, extensions, label }) => {
	const fileNames = existsSync(directory) ? readdirSync(directory) : [];
	const missingExtensions = extensions.filter((extension) => {
		return !fileNames.some((fileName) => {
			return fileName.endsWith(extension);
		});
	});

	if (missingExtensions.length > 0) {
		throw new Error(
			`${label}: missing compiled artifact(s) ${missingExtensions.join(", ")} in ${directory}`,
		);
	}
};

export const compileArduinoSketch = async ({
	outputDirectory,
	artifactsDirectory,
	platformName,
	buildPath,
	buildCachePath,
	command = ARDUINO_CLI_COMMAND,
	runProcess = runExecFile,
}) => {
	mkdirSync(artifactsDirectory, { recursive: true });
	const resolvedBuildPath =
		buildPath ?? join(artifactsDirectory, ARDUINO_BUILD_DIRECTORY_NAME);
	const resolvedBuildCachePath =
		buildCachePath ??
		join(artifactsDirectory, ARDUINO_BUILD_CACHE_DIRECTORY_NAME);

	try {
		const processResult = await runProcess(
			command,
			[
				"compile",
				ARDUINO_JSON_FLAG,
				"--fqbn",
				COMPILE_FQBN_BY_PLATFORM[platformName],
				...buildArduinoLibraryArguments({ outputDirectory }),
				"--build-property",
				ARDUINO_FWRAPV_BUILD_PROPERTY,
				"--jobs",
				ARDUINO_JOBS_ARGUMENT,
				"--build-path",
				resolvedBuildPath,
				"--build-cache-path",
				resolvedBuildCachePath,
				"--output-dir",
				artifactsDirectory,
				outputDirectory,
			],
			{
				encoding: UTF8,
				maxBuffer: COMPILE_OUTPUT_MAXIMUM_BYTES,
			},
		);
		const platform = await loadPlatformDefinition(platformName);
		return parseArduinoCompileSizes({
			output: processResult?.stdout ?? "",
			flashMax: platform.specs.flash,
			ramMax: platform.specs.sram,
		});
	} catch (error) {
		const diagnostic =
			`${error.stderr ?? ""}`.trim() || `${error.stdout ?? ""}`.trim();
		throw new Error(
			diagnostic
				? `arduino-cli compile failed:\n${diagnostic}`
				: "arduino-cli compile failed",
		);
	}
};

const loadPlatformDefinition = async (platformName) => {
	const platformModule = await import(
		pathToFileURL(join(REGISTRY_PLATFORMS_DIRECTORY, `${platformName}.js`))
	);
	return platformModule.platform;
};

const readStm32CompileSizes = async ({
	outputDirectory,
	projectName,
	platform,
	runProcess,
	findToolchain,
	sizeCommandName,
}) => {
	const toolchainBinDirectory = findToolchain();

	if (!toolchainBinDirectory) {
		return null;
	}

	const elfPath = join(
		outputDirectory,
		ARTIFACTS_DIRECTORY_NAME,
		`${projectName}.elf`,
	);

	try {
		const processResult = await runProcess(
			join(toolchainBinDirectory, sizeCommandName),
			[elfPath],
			{
				encoding: UTF8,
				maxBuffer: COMPILE_OUTPUT_MAXIMUM_BYTES,
			},
		);
		return parseArmCompileSizes({
			output: processResult?.stdout ?? "",
			flashMax: platform.specs.flash,
			ramMax: platform.specs.sram,
		});
	} catch {
		return null;
	}
};

export const compileStm32Project = async ({
	outputDirectory,
	projectName,
	platformName,
	maximumCompileJobs,
	runProcess = runExecFile,
	findToolchain = shared.findStm32Toolchain,
	sizeCommandName = ARM_SIZE_COMMAND_NAME,
}) => {
	const strategyName = COMPILE_STRATEGY_BY_PLATFORM[platformName];
	const strategy = strategies[strategyName];

	if (!strategy?.compile) {
		throw new Error(`No compile strategy for platform "${platformName}"`);
	}

	const platform = await loadPlatformDefinition(platformName);
	await runCompileStrategySilently({
		compileStrategy: strategy.compile,
		options: {
			outputDir: outputDirectory,
			projectName,
			platform,
			shared,
			maximumCompileJobs,
		},
	});

	return readStm32CompileSizes({
		outputDirectory,
		projectName,
		platform,
		runProcess,
		findToolchain,
		sizeCommandName,
	});
};
