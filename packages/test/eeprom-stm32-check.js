// Executable guard for the STM32 rejection path: the generated
// eeprom_hardware header must not compile for the Blue Pill. A snapshot of the
// header text does not prove the `#error` actually fires, so this compiles it
// with the ARM bare-metal toolchain and requires both a non-zero status and the
// expected diagnostic. It is skipped only when the compiler is unavailable.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { REPOSITORY_ROOT } from "./runner-harness.js";
import {
	ARM_COMPILER_NAME,
	buildCompilerArguments,
	COMPILER_OVERRIDE_ENVIRONMENT_KEY,
	findFirmwareRoot,
	findStm32Compiler,
	STM32_SNAPSHOT_DIRECTORY,
} from "./stm32-toolchain.js";

const EEPROM_SOURCE_FILE = join(
	STM32_SNAPSHOT_DIRECTORY,
	"eeprom_hardware",
	"core_eeprom_hardware.h",
);
const EXPECTED_DIAGNOSTIC = "EEPROM is not available on STM32F103";
const COMPILER_ENCODING = "utf8";

const runCompiler = ({ compiler, compilerArguments }) => {
	try {
		execFileSync(compiler, compilerArguments, {
			cwd: REPOSITORY_ROOT,
			encoding: COMPILER_ENCODING,
			stdio: ["ignore", "pipe", "pipe"],
		});
		return { status: 0, output: "" };
	} catch (error) {
		const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
		return { status: error.status ?? 1, output };
	}
};

const compiler = findStm32Compiler();

if (!compiler) {
	const configuredCompiler = process.env[COMPILER_OVERRIDE_ENVIRONMENT_KEY];

	console.log(
		configuredCompiler
			? `SKIP eeprom stm32 check: ${COMPILER_OVERRIDE_ENVIRONMENT_KEY}=${configuredCompiler} is not an executable file`
			: `SKIP eeprom stm32 check: ${ARM_COMPILER_NAME} not found in PATH, the PlatformIO toolchain or the STM32CubeIDE toolchain`,
	);
	process.exit(0);
}

const compilerArguments = buildCompilerArguments({
	sourceFile: EEPROM_SOURCE_FILE,
	firmwareRoot: findFirmwareRoot(),
});
const { status, output } = runCompiler({ compiler, compilerArguments });
if (status === 0) {
	console.error(
		`FAIL eeprom stm32 check: ${EEPROM_SOURCE_FILE} compiled successfully; expected the #error rejection`,
	);
	process.exit(1);
}

if (!output.includes(EXPECTED_DIAGNOSTIC)) {
	console.error(
		`FAIL eeprom stm32 check: compiler failed without the expected diagnostic "${EXPECTED_DIAGNOSTIC}"`,
	);
	console.error(output);
	process.exit(1);
}

console.log(
	`PASS eeprom stm32 check: rejected with "${EXPECTED_DIAGNOSTIC}" (${compiler})`,
);
