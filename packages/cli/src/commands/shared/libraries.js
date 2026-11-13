import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	appendPackageName,
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	installLibrary,
	LIBRARIES_DIRECTORY_NAME,
	readPackageNames,
	UTF8,
} from "embedito95-core";
import { strategies } from "embedito95-registry/strategies";
import { PACKAGE_PREFIX } from "../../constants.js";
import { meetsPlatformRequirements } from "./platform-requirements.js";

const REGISTRY_SOURCE_DIRECTORY = dirname(
	dirname(fileURLToPath(import.meta.resolve("embedito95-registry/strategies"))),
);

export const getLibrarySourceDirectory = () => {
	return join(REGISTRY_SOURCE_DIRECTORY, CORE_LIBRARIES_DIRECTORY_NAME);
};

export const getClientLibrarySourceDirectory = () => {
	return join(REGISTRY_SOURCE_DIRECTORY, LIBRARIES_DIRECTORY_NAME);
};

const readRegistryLibrary = (sourceDirectory, entry) => {
	const configurationPath = join(sourceDirectory, entry, CONFIG_FILE);

	if (!existsSync(configurationPath)) {
		return null;
	}

	const configuration = JSON.parse(readFileSync(configurationPath, UTF8));

	return {
		directoryName: entry,
		packageName: configuration.package,
	};
};

const listLibrariesFrom = (sourceDirectory) => {
	if (!existsSync(sourceDirectory)) {
		return [];
	}

	return readdirSync(sourceDirectory)
		.map((entry) => {
			return readRegistryLibrary(sourceDirectory, entry);
		})
		.filter(Boolean);
};

export const listRegistryLibraries = () => {
	return listLibrariesFrom(getClientLibrarySourceDirectory());
};

export const listCoreLibraries = () => {
	return listLibrariesFrom(getLibrarySourceDirectory());
};

const getLibraryQueryNames = (library) => {
	return [
		library.directoryName,
		library.packageName,
		`${PACKAGE_PREFIX}${library.directoryName}`,
	];
};

const matchesLibraryQuery = (library, normalizedQuery) => {
	return getLibraryQueryNames(library).some((name) => {
		return name.toLowerCase() === normalizedQuery;
	});
};

export const findRegistryLibrary = (query) => {
	const normalizedQuery = query.trim().toLowerCase();

	return (
		listRegistryLibraries().find((library) => {
			return matchesLibraryQuery(library, normalizedQuery);
		}) ?? null
	);
};

const installLibrariesFrom = async ({
	sourceDirectory,
	projectPath,
	platform,
	enumStyle,
	destinationDirectoryName,
	registeredPackages = null,
	coreLibraries = null,
}) => {
	const installedPackages = [];

	if (!existsSync(sourceDirectory)) {
		return installedPackages;
	}

	const allowedLibraries = coreLibraries ? new Set(coreLibraries) : null;

	for (const entry of readdirSync(sourceDirectory)) {
		if (allowedLibraries && !allowedLibraries.has(entry)) {
			continue;
		}

		const libraryConfigurationPath = join(sourceDirectory, entry, CONFIG_FILE);

		if (!existsSync(libraryConfigurationPath)) {
			continue;
		}

		const libraryConfiguration = JSON.parse(
			readFileSync(libraryConfigurationPath, UTF8),
		);

		if (
			registeredPackages &&
			!registeredPackages.has(libraryConfiguration.package)
		) {
			continue;
		}

		if (!meetsPlatformRequirements(libraryConfiguration, platform)) {
			continue;
		}

		const { packageName } = await installLibrary({
			sourceDirectory,
			libraryName: entry,
			projectPath,
			platform,
			enumStyle,
			destinationDirectoryName,
		});

		if (packageName) {
			installedPackages.push(packageName);
		}
	}

	return installedPackages;
};

export const copyLibraries = async (
	projectPath,
	configuration,
	selectedPlatform,
) => {
	const installedPackages = await installLibrariesFrom({
		sourceDirectory: getLibrarySourceDirectory(),
		projectPath,
		platform: selectedPlatform,
		enumStyle: strategies[selectedPlatform.strategy]?.enumStyle,
		destinationDirectoryName: CORE_LIBRARIES_DIRECTORY_NAME,
		coreLibraries: selectedPlatform.coreLibraries ?? null,
	});

	configuration.core = readPackageNames(configuration.core);

	for (const packageName of installedPackages) {
		configuration.core = appendPackageName(configuration.core, packageName);
	}
};

export const copyClientLibraries = async (
	projectPath,
	configuration,
	selectedPlatform,
) => {
	const registeredPackages = new Set(readPackageNames(configuration.libraries));

	const installedPackages = await installLibrariesFrom({
		sourceDirectory: getClientLibrarySourceDirectory(),
		projectPath,
		platform: selectedPlatform,
		enumStyle: strategies[selectedPlatform.strategy]?.enumStyle,
		destinationDirectoryName: LIBRARIES_DIRECTORY_NAME,
		registeredPackages,
	});

	configuration.libraries = readPackageNames(configuration.libraries);

	for (const packageName of installedPackages) {
		configuration.libraries = appendPackageName(
			configuration.libraries,
			packageName,
		);
	}
};
