import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	UTF8,
} from "embedito95-core";
import { loadLibraryDefinition } from "embedito95-registry/strategies";
import {
	getClientLibrarySourceDirectory,
	getLibrarySourceDirectory,
} from "../shared/libraries.js";

const scanLibraryDirectories = (roots) => {
	const packageToDirectory = new Map();
	const basenameToDirectory = new Map();

	for (const root of roots) {
		for (const entry of readdirSync(root)) {
			const directory = join(root, entry);
			const configPath = join(directory, CONFIG_FILE);
			if (!existsSync(configPath)) {
				continue;
			}
			const config = JSON.parse(readFileSync(configPath, UTF8));
			if (config.package) {
				packageToDirectory.set(config.package, directory);
			}
			basenameToDirectory.set(entry, directory);
		}
	}

	return { packageToDirectory, basenameToDirectory };
};

const resolveDirectory = (key, packageToDirectory, basenameToDirectory) => {
	return packageToDirectory.get(key) ?? basenameToDirectory.get(key) ?? null;
};

const loadLibraryModule = async (directory, strategyName) => {
	return loadLibraryDefinition({
		libraryDirectory: directory,
		target: strategyName,
	});
};

const listLibraryDirectories = (libraryRoot) => {
	const directories = [
		libraryRoot,
		join(libraryRoot, LIBRARIES_DIRECTORY_NAME),
	];

	if (existsSync(join(libraryRoot, CORE_LIBRARIES_DIRECTORY_NAME))) {
		directories.push(join(libraryRoot, CORE_LIBRARIES_DIRECTORY_NAME));
	}

	return directories.filter((directory) => existsSync(directory));
};

const matchesPlatformCapabilities = (requirements, platform) => {
	if (!requirements || !platform) {
		return false;
	}
	return Object.entries(requirements).every(([name, expected]) => {
		return platform[name] === expected;
	});
};

const isAutoImported = (autoImport, platform) => {
	if (autoImport === true) {
		return true;
	}
	if (!autoImport || typeof autoImport !== "object") {
		return false;
	}
	return matchesPlatformCapabilities(autoImport.platform, platform);
};

const collectAutoImportLibraryNames = (
	libraryNames,
	currentWorkingDirectory,
	platform,
) => {
	for (const librariesDirectory of listLibraryDirectories(
		currentWorkingDirectory,
	)) {
		for (const libraryName of readdirSync(librariesDirectory)) {
			const configPath = join(librariesDirectory, libraryName, CONFIG_FILE);
			if (!existsSync(configPath)) {
				continue;
			}
			const config = JSON.parse(readFileSync(configPath, UTF8));
			if (isAutoImported(config.autoImport, platform)) {
				libraryNames.add(libraryName);
			}
		}
	}
};

const loadLibraryPass = async ({
	libraryNames,
	loadedLibraries,
	modules,
	packageToDirectory,
	basenameToDirectory,
	strategyName,
}) => {
	for (const libraryKey of [...libraryNames]) {
		if (loadedLibraries.has(libraryKey)) {
			continue;
		}
		loadedLibraries.add(libraryKey);

		const directory = resolveDirectory(
			libraryKey,
			packageToDirectory,
			basenameToDirectory,
		);
		if (!directory) {
			continue;
		}

		const definition = await loadLibraryModule(directory, strategyName);
		if (!definition) {
			continue;
		}

		modules[basename(directory)] = definition;

		for (const dependency of definition?.dependencies ?? []) {
			libraryNames.add(dependency);
		}
	}
};

const loadLibrariesUntilConverged = async (state) => {
	const sizeBefore = state.libraryNames.size;

	await loadLibraryPass(state);

	if (state.libraryNames.size === sizeBefore) {
		return;
	}

	await loadLibrariesUntilConverged(state);
};

export const loadLibraryModules = async (
	usedLibraries,
	strategyName,
	currentWorkingDirectory,
	platform,
) => {
	const libraryNames = new Set(usedLibraries);
	collectAutoImportLibraryNames(
		libraryNames,
		currentWorkingDirectory,
		platform,
	);

	const { packageToDirectory, basenameToDirectory } = scanLibraryDirectories([
		getLibrarySourceDirectory(),
		getClientLibrarySourceDirectory(),
	]);

	const modules = {};
	const loadedLibraries = new Set();

	await loadLibrariesUntilConverged({
		libraryNames,
		loadedLibraries,
		modules,
		packageToDirectory,
		basenameToDirectory,
		strategyName,
	});

	return { modules };
};

const basename = (path) => {
	return path.split(/[\\/]/).pop();
};
