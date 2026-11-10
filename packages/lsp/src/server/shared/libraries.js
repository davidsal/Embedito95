import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BUILD_DIRECTORY_NAME,
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	findEnclosingProjectRoot,
	LIBRARIES_DIRECTORY_NAME,
	LIBRARY_PROJECT_TYPE,
	loadLocalModules,
	loadProjectLibraries,
	mergeModuleLibraries,
	STRATEGIES_DIRECTORY_NAME,
	UTF8,
} from "embedito95-core";

export const escapeRegex = (string) => {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const PLATFORMS_DIRECTORY_NAME = "platforms";

export const listLibraryDirectories = (baseDirectory) => {
	const directories = [];

	for (const directoryName of [
		LIBRARIES_DIRECTORY_NAME,
		CORE_LIBRARIES_DIRECTORY_NAME,
	]) {
		const directory = join(baseDirectory, directoryName);
		if (existsSync(directory)) {
			directories.push(directory);
		}
	}

	return directories;
};

const findRegistryLibrariesBase = (startDirectory) => {
	let directory = startDirectory;

	while (true) {
		const isRegistryBase = [
			LIBRARIES_DIRECTORY_NAME,
			CORE_LIBRARIES_DIRECTORY_NAME,
			PLATFORMS_DIRECTORY_NAME,
			STRATEGIES_DIRECTORY_NAME,
		].every((directoryName) => {
			return existsSync(join(directory, directoryName));
		});

		if (isRegistryBase) {
			return directory;
		}

		const parentDirectory = dirname(directory);
		if (parentDirectory === directory) {
			return null;
		}
		directory = parentDirectory;
	}
};

export const findEnclosingLibraryConfig = (startDirectory) => {
	let directory = startDirectory;

	while (true) {
		const configPath = join(directory, CONFIG_FILE);

		if (existsSync(configPath)) {
			try {
				const configuration = JSON.parse(readFileSync(configPath, UTF8));
				if (configuration.type === LIBRARY_PROJECT_TYPE) {
					return configuration;
				}
			} catch {
				// malformed config, keep walking up
			}
		}

		const parentDirectory = dirname(directory);
		if (parentDirectory === directory) {
			return null;
		}
		directory = parentDirectory;
	}
};

export const isInsideBuildDirectory = (documentDirectory) => {
	return documentDirectory.split(/[\\/]/).includes(BUILD_DIRECTORY_NAME);
};

export const findProjectRoot = (documentDirectory) => {
	if (isInsideBuildDirectory(documentDirectory)) {
		const buildProjectRoot = findEnclosingProjectRoot(documentDirectory);
		if (buildProjectRoot) {
			return buildProjectRoot;
		}
	}

	return findEnclosingProjectRoot(documentDirectory, {
		requireEnclosingLibrary: true,
	});
};

export const getLibrariesDirectory = (documentDirectory) => {
	const projectRoot = findProjectRoot(documentDirectory);

	if (projectRoot) {
		return { projectRoot, baseDirectory: projectRoot, registryBase: null };
	}

	const registryBase = findRegistryLibrariesBase(documentDirectory);

	if (registryBase) {
		return { projectRoot: null, baseDirectory: registryBase, registryBase };
	}

	return {
		projectRoot: null,
		baseDirectory: documentDirectory,
		registryBase: null,
	};
};

const collectRegistryLibraryPackages = (registryBase) => {
	const corePackages = new Set();
	const clientPackages = new Set();

	for (const [directoryName, targetPackages] of [
		[CORE_LIBRARIES_DIRECTORY_NAME, corePackages],
		[LIBRARIES_DIRECTORY_NAME, clientPackages],
	]) {
		const directory = join(registryBase, directoryName);

		if (!existsSync(directory)) {
			continue;
		}

		for (const entry of readdirSync(directory)) {
			const configPath = join(directory, entry, CONFIG_FILE);

			if (!existsSync(configPath)) {
				continue;
			}

			const config = JSON.parse(readFileSync(configPath, UTF8));

			if (config.package) {
				targetPackages.add(config.package);
			}
		}
	}

	return { corePackages, clientPackages };
};

const loadLibrariesFromContext = (documentDirectory) => {
	const { baseDirectory, registryBase } =
		getLibrariesDirectory(documentDirectory);

	if (registryBase) {
		const { corePackages, clientPackages } =
			collectRegistryLibraryPackages(registryBase);

		return loadProjectLibraries(registryBase, {
			libraryDirectories: listLibraryDirectories(registryBase),
			libraryConfigs: new Set([...corePackages, ...clientPackages]),
			projectLibraryPackages: new Set(clientPackages),
		});
	}

	return loadProjectLibraries(baseDirectory);
};

export { loadLibrariesFromContext };

export const withLocalModules = (libraries, documentPath) => {
	try {
		const projectRoot = findProjectRoot(dirname(documentPath));
		const extraDirectories = projectRoot ? [projectRoot] : [];
		const localModules = loadLocalModules(documentPath, { extraDirectories });
		return mergeModuleLibraries(
			libraries,
			localModules.librariesFor(documentPath),
		);
	} catch {
		return libraries;
	}
};

export const getLibraryName = (text) => {
	const match = text.match(
		/^\s*import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]?\s*$/,
	);

	return match ? match[1] : null;
};

export const getImportSpecifiers = (text) => {
	const match = text.match(
		/^\s*import\s*\{([^}]*)\}\s*from\s*['"][^'"]*['"]?\s*$/,
	);

	if (!match) {
		return [];
	}

	return match[1]
		.split(",")
		.map((specifier) => specifier.trim())
		.filter(Boolean)
		.map((specifier) => specifier.split(/\s+as\s+/)[0].trim());
};

const normalizeArrayType = (type) => {
	return typeof type === "string" ? type.replace(/\[\d*\]/g, "[]") : type;
};

export const loadProjectLibraryExports = (documentUri) => {
	try {
		const documentPath = fileURLToPath(documentUri);
		const documentDirectory = dirname(documentPath);
		const libraries = loadLibrariesFromContext(documentDirectory);
		const exports = [];

		for (const [libraryName, functions] of Object.entries(
			libraries.libraryFunctions,
		)) {
			for (const [name, functionInfo] of Object.entries(functions)) {
				exports.push({
					name,
					library: libraryName,
					kind: "function",
					params: functionInfo.params,
					returnType: functionInfo.returnType,
				});
			}
		}

		for (const [libraryName, exportNames] of Object.entries(
			libraries.libraryExports,
		)) {
			for (const name of exportNames) {
				if (!exports.some((existingExport) => existingExport.name === name)) {
					const libraryTypes = libraries.libraryTypes?.[libraryName] ?? {};
					const enumInfo = libraries.libraryEnumInfo?.[libraryName];
					const type = enumInfo?.members[name]
						? enumInfo.members[name]
						: normalizeArrayType(libraryTypes[name] ?? "unknown");

					exports.push({
						name,
						library: libraryName,
						kind: "constant",
						type,
					});
				}
			}
		}

		const enumMembers = {};
		const enumInfo = libraries.libraryEnumInfo ?? {};

		for (const enumInfoEntry of Object.values(enumInfo)) {
			for (const typeName of enumInfoEntry.typeNames) {
				if (!enumMembers[typeName]) {
					enumMembers[typeName] = [];
				}
			}

			for (const [member, typeName] of Object.entries(enumInfoEntry.members)) {
				if (!enumMembers[typeName]) {
					enumMembers[typeName] = [];
				}

				enumMembers[typeName].push(member);
			}
		}

		exports.enumMembers = enumMembers;

		const objectTypes = {};
		const objectTypeDefinitions = {};
		const objectTypeLibraries = {};
		const objectTypeInfo = libraries.libraryObjectTypes ?? {};

		for (const [libraryName, types] of Object.entries(objectTypeInfo)) {
			for (const [typeName, definition] of Object.entries(types)) {
				objectTypeDefinitions[typeName] = definition;
				objectTypeLibraries[typeName] = libraryName;
				objectTypes[typeName] = Object.fromEntries(
					Object.entries(definition?.methods ?? {}),
				);
			}
		}

		exports.objectTypes = objectTypes;
		exports.objectTypeDefinitions = objectTypeDefinitions;
		exports.objectTypeLibraries = objectTypeLibraries;
		return exports;
	} catch {
		return [];
	}
};
