import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG_FILE } from "../constants.js";
import {
	CUBEPROGRAMMER_BASENAME,
	MACOS_PLATFORM,
	resolveArmCompilerExecutable,
	resolveCubeProgrammerExecutable,
	WINDOWS_PLATFORM,
} from "./executables.js";

const DEFAULT_PLATFORM = process.platform;
const EMBEDITO95_DIRECTORY = join(homedir(), ".embedito95");
const GLOBAL_CONFIG_FILE = join(EMBEDITO95_DIRECTORY, CONFIG_FILE);
const CUBE_IDE_ROOT_CONFIG_KEY = "cubeIdeRoot";
const MACOS_CUBEIDE_ROOT = "/Applications/STM32CubeIDE.app";
const CUBEIDE_DIRECTORY_NAME = "STM32CubeIDE";
const CUBEIDE_DIRECTORY_PREFIX = "stm32cubeide";
const WINDOWS_CUBEIDE_PARENT_DIRECTORIES = [
	"C:\\ST",
	join("C:\\Program Files", "STMicroelectronics", "STM32Cube"),
];
const LINUX_CUBEIDE_PARENT_DIRECTORIES = ["/opt/st", join(homedir(), "st")];
const APP_BUNDLE_ECLIPSE_DIRECTORY = join("Contents", "Eclipse");
const PLUGINS_DIRECTORY_NAME = "plugins";
const WHICH_TIMEOUT_MILLIS = 5000;
const STM32_FW_CACHE = join(EMBEDITO95_DIRECTORY, "cache", "STM32Cube_FW_F1");
const TOOLCHAIN_PLUGIN_PREFIX =
	"com.st.stm32cube.ide.mcu.externaltools.gnu-tools-for-stm32.";
const CUBEPROG_PLUGIN_PREFIX =
	"com.st.stm32cube.ide.mcu.externaltools.cubeprogrammer.";
const TOOLCHAIN_BIN_DIRECTORY = join("tools", "bin");
const LOOKUP_COMMAND_WINDOWS = "where";
const LOOKUP_COMMAND_POSIX = "which";
const REQUIRED_FW_PATHS = [
	"Drivers/CMSIS/Include",
	"Drivers/CMSIS/Device/ST/STM32F1xx/Include",
	"Drivers/STM32F1xx_HAL_Driver/Inc",
];
const REQUIRED_FW_TEMPLATE_FILES = [
	"Drivers/CMSIS/Device/ST/STM32F1xx/Source/Templates/gcc/startup_stm32f103xb.s",
	"Drivers/CMSIS/Device/ST/STM32F1xx/Source/Templates/gcc/linker/STM32F103XB_FLASH.ld",
	"Drivers/CMSIS/Device/ST/STM32F1xx/Source/Templates/system_stm32f1xx.c",
	"Drivers/STM32F1xx_HAL_Driver/Src/stm32f1xx_ll_utils.c",
];

const readGlobalConfig = ({ globalConfigFile = GLOBAL_CONFIG_FILE } = {}) => {
	if (!existsSync(globalConfigFile)) {
		return {};
	}

	try {
		const parsed = JSON.parse(readFileSync(globalConfigFile, "utf8"));

		return typeof parsed === "object" && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
};

const readGlobalConfigValue = ({
	key,
	globalConfigFile = GLOBAL_CONFIG_FILE,
}) => {
	const parsed = readGlobalConfig({ globalConfigFile });

	return typeof parsed[key] === "string" ? parsed[key] : null;
};

const writeGlobalConfigValue = ({
	key,
	value,
	globalConfigFile = GLOBAL_CONFIG_FILE,
}) => {
	const configuration = {
		...readGlobalConfig({ globalConfigFile }),
		[key]: value,
	};

	mkdirSync(dirname(globalConfigFile), { recursive: true });
	writeFileSync(
		globalConfigFile,
		`${JSON.stringify(configuration, null, "\t")}\n`,
	);
};

const listSubdirectories = ({ directory }) => {
	if (!existsSync(directory)) {
		return [];
	}

	try {
		return readdirSync(directory, { withFileTypes: true })
			.filter((entry) => {
				return entry.isDirectory();
			})
			.map((entry) => {
				return join(directory, entry.name);
			});
	} catch {
		return [];
	}
};

const resolvePlatformParentDirectories = ({
	platform,
	windowsParentDirectories,
	linuxParentDirectories,
}) => {
	return platform === WINDOWS_PLATFORM
		? windowsParentDirectories
		: linuxParentDirectories;
};

const resolveDefaultCubeIdeRoots = ({
	platform = DEFAULT_PLATFORM,
	windowsParentDirectories = WINDOWS_CUBEIDE_PARENT_DIRECTORIES,
	linuxParentDirectories = LINUX_CUBEIDE_PARENT_DIRECTORIES,
	macosRoot = MACOS_CUBEIDE_ROOT,
} = {}) => {
	if (platform === MACOS_PLATFORM) {
		return [macosRoot];
	}

	const parentDirectories = resolvePlatformParentDirectories({
		platform,
		windowsParentDirectories,
		linuxParentDirectories,
	});

	return parentDirectories.flatMap((parentDirectory) => {
		return listSubdirectories({ directory: parentDirectory })
			.filter((entry) => {
				return entry.toLowerCase().includes(CUBEIDE_DIRECTORY_PREFIX);
			})
			.flatMap((entry) => {
				return [entry, join(entry, CUBEIDE_DIRECTORY_NAME)];
			});
	});
};

const resolveCubeIdeRoots = ({
	globalConfigFile = GLOBAL_CONFIG_FILE,
	...platformOptions
} = {}) => {
	const configuredRoot = readGlobalConfigValue({
		key: CUBE_IDE_ROOT_CONFIG_KEY,
		globalConfigFile,
	});
	const roots = [
		configuredRoot,
		...resolveDefaultCubeIdeRoots(platformOptions),
	].filter((root) => {
		return Boolean(root);
	});

	return [...new Set(roots)];
};

const resolvePluginsDirectory = ({ root }) => {
	if (!root || !existsSync(root)) {
		return null;
	}

	const appBundlePlugins = join(
		root,
		APP_BUNDLE_ECLIPSE_DIRECTORY,
		PLUGINS_DIRECTORY_NAME,
	);

	if (existsSync(appBundlePlugins)) {
		return appBundlePlugins;
	}

	const plainPlugins = join(root, PLUGINS_DIRECTORY_NAME);

	if (existsSync(plainPlugins)) {
		return plainPlugins;
	}

	return null;
};

const resolveCubeIdePluginsDirectories = (options = {}) => {
	return resolveCubeIdeRoots(options)
		.map((root) => {
			return resolvePluginsDirectory({ root });
		})
		.filter((pluginsDirectory) => {
			return Boolean(pluginsDirectory);
		});
};

const listPluginDirectories = ({ pluginsDirectory, pluginPrefix }) => {
	if (!pluginsDirectory) {
		return [];
	}

	return readdirSync(pluginsDirectory, { withFileTypes: true })
		.filter(
			(entry) => entry.isDirectory() && entry.name.startsWith(pluginPrefix),
		)
		.map((entry) => join(pluginsDirectory, entry.name))
		.sort((first, second) => second.localeCompare(first));
};

const findToolchainBinDirectory = ({
	pluginsDirectory,
	platform = DEFAULT_PLATFORM,
}) => {
	const toolchainExecutable = resolveArmCompilerExecutable({ platform });
	const toolchainPlugins = listPluginDirectories({
		pluginsDirectory,
		pluginPrefix: TOOLCHAIN_PLUGIN_PREFIX,
	});

	const toolchainPlugin = toolchainPlugins.find((directory) => {
		return existsSync(
			join(directory, TOOLCHAIN_BIN_DIRECTORY, toolchainExecutable),
		);
	});

	return toolchainPlugin
		? join(toolchainPlugin, TOOLCHAIN_BIN_DIRECTORY)
		: null;
};

const findCubeProgBinary = ({
	pluginsDirectory,
	platform = DEFAULT_PLATFORM,
}) => {
	const cubeprogExecutable = resolveCubeProgrammerExecutable({ platform });
	const cubeprogPlugins = listPluginDirectories({
		pluginsDirectory,
		pluginPrefix: CUBEPROG_PLUGIN_PREFIX,
	});

	return (
		cubeprogPlugins
			.map((directory) => {
				return join(directory, TOOLCHAIN_BIN_DIRECTORY, cubeprogExecutable);
			})
			.find((executable) => {
				return existsSync(executable);
			}) ?? null
	);
};

const hasToolchainBinary = (options) => {
	return findToolchainBinDirectory(options) !== null;
};

const hasCubeProgBinary = (options) => {
	return findCubeProgBinary(options) !== null;
};

export const findStm32Toolchain = ({
	platform = DEFAULT_PLATFORM,
	...rootOptions
} = {}) => {
	const pluginsDirectories = resolveCubeIdePluginsDirectories({
		platform,
		...rootOptions,
	});

	for (const pluginsDirectory of pluginsDirectories) {
		const toolchainBinDirectory = findToolchainBinDirectory({
			pluginsDirectory,
			platform,
		});

		if (toolchainBinDirectory) {
			return toolchainBinDirectory;
		}
	}

	return null;
};

const resolveLookupCommand = ({ platform }) => {
	return platform === WINDOWS_PLATFORM
		? LOOKUP_COMMAND_WINDOWS
		: LOOKUP_COMMAND_POSIX;
};

export const findStm32CubeProg = ({
	spawnSync,
	platform = DEFAULT_PLATFORM,
	...rootOptions
} = {}) => {
	const lookup = spawnSync(
		resolveLookupCommand({ platform }),
		[CUBEPROGRAMMER_BASENAME],
		{
			stdio: "pipe",
			timeout: WHICH_TIMEOUT_MILLIS,
		},
	);

	if (lookup.status === 0 && lookup.stdout) {
		const firstMatch = lookup.stdout
			.toString()
			.split(/\r?\n/)
			.find((line) => {
				return line.trim() !== "";
			});

		if (firstMatch) {
			return firstMatch.trim();
		}
	}

	const pluginsDirectories = resolveCubeIdePluginsDirectories({
		platform,
		...rootOptions,
	});

	for (const pluginsDirectory of pluginsDirectories) {
		const cubeProgBinary = findCubeProgBinary({ pluginsDirectory, platform });

		if (cubeProgBinary) {
			return cubeProgBinary;
		}
	}

	return null;
};

const resolveValidCubeIdeRoot = ({
	root,
	platform = DEFAULT_PLATFORM,
} = {}) => {
	const candidates = [root, join(root, CUBEIDE_DIRECTORY_NAME)];

	for (const candidate of candidates) {
		const pluginsDirectory = resolvePluginsDirectory({ root: candidate });

		if (!pluginsDirectory) {
			continue;
		}

		const hasAllTools =
			hasToolchainBinary({ pluginsDirectory, platform }) &&
			hasCubeProgBinary({ pluginsDirectory, platform });

		if (hasAllTools) {
			return candidate;
		}
	}

	return null;
};

const stripSurroundingQuotes = ({ value }) => {
	return value.replace(/^["']|["']$/g, "");
};

export const setCubeIdeRoot = ({
	root,
	globalConfigFile = GLOBAL_CONFIG_FILE,
	platform = DEFAULT_PLATFORM,
} = {}) => {
	const validRoot = resolveValidCubeIdeRoot({
		root: stripSurroundingQuotes({ value: root }),
		platform,
	});

	if (!validRoot) {
		return false;
	}

	writeGlobalConfigValue({
		key: CUBE_IDE_ROOT_CONFIG_KEY,
		value: validRoot,
		globalConfigFile,
	});

	return true;
};

export const findStm32FirmwareCache = ({
	cacheDirectory = STM32_FW_CACHE,
} = {}) => {
	if (!existsSync(cacheDirectory)) {
		return null;
	}

	const cacheIsComplete = [
		...REQUIRED_FW_PATHS,
		...REQUIRED_FW_TEMPLATE_FILES,
	].every((relativePath) => {
		return existsSync(join(cacheDirectory, relativePath));
	});

	return cacheIsComplete ? cacheDirectory : null;
};

export { STM32_FW_CACHE };
