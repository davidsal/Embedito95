// Conditionally syntax-checks the generated STM32 ssd1306 driver with the ARM
// bare-metal toolchain. The library is e95 (there is no hand-written strategy to
// compile), so the only real compilation check is the generated artifact: it
// pins that the shared driver and both transports (I2C and 4-wire SPI) are valid
// C++ against the real core headers. The check is skipped (not failed) when the
// ARM toolchain or the CMSIS/LL headers are unavailable, matching the other
// executable STM32 checks.
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

const TEMPORARY_DIRECTORY_PREFIX = "embedito95-ssd1306-stm32-";
const CORE_DIRECTORY_NAME = "core";
const LIBRARIES_DIRECTORY_NAME = "libraries";
const SSD1306_LIBRARY_NAME = "ssd1306";
const SSD1306_LIBRARY_SOURCE_FILE_NAME = "lib_ssd1306.cpp";

const compiler = findStm32Compiler();

if (!compiler) {
	const configuredCompiler = process.env[COMPILER_OVERRIDE_ENVIRONMENT_KEY];

	console.log(
		configuredCompiler
			? `SKIP ssd1306 stm32 check: ${COMPILER_OVERRIDE_ENVIRONMENT_KEY}=${configuredCompiler} is not an executable file`
			: `SKIP ssd1306 stm32 check: ${ARM_COMPILER_NAME} not found in PATH, the PlatformIO toolchain or the STM32CubeIDE toolchain`,
	);
	process.exit(0);
}

const firmwareRoot = findFirmwareRoot();

if (!firmwareRoot) {
	console.log(
		`SKIP ssd1306 stm32 check: CMSIS/LL headers not found in ${PLATFORMIO_FRAMEWORK_DIRECTORY} or the embedito95 firmware cache`,
	);
	process.exit(0);
}

const projectDirectory = mkdtempSync(
	join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX),
);
const librarySourceFile = join(
	projectDirectory,
	LIBRARIES_DIRECTORY_NAME,
	SSD1306_LIBRARY_NAME,
	SSD1306_LIBRARY_SOURCE_FILE_NAME,
);

try {
	cpSync(
		STM32_SNAPSHOT_DIRECTORY,
		join(projectDirectory, CORE_DIRECTORY_NAME),
		{
			recursive: true,
		},
	);
	cpSync(
		join(STM32_SNAPSHOT_DIRECTORY, SSD1306_LIBRARY_NAME),
		join(projectDirectory, LIBRARIES_DIRECTORY_NAME, SSD1306_LIBRARY_NAME),
		{ recursive: true },
	);
	execFileSync(
		compiler,
		buildCompilerArguments({ sourceFile: librarySourceFile, firmwareRoot }),
		{ cwd: REPOSITORY_ROOT, stdio: "inherit" },
	);
	console.log(
		`PASS ssd1306 stm32 library check (${librarySourceFile}) with ${compiler}`,
	);
} catch {
	console.error(`FAIL ssd1306 stm32 check with ${compiler}`);
	process.exitCode = 1;
} finally {
	rmSync(projectDirectory, { recursive: true, force: true });
}
