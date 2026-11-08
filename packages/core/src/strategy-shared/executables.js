// Shared executable naming for the STM32 toolchain. The `.exe` suffix and the
// ARM/CubeProgrammer executable names live here once so the CubeIDE discovery,
// the STM32 compile strategy and the tests cannot drift per platform.
export const WINDOWS_PLATFORM = "win32";
export const MACOS_PLATFORM = "darwin";
export const WINDOWS_EXECUTABLE_SUFFIX = ".exe";
export const POSIX_EXECUTABLE_SUFFIX = "";
export const ARM_COMPILER_BASENAME = "arm-none-eabi-g++";
export const ARM_OBJCOPY_BASENAME = "arm-none-eabi-objcopy";
export const ARM_SIZE_BASENAME = "arm-none-eabi-size";
export const CUBEPROGRAMMER_BASENAME = "STM32_Programmer_CLI";

export const resolveExecutableSuffix = ({
	platform = process.platform,
} = {}) => {
	return platform === WINDOWS_PLATFORM
		? WINDOWS_EXECUTABLE_SUFFIX
		: POSIX_EXECUTABLE_SUFFIX;
};

const buildExecutableName = ({ basename, platform }) => {
	return `${basename}${resolveExecutableSuffix({ platform })}`;
};

export const resolveArmCompilerExecutable = ({
	platform = process.platform,
} = {}) => {
	return buildExecutableName({ basename: ARM_COMPILER_BASENAME, platform });
};

export const resolveArmObjcopyExecutable = ({
	platform = process.platform,
} = {}) => {
	return buildExecutableName({ basename: ARM_OBJCOPY_BASENAME, platform });
};

export const resolveArmSizeExecutable = ({
	platform = process.platform,
} = {}) => {
	return buildExecutableName({ basename: ARM_SIZE_BASENAME, platform });
};

export const resolveCubeProgrammerExecutable = ({
	platform = process.platform,
} = {}) => {
	return buildExecutableName({ basename: CUBEPROGRAMMER_BASENAME, platform });
};

export const EXECUTABLE_SUFFIX = resolveExecutableSuffix();
export const ARM_COMPILER_EXECUTABLE = resolveArmCompilerExecutable();
export const ARM_OBJCOPY_EXECUTABLE = resolveArmObjcopyExecutable();
export const ARM_SIZE_EXECUTABLE = resolveArmSizeExecutable();
