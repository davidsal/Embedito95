// Executable guard for the STM32 software-serial header: the generated
// software_serial_hardware header must compile for the Blue Pill. A snapshot of
// the header text does not prove it builds, so this compiles it with the ARM
// bare-metal toolchain and requires a zero status. It is skipped only when the
// compiler is unavailable.
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

const SOFTWARE_SERIAL_SOURCE_FILE = join(
	STM32_SNAPSHOT_DIRECTORY,
	"software_serial_hardware",
	"core_software_serial_hardware.h",
);
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
			? `SKIP software-serial stm32 check: ${COMPILER_OVERRIDE_ENVIRONMENT_KEY}=${configuredCompiler} is not an executable file`
			: `SKIP software-serial stm32 check: ${ARM_COMPILER_NAME} not found in PATH, the PlatformIO toolchain or the STM32CubeIDE toolchain`,
	);
	process.exit(0);
}

const compilerArguments = buildCompilerArguments({
	sourceFile: SOFTWARE_SERIAL_SOURCE_FILE,
	firmwareRoot: findFirmwareRoot(),
});
const { status, output } = runCompiler({ compiler, compilerArguments });
if (status !== 0) {
	console.error(
		`FAIL software-serial stm32 check: ${SOFTWARE_SERIAL_SOURCE_FILE} failed to compile`,
	);
	console.error(output);
	process.exit(1);
}

console.log(`PASS software-serial stm32 check: header compiled (${compiler})`);
