export const ARTIFACTS_DIRECTORY_NAME = "artifacts";
// Bounded concurrency for the per-translation-unit STM32 compile
// (TICKET-85). The default is `os.availableParallelism()` clamped to
// `DEFAULT_MAXIMUM_COMPILE_JOBS`; `E95_STM32_COMPILE_JOBS` overrides it with
// any integer >= 1.
export const STM32_COMPILE_JOBS_ENVIRONMENT_KEY = "E95_STM32_COMPILE_JOBS";
export const MINIMUM_COMPILE_JOBS = 1;
export const DEFAULT_MAXIMUM_COMPILE_JOBS = 8;
export const COMPILE_TIMEOUT_MILLISECONDS = 120000;
export const TOOLCHAIN_NOT_FOUND_MESSAGE =
	"ARM toolchain not found. Install STM32CubeIDE or run 'doctor' to set its location";
export const CUBEPROG_NOT_FOUND_MESSAGE =
	"STM32CubeProgrammer not found. Install STM32CubeIDE or run 'doctor' to set its location";
