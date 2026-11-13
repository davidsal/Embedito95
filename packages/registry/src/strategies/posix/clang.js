import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

const CLANG_EXECUTABLE_NAME = "clang++";
const CLANG_WINDOWS_EXECUTABLE_NAME = "clang++.exe";
const CLANG_VERSION_FLAG = "--version";
const CLANG_LOOKUP_TIMEOUT_MILLISECONDS = 10000;
const CLANG_PATH_CONFIG_KEY = "clangPath";
const MACOS_PLATFORM = "darwin";
const WINDOWS_PLATFORM = "win32";
const DEFAULT_PLATFORM = process.platform;
const GLOBAL_CONFIG_INDENT = "\t";
// The global config is shared with the board strategies. Keep the same path
// (`~/.embedito95/config.json`) so `doctor` stores every tool location in one
// file instead of creating a host-only preference store.
const EMBEDITO95_DIRECTORY = join(homedir(), ".embedito95");
const GLOBAL_CONFIG_FILE = join(EMBEDITO95_DIRECTORY, "config.json");
// Stable Command Line Tools/Xcode locations. They are not versioned on
// purpose: Apple keeps these paths across tool updates, so detection does not
// break when `xcode-select` points to a new Command Line Tools release.
const MACOS_CLANG_CANDIDATES = [
	"/Library/Developer/CommandLineTools/usr/bin/clang++",
	"/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang++",
];
const XCRUN_EXECUTABLE = "xcrun";
const XCRUN_FIND_FLAG = "--find";
const BIN_DIRECTORY_NAME = "bin";

export const CLANG_NOT_FOUND_MESSAGE =
	"clang++ not found. Install Xcode Command Line Tools (xcode-select --install) or run `embedito95-cli doctor` to set its path.";

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
		`${JSON.stringify(configuration, null, GLOBAL_CONFIG_INDENT)}\n`,
	);
};

const stripSurroundingQuotes = ({ value }) => {
	return value.replace(/^["']|["']$/g, "");
};

const resolveExecutableName = ({ platform }) => {
	return platform === WINDOWS_PLATFORM
		? CLANG_WINDOWS_EXECUTABLE_NAME
		: CLANG_EXECUTABLE_NAME;
};

const resolvePathCandidates = ({ value, platform }) => {
	const executableName = resolveExecutableName({ platform });
	const trimmedValue = stripSurroundingQuotes({ value: value.trim() });

	if (basename(trimmedValue) === executableName) {
		return [trimmedValue];
	}

	return [
		join(trimmedValue, executableName),
		join(trimmedValue, BIN_DIRECTORY_NAME, executableName),
	];
};

const isClangExecutable = ({ executablePath, spawnSync: runSpawnSync }) => {
	try {
		const lookup = runSpawnSync(executablePath, [CLANG_VERSION_FLAG], {
			stdio: "pipe",
			timeout: CLANG_LOOKUP_TIMEOUT_MILLISECONDS,
		});

		return lookup?.status === 0;
	} catch {
		return false;
	}
};

const findUsableClang = ({ candidates, spawnSync: runSpawnSync }) => {
	for (const candidate of candidates) {
		if (
			isClangExecutable({ executablePath: candidate, spawnSync: runSpawnSync })
		) {
			return candidate;
		}
	}

	return null;
};

const readConfiguredClangPath = ({ globalConfigFile }) => {
	const configuration = readGlobalConfig({ globalConfigFile });
	const configuredPath = configuration[CLANG_PATH_CONFIG_KEY];

	return typeof configuredPath === "string" ? configuredPath : null;
};

const findXcrunClang = ({ spawnSync: runSpawnSync }) => {
	try {
		const lookup = runSpawnSync(
			XCRUN_EXECUTABLE,
			[XCRUN_FIND_FLAG, CLANG_EXECUTABLE_NAME],
			{
				stdio: "pipe",
				timeout: CLANG_LOOKUP_TIMEOUT_MILLISECONDS,
			},
		);

		if (lookup?.status !== 0 || !lookup.stdout) {
			return null;
		}

		const executablePath = lookup.stdout.toString().trim();

		return executablePath &&
			isClangExecutable({ executablePath, spawnSync: runSpawnSync })
			? executablePath
			: null;
	} catch {
		return null;
	}
};

export const findClangCompiler = ({
	spawnSync: runSpawnSync = spawnSync,
	platform = DEFAULT_PLATFORM,
	globalConfigFile = GLOBAL_CONFIG_FILE,
} = {}) => {
	const configuredPath = readConfiguredClangPath({ globalConfigFile });

	if (configuredPath) {
		const configuredCandidates = resolvePathCandidates({
			value: configuredPath,
			platform,
		});
		const configuredClang = findUsableClang({
			candidates: configuredCandidates,
			spawnSync: runSpawnSync,
		});

		if (configuredClang) {
			return configuredClang;
		}
	}

	if (
		isClangExecutable({
			executablePath: resolveExecutableName({ platform }),
			spawnSync: runSpawnSync,
		})
	) {
		return resolveExecutableName({ platform });
	}

	if (platform !== MACOS_PLATFORM) {
		return null;
	}

	const macosClang = findUsableClang({
		candidates: MACOS_CLANG_CANDIDATES,
		spawnSync: runSpawnSync,
	});

	return macosClang ?? findXcrunClang({ spawnSync: runSpawnSync });
};

export const setClangPath = ({
	path,
	spawnSync: runSpawnSync = spawnSync,
	platform = DEFAULT_PLATFORM,
	globalConfigFile = GLOBAL_CONFIG_FILE,
} = {}) => {
	if (!path) {
		return false;
	}

	const candidates = resolvePathCandidates({ value: path, platform });
	const executablePath = findUsableClang({
		candidates,
		spawnSync: runSpawnSync,
	});

	if (!executablePath) {
		return false;
	}

	writeGlobalConfigValue({
		key: CLANG_PATH_CONFIG_KEY,
		value: executablePath,
		globalConfigFile,
	});

	return true;
};

export { CLANG_PATH_CONFIG_KEY, GLOBAL_CONFIG_FILE };
