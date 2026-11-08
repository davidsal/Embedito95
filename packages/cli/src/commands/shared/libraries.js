import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	installLibrary,
	LIBRARIES_DIRECTORY_NAME,
	UTF8,
} from "embedito95-core";
import { strategies } from "embedito95-registry/strategies";
import { PACKAGE_PREFIX } from "../../constants.js";

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
		version: configuration.version,
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
}) => {
	const installedLibraries = {};

	if (!existsSync(sourceDirectory)) {
		return installedLibraries;
	}

	for (const entry of readdirSync(sourceDirectory)) {
		const libraryConfigurationPath = join(sourceDirectory, entry, CONFIG_FILE);

		if (!existsSync(libraryConfigurationPath)) {
			continue;
		}

		if (registeredPackages) {
			const libraryConfiguration = JSON.parse(
				readFileSync(libraryConfigurationPath, UTF8),
			);

			if (!registeredPackages.has(libraryConfiguration.package)) {
				continue;
			}
		}

		const { packageName, packageVersion } = await installLibrary({
			sourceDirectory,
			libraryName: entry,
			projectPath,
			platform,
			enumStyle,
			destinationDirectoryName,
		});

		if (packageName && packageVersion) {
			installedLibraries[packageName] = packageVersion;
		}
	}

	return installedLibraries;
};

export const copyLibraries = async (
	projectPath,
	configuration,
	selectedPlatform,
) => {
	const installedLibraries = await installLibrariesFrom({
		sourceDirectory: getLibrarySourceDirectory(),
		projectPath,
		platform: selectedPlatform,
		enumStyle: strategies[selectedPlatform.strategy]?.enumStyle,
		destinationDirectoryName: CORE_LIBRARIES_DIRECTORY_NAME,
	});

	for (const [packageName, packageVersion] of Object.entries(
		installedLibraries,
	)) {
		configuration.core[packageName] = packageVersion;
	}
};

export const copyClientLibraries = async (
	projectPath,
	configuration,
	selectedPlatform,
) => {
	const registeredPackages = new Set(
		Object.keys(configuration.libraries ?? {}),
	);

	const installedLibraries = await installLibrariesFrom({
		sourceDirectory: getClientLibrarySourceDirectory(),
		projectPath,
		platform: selectedPlatform,
		enumStyle: strategies[selectedPlatform.strategy]?.enumStyle,
		destinationDirectoryName: LIBRARIES_DIRECTORY_NAME,
		registeredPackages,
	});

	for (const [packageName, packageVersion] of Object.entries(
		installedLibraries,
	)) {
		configuration.libraries[packageName] = packageVersion;
	}
};
