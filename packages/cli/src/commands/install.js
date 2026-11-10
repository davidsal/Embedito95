import {
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
	appendPackageName,
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	JSON_INDENTATION,
	LIBRARIES_DIRECTORY_NAME,
	PROJECT_TYPE,
	readPackageNames,
	UTF8,
} from "embedito95-core";
import { platforms } from "embedito95-registry/platforms";
import { cyan, red, write, writeErrorLine, yellow } from "../console.js";
import { loadProjectConfiguration } from "./shared/config.js";
import {
	copyClientLibraries,
	copyLibraries,
	findRegistryLibrary,
	listRegistryLibraries,
} from "./shared/libraries.js";
import { getCurrentWorkingDirectory } from "./shared/paths.js";
import { confirm } from "./shared/prompt.js";

const CURRENT_WORKING_DIRECTORY = getCurrentWorkingDirectory();
const REQUESTED_LIBRARY_ARGUMENT_INDEX = 3;
const LIBRARY_QUERY = process.argv[REQUESTED_LIBRARY_ARGUMENT_INDEX] ?? null;
const AVAILABLE_LIBRARIES_LABEL = "  Available libraries: ";
const CONFIGURATION_PATH = join(CURRENT_WORKING_DIRECTORY, CONFIG_FILE);
const LIBRARIES_DIRECTORY = join(
	CURRENT_WORKING_DIRECTORY,
	LIBRARIES_DIRECTORY_NAME,
);
const CORE_LIBRARIES_DIRECTORY = join(
	CURRENT_WORKING_DIRECTORY,
	CORE_LIBRARIES_DIRECTORY_NAME,
);

const readPackageName = (libraryConfigPath) => {
	try {
		return JSON.parse(readFileSync(libraryConfigPath, UTF8)).package;
	} catch {
		// malformed library config, treat as unregistered
		return null;
	}
};

const removeCoreLibraries = () => {
	if (existsSync(CORE_LIBRARIES_DIRECTORY)) {
		rmSync(CORE_LIBRARIES_DIRECTORY, { recursive: true, force: true });
	}
};

const listUnregisteredLibraries = (configuration) => {
	if (!existsSync(LIBRARIES_DIRECTORY)) {
		return [];
	}

	const projectLibraryPackages = new Set(
		readPackageNames(configuration.libraries),
	);
	const unregisteredLibraries = [];

	for (const entry of readdirSync(LIBRARIES_DIRECTORY)) {
		const libraryConfigPath = join(LIBRARIES_DIRECTORY, entry, CONFIG_FILE);
		const packageName = readPackageName(libraryConfigPath);

		if (!projectLibraryPackages.has(packageName)) {
			unregisteredLibraries.push({ entry, packageName });
		}
	}

	return unregisteredLibraries;
};

const removeLibraries = (libraries) => {
	for (const { entry } of libraries) {
		rmSync(join(LIBRARIES_DIRECTORY, entry), { recursive: true, force: true });
	}
};

const readConfiguration = () => {
	const configuration = loadProjectConfiguration(
		CURRENT_WORKING_DIRECTORY,
		"config.json not found. Run 'embedito95-cli init' first",
	);

	if (configuration.type !== PROJECT_TYPE) {
		writeErrorLine(`${red("✖")} Cannot install libraries: not a project`);
		process.exit(1);
	}

	configuration.core = readPackageNames(configuration.core);
	configuration.libraries = readPackageNames(configuration.libraries);

	return configuration;
};

const removeUnregisteredLibraries = async (configuration) => {
	const unregisteredLibraries = listUnregisteredLibraries(configuration);

	if (unregisteredLibraries.length === 0) {
		return;
	}

	for (const { entry, packageName } of unregisteredLibraries) {
		const label = packageName ? `${entry} (${packageName})` : entry;
		writeErrorLine(
			`  ${yellow("⚠")} ${label} is not registered in config.json and would be deleted`,
		);
	}

	const confirmed = await confirm({
		message: "Delete these unregistered libraries?",
	});

	if (!confirmed) {
		writeErrorLine(
			`${red("✖")} Install aborted: unregistered libraries were kept`,
		);
		process.exit(1);
	}

	removeLibraries(unregisteredLibraries);
};

const resolvePlatform = (configuration) => {
	const selectedPlatform = platforms.find((platform) => {
		return platform.name === configuration.platform;
	});

	if (!selectedPlatform) {
		writeErrorLine(`${red("✖")} Unknown platform "${configuration.platform}"`);
		process.exit(1);
	}

	return selectedPlatform;
};

const listAvailableLibraryNames = () => {
	return listRegistryLibraries()
		.map((library) => {
			return library.directoryName;
		})
		.join(", ");
};

const reportUnknownLibrary = (query) => {
	writeErrorLine(`${red("✖")} Unknown library "${query}"`);
	writeErrorLine(`${AVAILABLE_LIBRARIES_LABEL}${listAvailableLibraryNames()}`);
};

const registerRequestedLibrary = (configuration) => {
	if (!LIBRARY_QUERY) {
		return null;
	}

	const library = findRegistryLibrary(LIBRARY_QUERY);

	if (!library) {
		reportUnknownLibrary(LIBRARY_QUERY);
		process.exit(1);
	}

	configuration.libraries = appendPackageName(
		configuration.libraries,
		library.packageName,
	);

	return library;
};

export const run = async () => {
	const configuration = readConfiguration();

	const requestedLibrary = registerRequestedLibrary(configuration);

	await removeUnregisteredLibraries(configuration);

	removeCoreLibraries();

	const selectedPlatform = resolvePlatform(configuration);

	configuration.core = [];

	await copyLibraries(
		CURRENT_WORKING_DIRECTORY,
		configuration,
		selectedPlatform,
	);

	await copyClientLibraries(
		CURRENT_WORKING_DIRECTORY,
		configuration,
		selectedPlatform,
	);

	writeFileSync(
		CONFIGURATION_PATH,
		`${JSON.stringify(configuration, null, JSON_INDENTATION)}\n`,
		UTF8,
	);

	if (requestedLibrary) {
		write(
			`${cyan("✔")} Library ${requestedLibrary.directoryName} installed: 🚀 Gotta blast!\n`,
		);
		return;
	}

	write(`${cyan("✔")} Libraries reinstalled: 🚀 Gotta blast!\n`);
};
