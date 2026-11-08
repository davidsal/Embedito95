// Conditionally syntax-checks a generated STM32 C++ translation unit with the
// ARM bare-metal toolchain. The check is skipped (not failed) when the compiler
// or the CMSIS/LL headers are unavailable, so contributors without an STM32
// setup are not blocked; when both are present, a C++ error must fail the run.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { PACKAGE_DIRECTORY, REPOSITORY_ROOT } from "./runner-harness.js";
import {
	ARM_COMPILER_NAME,
	buildCompilerArguments,
	COMPILER_OVERRIDE_ENVIRONMENT_KEY,
	findFirmwareRoot,
	findStm32Compiler,
	PLATFORMIO_FRAMEWORK_DIRECTORY,
	PLATFORMIO_TOOLCHAIN_DIRECTORY,
	STM32_SNAPSHOT_DIRECTORY,
} from "./stm32-toolchain.js";

const DEFAULT_SOURCE_FILE = join(
	STM32_SNAPSHOT_DIRECTORY,
	"timer",
	"core_timer.cpp",
);
const CORE_DIRECTORY_NAME = "core";
const LIBRARIES_DIRECTORY_NAME = "libraries";
const SNAPSHOTS_ROOT = join(STM32_SNAPSHOT_DIRECTORY, "..");
const TYPE_DIRECTORY_NAME = "type";
const TEMPORARY_DIRECTORY_PREFIX = "embedito95-stm32-syntax-";

// A library snapshot includes the engine through the generated project layout
// (`core/<module>/...`), but the engine snapshot itself is stored as
// `engine/<module>/...`. Staging the engine under `core/` reproduces the
// project layout so the same generated file can be syntax-checked verbatim.
const isLibrarySnapshot = (sourceFile) => {
	const relativePath = relative(SNAPSHOTS_ROOT, sourceFile);
	return (
		!relativePath.startsWith("..") &&
		relativePath.split(sep)[0] === LIBRARIES_DIRECTORY_NAME
	);
};

const stageLibrarySnapshot = (sourceFile) => {
	const projectDirectory = mkdtempSync(
		join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX),
	);
	cpSync(
		STM32_SNAPSHOT_DIRECTORY,
		join(projectDirectory, CORE_DIRECTORY_NAME),
		{ recursive: true },
	);
	const stagedSourceFile = join(
		projectDirectory,
		relative(SNAPSHOTS_ROOT, sourceFile),
	);
	mkdirSync(dirname(stagedSourceFile), { recursive: true });
	cpSync(sourceFile, stagedSourceFile);
	return { projectDirectory, sourceFile: stagedSourceFile };
};

const compiler = findStm32Compiler();

if (!compiler) {
	const configuredCompiler = process.env[COMPILER_OVERRIDE_ENVIRONMENT_KEY];

	console.log(
		configuredCompiler
			? `SKIP stm32 syntax check: ${COMPILER_OVERRIDE_ENVIRONMENT_KEY}=${configuredCompiler} is not an executable file`
			: `SKIP stm32 syntax check: ${ARM_COMPILER_NAME} not found in PATH, ${PLATFORMIO_TOOLCHAIN_DIRECTORY} or the STM32CubeIDE toolchain`,
	);
	process.exit(0);
}

const firmwareRoot = findFirmwareRoot();

if (!firmwareRoot) {
	console.log(
		`SKIP stm32 syntax check: CMSIS/LL headers not found in ${PLATFORMIO_FRAMEWORK_DIRECTORY} or the embedito95 firmware cache`,
	);
	process.exit(0);
}

const requestedSourceFile = process.argv[2]
	? resolve(PACKAGE_DIRECTORY, process.argv[2])
	: DEFAULT_SOURCE_FILE;
const staging = isLibrarySnapshot(requestedSourceFile)
	? stageLibrarySnapshot(requestedSourceFile)
	: null;
const sourceFile = staging ? staging.sourceFile : requestedSourceFile;
const compilerArguments = buildCompilerArguments({
	sourceFile,
	firmwareRoot,
	...(staging
		? {
				includeDirectories: [
					staging.projectDirectory,
					join(
						staging.projectDirectory,
						CORE_DIRECTORY_NAME,
						TYPE_DIRECTORY_NAME,
					),
				],
			}
		: {}),
});

try {
	execFileSync(compiler, compilerArguments, {
		cwd: REPOSITORY_ROOT,
		stdio: "inherit",
	});
} catch {
	console.error(
		`FAIL stm32 syntax check (${requestedSourceFile}) with ${compiler}`,
	);
	process.exitCode = 1;
} finally {
	if (staging) {
		rmSync(staging.projectDirectory, { recursive: true, force: true });
	}
}

if (!process.exitCode) {
	console.log(
		`PASS stm32 syntax check (${requestedSourceFile}) with ${compiler}`,
	);
}
