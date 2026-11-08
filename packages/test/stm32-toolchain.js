// Shared discovery of the ARM bare-metal toolchain and the CMSIS/LL firmware
// headers used by the executable STM32 checks (stm32-syntax-check.js and
// eeprom-stm32-check.js). Keeping the lookup in one place means both checks
// skip under exactly the same toolchain conditions and cannot drift apart.
import { accessSync, constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { shared } from "embedito95-core";
import { PACKAGE_DIRECTORY } from "./runner-harness.js";

export const ARM_COMPILER_NAME = shared.ARM_COMPILER_EXECUTABLE;
export const COMPILER_OVERRIDE_ENVIRONMENT_KEY = "E95_ARM_NONE_EABI_GXX";
export const CPP_STANDARD_ARGUMENT = "-std=c++17";
export const SYNTAX_ONLY_ARGUMENT = "-fsyntax-only";
export const MCU_DEFINE_ARGUMENT = "-DSTM32F103xB";
export const CPU_ARGUMENTS = ["-mcpu=cortex-m3", "-mthumb"];
export const INCLUDE_ARGUMENT = "-I";

export const STM32_SNAPSHOT_DIRECTORY = join(
	PACKAGE_DIRECTORY,
	"src",
	"stm32-bluepill",
	"snapshots",
	"engine",
);
export const TYPE_INCLUDE_DIRECTORY = join(STM32_SNAPSHOT_DIRECTORY, "type");

const PLATFORMIO_PACKAGES_DIRECTORY = join(
	homedir(),
	".platformio",
	"packages",
);
export const PLATFORMIO_TOOLCHAIN_DIRECTORY = join(
	PLATFORMIO_PACKAGES_DIRECTORY,
	"toolchain-gccarmnoneeabi",
	"bin",
);
export const PLATFORMIO_FRAMEWORK_DIRECTORY = join(
	PLATFORMIO_PACKAGES_DIRECTORY,
	"framework-stm32cubef1",
);
const FIRMWARE_INCLUDE_PATHS = [
	join("Drivers", "CMSIS", "Include"),
	join("Drivers", "CMSIS", "Device", "ST", "STM32F1xx", "Include"),
	join("Drivers", "STM32F1xx_HAL_Driver", "Inc"),
];

const isExecutableFile = (filePath) => {
	try {
		accessSync(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
};

const findCompilerInPath = () => {
	const pathEntries = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
	const compilerPath = pathEntries
		.map((directory) => {
			return join(directory, ARM_COMPILER_NAME);
		})
		.find(isExecutableFile);

	return compilerPath ?? null;
};

export const findStm32Compiler = () => {
	const configuredCompiler = process.env[COMPILER_OVERRIDE_ENVIRONMENT_KEY];

	if (configuredCompiler) {
		return isExecutableFile(configuredCompiler) ? configuredCompiler : null;
	}

	const pathCompiler = findCompilerInPath();

	if (pathCompiler) {
		return pathCompiler;
	}

	const platformioCompiler = join(
		PLATFORMIO_TOOLCHAIN_DIRECTORY,
		ARM_COMPILER_NAME,
	);

	if (isExecutableFile(platformioCompiler)) {
		return platformioCompiler;
	}

	const cubeIdeBinDirectory = shared.findStm32Toolchain();

	if (!cubeIdeBinDirectory) {
		return null;
	}

	const cubeIdeCompiler = join(cubeIdeBinDirectory, ARM_COMPILER_NAME);

	return isExecutableFile(cubeIdeCompiler) ? cubeIdeCompiler : null;
};

const firmwareRootHasIncludes = ({ root }) => {
	return FIRMWARE_INCLUDE_PATHS.every((relativePath) => {
		return existsSync(join(root, relativePath));
	});
};

export const findFirmwareRoot = () => {
	if (firmwareRootHasIncludes({ root: PLATFORMIO_FRAMEWORK_DIRECTORY })) {
		return PLATFORMIO_FRAMEWORK_DIRECTORY;
	}

	return shared.findStm32FirmwareCache();
};

const buildFirmwareIncludeArguments = ({ firmwareRoot }) => {
	if (!firmwareRoot) {
		return [];
	}

	return FIRMWARE_INCLUDE_PATHS.flatMap((relativePath) => {
		return [INCLUDE_ARGUMENT, join(firmwareRoot, relativePath)];
	});
};

export const buildCompilerArguments = ({
	sourceFile,
	firmwareRoot,
	includeDirectories = [TYPE_INCLUDE_DIRECTORY],
}) => {
	return [
		CPP_STANDARD_ARGUMENT,
		SYNTAX_ONLY_ARGUMENT,
		MCU_DEFINE_ARGUMENT,
		...CPU_ARGUMENTS,
		...includeDirectories.flatMap((directory) => {
			return [INCLUDE_ARGUMENT, directory];
		}),
		...buildFirmwareIncludeArguments({ firmwareRoot }),
		sourceFile,
	];
};
