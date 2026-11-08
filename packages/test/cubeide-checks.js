// Hermetic checks for STM32CubeIDE discovery (TICKET-97). Platform, parent
// directories, the macOS app bundle root and the global config file are all
// injected, so the checks exercise Windows/Linux/macOS without reading or
// writing the real `~/.embedito95`.
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { shared } from "embedito95-core";
import {
	findStm32CubeProg,
	findStm32Toolchain,
	setCubeIdeRoot,
} from "../core/src/strategy-shared/cubeide.js";
import { expectEqual } from "./reporting.js";

const TEMPORARY_DIRECTORY_PREFIX = "embedito95-cubeide-";
const UTF8 = "utf8";
const JSON_INDENTATION = 2;
const WINDOWS_PLATFORM = "win32";
const LINUX_PLATFORM = "linux";
const MACOS_PLATFORM = "darwin";
const WINDOWS_LOOKUP_COMMAND = "where";
const POSIX_LOOKUP_COMMAND = "which";
const WINDOWS_INSTALLATION_DIRECTORY_NAME = "STM32CubeIDE_1.16.0";
const LINUX_INSTALLATION_DIRECTORY_NAME = "stm32cubeide_1.16.0";
const CUBEIDE_DIRECTORY_NAME = "STM32CubeIDE";
const PLUGINS_DIRECTORY_NAME = "plugins";
const MACOS_BUNDLE_DIRECTORY_NAME = "STM32CubeIDE.app";
const MACOS_ECLIPSE_DIRECTORY = join("Contents", "Eclipse");
const TOOLCHAIN_PLUGIN_NAME =
	"com.st.stm32cube.ide.mcu.externaltools.gnu-tools-for-stm32.12.3.rel1";
const CUBEPROG_PLUGIN_NAME =
	"com.st.stm32cube.ide.mcu.externaltools.cubeprogrammer.1.0.0";
const TOOLCHAIN_BIN_DIRECTORY = join("tools", "bin");
const CONFIG_FILE_NAME = "config.json";
const CUBE_IDE_ROOT_CONFIG_KEY = "cubeIdeRoot";
const PRESERVED_CONFIG_KEY = "preservedKey";
const PRESERVED_CONFIG_VALUE = "preservedValue";
const INVALID_ROOT = "C:\\does-not-exist";
const LOOKUP_NOT_FOUND = 1;
const LOOKUP_FOUND = 0;

const withTemporaryDirectory = async (callback) => {
	const directory = mkdtempSync(join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX));
	try {
		return await callback(directory);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

const writeEmptyFile = ({ filePath }) => {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, "");
};

const buildMissingConfigPath = ({ temporaryDirectory }) => {
	return join(temporaryDirectory, "empty", CONFIG_FILE_NAME);
};

const writeConfig = ({ temporaryDirectory, configuration }) => {
	const globalConfigFile = join(temporaryDirectory, "config", CONFIG_FILE_NAME);
	mkdirSync(dirname(globalConfigFile), { recursive: true });
	writeFileSync(
		globalConfigFile,
		`${JSON.stringify(configuration, null, JSON_INDENTATION)}\n`,
	);
	return globalConfigFile;
};

const readConfig = ({ globalConfigFile }) => {
	return JSON.parse(readFileSync(globalConfigFile, UTF8));
};

const writePluginExecutables = ({ pluginsDirectory, platform }) => {
	writeEmptyFile({
		filePath: join(
			pluginsDirectory,
			TOOLCHAIN_PLUGIN_NAME,
			TOOLCHAIN_BIN_DIRECTORY,
			shared.resolveArmCompilerExecutable({ platform }),
		),
	});
	writeEmptyFile({
		filePath: join(
			pluginsDirectory,
			CUBEPROG_PLUGIN_NAME,
			TOOLCHAIN_BIN_DIRECTORY,
			shared.resolveCubeProgrammerExecutable({ platform }),
		),
	});
};

const createPlainInstallation = ({ root, platform }) => {
	const pluginsDirectory = join(root, PLUGINS_DIRECTORY_NAME);
	writePluginExecutables({ pluginsDirectory, platform });
	return { root, pluginsDirectory };
};

const createNestedInstallation = ({ parentDirectory, installationName }) => {
	const installationDirectory = join(parentDirectory, installationName);
	const root = join(installationDirectory, CUBEIDE_DIRECTORY_NAME);
	const pluginsDirectory = join(root, PLUGINS_DIRECTORY_NAME);
	mkdirSync(pluginsDirectory, { recursive: true });
	return { root, pluginsDirectory };
};

const createWindowsInstallation = ({ temporaryDirectory, platform }) => {
	const parentDirectory = join(temporaryDirectory, "windows", "ST");
	const installation = createNestedInstallation({
		parentDirectory,
		installationName: WINDOWS_INSTALLATION_DIRECTORY_NAME,
	});
	writePluginExecutables({
		pluginsDirectory: installation.pluginsDirectory,
		platform,
	});
	return { parentDirectory, ...installation };
};

const createLinuxInstallation = ({ temporaryDirectory, platform }) => {
	const parentDirectory = join(temporaryDirectory, "linux", "st");
	const installation = createNestedInstallation({
		parentDirectory,
		installationName: LINUX_INSTALLATION_DIRECTORY_NAME,
	});
	writePluginExecutables({
		pluginsDirectory: installation.pluginsDirectory,
		platform,
	});
	return { parentDirectory, ...installation };
};

const createMacInstallation = ({ temporaryDirectory, platform }) => {
	const appRoot = join(temporaryDirectory, MACOS_BUNDLE_DIRECTORY_NAME);
	const pluginsDirectory = join(
		appRoot,
		MACOS_ECLIPSE_DIRECTORY,
		PLUGINS_DIRECTORY_NAME,
	);
	writePluginExecutables({ pluginsDirectory, platform });
	return { appRoot, pluginsDirectory };
};

const createRecordingSpawnSync = () => {
	const calls = [];
	const spawnSync = (lookupCommand) => {
		calls.push(lookupCommand);
		return { status: LOOKUP_NOT_FOUND, stdout: "" };
	};
	return { spawnSync, calls };
};

const checkWindowsDetection = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const platform = WINDOWS_PLATFORM;
		const installation = createWindowsInstallation({
			temporaryDirectory,
			platform,
		});
		const globalConfigFile = buildMissingConfigPath({ temporaryDirectory });
		const rootOptions = {
			platform,
			globalConfigFile,
			windowsParentDirectories: [installation.parentDirectory],
		};
		const toolchain = findStm32Toolchain(rootOptions);
		const cubeProg = findStm32CubeProg({
			spawnSync: createRecordingSpawnSync({}).spawnSync,
			...rootOptions,
		});

		return [
			expectEqual(
				"windows CubeIDE toolchain is found under C:\\ST",
				toolchain,
				join(
					installation.pluginsDirectory,
					TOOLCHAIN_PLUGIN_NAME,
					TOOLCHAIN_BIN_DIRECTORY,
				),
			),
			expectEqual(
				"windows CubeIDE uses the .exe toolchain executable",
				existsSync(
					join(toolchain, shared.resolveArmCompilerExecutable({ platform })),
				),
				true,
			),
			expectEqual(
				"windows CubeIDE programmer is found with its .exe suffix",
				cubeProg,
				join(
					installation.pluginsDirectory,
					CUBEPROG_PLUGIN_NAME,
					TOOLCHAIN_BIN_DIRECTORY,
					shared.resolveCubeProgrammerExecutable({ platform }),
				),
			),
		];
	});
};

const checkWindowsExecutableSuffix = () => {
	const expectedSuffix = process.platform === WINDOWS_PLATFORM ? ".exe" : "";
	return [
		expectEqual(
			"STM32 compile executable carries .exe only on Windows",
			shared.EXECUTABLE_SUFFIX,
			expectedSuffix,
		),
		expectEqual(
			"STM32 ARM compiler name matches the host executable suffix",
			shared.ARM_COMPILER_EXECUTABLE.endsWith(
				expectedSuffix === "" ? "g++" : ".exe",
			),
			true,
		),
	];
};

const checkLinuxDetection = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const platform = LINUX_PLATFORM;
		const installation = createLinuxInstallation({
			temporaryDirectory,
			platform,
		});
		const globalConfigFile = buildMissingConfigPath({ temporaryDirectory });
		const rootOptions = {
			platform,
			globalConfigFile,
			linuxParentDirectories: [installation.parentDirectory],
		};
		const toolchain = findStm32Toolchain(rootOptions);
		const cubeProg = findStm32CubeProg({
			spawnSync: createRecordingSpawnSync({}).spawnSync,
			...rootOptions,
		});

		return [
			expectEqual(
				"linux CubeIDE toolchain is found under /opt/st",
				toolchain,
				join(
					installation.pluginsDirectory,
					TOOLCHAIN_PLUGIN_NAME,
					TOOLCHAIN_BIN_DIRECTORY,
				),
			),
			expectEqual(
				"linux CubeIDE toolchain has no .exe suffix",
				existsSync(
					join(toolchain, shared.resolveArmCompilerExecutable({ platform })),
				),
				true,
			),
			expectEqual(
				"linux CubeIDE programmer has no .exe suffix",
				cubeProg.endsWith("STM32_Programmer_CLI"),
				true,
			),
		];
	});
};

const checkMacosDetection = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const platform = MACOS_PLATFORM;
		const installation = createMacInstallation({
			temporaryDirectory,
			platform,
		});
		const globalConfigFile = buildMissingConfigPath({ temporaryDirectory });
		const toolchain = findStm32Toolchain({
			platform,
			globalConfigFile,
			macosRoot: installation.appRoot,
		});

		return [
			expectEqual(
				"macos CubeIDE toolchain is found inside the app bundle",
				toolchain,
				join(
					installation.pluginsDirectory,
					TOOLCHAIN_PLUGIN_NAME,
					TOOLCHAIN_BIN_DIRECTORY,
				),
			),
			expectEqual(
				"macos CubeIDE toolchain has no .exe suffix",
				existsSync(
					join(toolchain, shared.resolveArmCompilerExecutable({ platform })),
				),
				true,
			),
		];
	});
};

const checkLookupCommandPerPlatform = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const globalConfigFile = buildMissingConfigPath({ temporaryDirectory });
		const windowsSpawn = createRecordingSpawnSync({});
		const linuxSpawn = createRecordingSpawnSync({});
		const windowsResult = findStm32CubeProg({
			spawnSync: windowsSpawn.spawnSync,
			platform: WINDOWS_PLATFORM,
			globalConfigFile,
			windowsParentDirectories: [],
		});
		const linuxResult = findStm32CubeProg({
			spawnSync: linuxSpawn.spawnSync,
			platform: LINUX_PLATFORM,
			globalConfigFile,
			linuxParentDirectories: [],
		});

		return [
			expectEqual(
				"windows CubeProgrammer lookup uses where",
				windowsSpawn.calls[0],
				WINDOWS_LOOKUP_COMMAND,
			),
			expectEqual(
				"linux CubeProgrammer lookup uses which",
				linuxSpawn.calls[0],
				POSIX_LOOKUP_COMMAND,
			),
			expectEqual(
				"windows lookup without matches returns null",
				windowsResult,
				null,
			),
			expectEqual(
				"linux lookup without matches returns null",
				linuxResult,
				null,
			),
		];
	});
};

const checkLookupResultIsUsed = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const expectedPath = join("C:", "Tools", "STM32_Programmer_CLI.exe");
		const spawnSync = () => {
			return { status: LOOKUP_FOUND, stdout: `${expectedPath}\r\n` };
		};
		const result = findStm32CubeProg({
			spawnSync,
			platform: WINDOWS_PLATFORM,
			globalConfigFile: buildMissingConfigPath({ temporaryDirectory }),
			windowsParentDirectories: [],
		});

		return [
			expectEqual(
				"cube programmer found on PATH is returned trimmed",
				result,
				expectedPath,
			),
		];
	});
};

const checkConfiguredRootPrecedence = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const platform = WINDOWS_PLATFORM;
		const configuredInstallation = createPlainInstallation({
			root: join(temporaryDirectory, "configured"),
			platform,
		});
		const installation = createWindowsInstallation({
			temporaryDirectory,
			platform,
		});
		const globalConfigFile = writeConfig({
			temporaryDirectory,
			configuration: {
				[CUBE_IDE_ROOT_CONFIG_KEY]: configuredInstallation.root,
			},
		});
		const toolchain = findStm32Toolchain({
			platform,
			globalConfigFile,
			windowsParentDirectories: [installation.parentDirectory],
		});

		return [
			expectEqual(
				"configured CubeIDE root takes precedence over default parents",
				toolchain,
				join(
					configuredInstallation.pluginsDirectory,
					TOOLCHAIN_PLUGIN_NAME,
					TOOLCHAIN_BIN_DIRECTORY,
				),
			),
		];
	});
};

const checkSetCubeIdeRoot = async () => {
	return withTemporaryDirectory(async (temporaryDirectory) => {
		const installation = createPlainInstallation({
			root: join(temporaryDirectory, "installation"),
			platform: WINDOWS_PLATFORM,
		});
		const globalConfigFile = writeConfig({
			temporaryDirectory,
			configuration: {
				[PRESERVED_CONFIG_KEY]: PRESERVED_CONFIG_VALUE,
			},
		});
		const quotedRoot = `"${installation.root}"`;
		const accepted = setCubeIdeRoot({
			root: quotedRoot,
			globalConfigFile,
			platform: WINDOWS_PLATFORM,
		});
		const configuration = readConfig({ globalConfigFile });
		const rejected = setCubeIdeRoot({
			root: INVALID_ROOT,
			globalConfigFile,
			platform: WINDOWS_PLATFORM,
		});

		return [
			expectEqual("setCubeIdeRoot accepts a quoted valid root", accepted, true),
			expectEqual(
				"setCubeIdeRoot stores the root without surrounding quotes",
				configuration[CUBE_IDE_ROOT_CONFIG_KEY],
				installation.root,
			),
			expectEqual(
				"setCubeIdeRoot preserves other global config keys",
				configuration[PRESERVED_CONFIG_KEY],
				PRESERVED_CONFIG_VALUE,
			),
			expectEqual("setCubeIdeRoot rejects an invalid root", rejected, false),
		];
	});
};

export const runCubeIdeChecks = async () => {
	return [
		...(await checkWindowsDetection()),
		...checkWindowsExecutableSuffix(),
		...(await checkLinuxDetection()),
		...(await checkMacosDetection()),
		...(await checkLookupCommandPerPlatform()),
		...(await checkLookupResultIsUsed()),
		...(await checkConfiguredRootPrecedence()),
		...(await checkSetCubeIdeRoot()),
	];
};
