// Conditionally syntax-checks the generated STM32 servo artifacts with the ARM
// bare-metal toolchain: the public library (`lib_servo.cpp`) and the hardware
// driver (`core_servo_hardware.cpp`, PSC/ARR setup, CCR1-4, clamp and release).
// The engine snapshots are laid out as a real project (`core/<module>/...` and
// `libraries/servo/...`) in a temporary directory, because `lib_servo.h`
// addresses the core through the project layout. The check is skipped (not
// failed) when the ARM toolchain is unavailable, matching the other executable
// STM32 checks.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPOSITORY_ROOT } from "./runner-harness.js";
import {
	ARM_COMPILER_NAME,
	buildCompilerArguments,
	COMPILER_OVERRIDE_ENVIRONMENT_KEY,
	findFirmwareRoot,
	findStm32Compiler,
	PLATFORMIO_FRAMEWORK_DIRECTORY,
	STM32_SNAPSHOT_DIRECTORY,
} from "./stm32-toolchain.js";

const TEMPORARY_DIRECTORY_PREFIX = "embedito95-servo-stm32-";
const CORE_DIRECTORY_NAME = "core";
const LIBRARIES_DIRECTORY_NAME = "libraries";
const SERVO_LIBRARY_NAME = "servo";
const SERVO_LIBRARY_SOURCE_FILE_NAME = "lib_servo.cpp";
const SERVO_HARDWARE_DIRECTORY_NAME = "servo_hardware";
const SERVO_HARDWARE_SOURCE_FILE_NAME = "core_servo_hardware.cpp";

const compiler = findStm32Compiler();

if (!compiler) {
	const configuredCompiler = process.env[COMPILER_OVERRIDE_ENVIRONMENT_KEY];

	console.log(
		configuredCompiler
			? `SKIP servo stm32 check: ${COMPILER_OVERRIDE_ENVIRONMENT_KEY}=${configuredCompiler} is not an executable file`
			: `SKIP servo stm32 check: ${ARM_COMPILER_NAME} not found in PATH, the PlatformIO toolchain or the STM32CubeIDE toolchain`,
	);
	process.exit(0);
}

const firmwareRoot = findFirmwareRoot();

if (!firmwareRoot) {
	console.log(
		`SKIP servo stm32 check: CMSIS/LL headers not found in ${PLATFORMIO_FRAMEWORK_DIRECTORY} or the embedito95 firmware cache`,
	);
	process.exit(0);
}

const projectDirectory = mkdtempSync(
	join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX),
);
const librarySourceFile = join(
	projectDirectory,
	LIBRARIES_DIRECTORY_NAME,
	SERVO_LIBRARY_NAME,
	SERVO_LIBRARY_SOURCE_FILE_NAME,
);
const hardwareSourceFile = join(
	projectDirectory,
	CORE_DIRECTORY_NAME,
	SERVO_HARDWARE_DIRECTORY_NAME,
	SERVO_HARDWARE_SOURCE_FILE_NAME,
);

const compileTranslationUnit = (sourceFile) => {
	const compilerArguments = buildCompilerArguments({
		sourceFile,
		firmwareRoot,
	});
	execFileSync(compiler, compilerArguments, {
		cwd: REPOSITORY_ROOT,
		stdio: "inherit",
	});
};

try {
	cpSync(
		STM32_SNAPSHOT_DIRECTORY,
		join(projectDirectory, CORE_DIRECTORY_NAME),
		{
			recursive: true,
		},
	);
	cpSync(
		join(STM32_SNAPSHOT_DIRECTORY, SERVO_LIBRARY_NAME),
		join(projectDirectory, LIBRARIES_DIRECTORY_NAME, SERVO_LIBRARY_NAME),
		{ recursive: true },
	);
	compileTranslationUnit(librarySourceFile);
	console.log(
		`PASS servo stm32 library check (${librarySourceFile}) with ${compiler}`,
	);
	compileTranslationUnit(hardwareSourceFile);
	console.log(
		`PASS servo stm32 hardware check (${hardwareSourceFile}) with ${compiler}`,
	);
} catch {
	console.error(`FAIL servo stm32 check with ${compiler}`);
	process.exitCode = 1;
} finally {
	rmSync(projectDirectory, { recursive: true, force: true });
}
