import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	MAIN_FILE,
	UTF8,
} from "../constants.js";
import { tokenize } from "../lexer/index.js";
import { parse } from "../parser/index.js";
import { processLibraryAST, sanitizeNamespace } from "./libraries.js";

const emptyLibrariesResult = () => {
	return {
		knownLibraries: new Set(),
		libraryExports: {},
		libraryFunctions: {},
		libraryTypes: {},
		libraryEnumInfo: {},
		libraryObjectTypes: {},
		projectLibraryPackages: new Set(),
		coreLibraryPackages: new Set(),
		librarySources: {},
		libraryNamespaces: {},
	};
};

const resolveLibraryEntry = (librariesDir, entry) => {
	const mainPath = join(librariesDir, entry, MAIN_FILE);

	if (existsSync(mainPath)) {
		return mainPath;
	}

	const libraryDirectory = join(librariesDir, entry);

	for (const fileName of readdirSync(libraryDirectory)) {
		if (fileName.endsWith(".e95")) {
			return join(libraryDirectory, fileName);
		}
	}

	return null;
};

const loadLibraryModule = ({
	librariesDir,
	entry,
	libraryConfigs,
	projectLibraryPackages,
	coreLibraryPackages,
	knownLibraries,
	libraryExports,
	libraryFunctions,
	libraryTypes,
	libraryEnumInfo,
	libraryObjectTypes,
	librarySources,
	libraryNamespaces,
}) => {
	const libraryConfigPath = join(librariesDir, entry, CONFIG_FILE);

	if (!existsSync(libraryConfigPath)) {
		return;
	}

	const libraryConfig = JSON.parse(readFileSync(libraryConfigPath, UTF8));
	const packageName = libraryConfig.package;

	if (!packageName || !libraryConfigs[packageName]) {
		return;
	}

	knownLibraries.add(packageName);

	if (!projectLibraryPackages.has(packageName)) {
		coreLibraryPackages.add(packageName);
	}

	const mainPath = resolveLibraryEntry(librariesDir, entry);

	if (!mainPath) {
		return;
	}

	const source = readFileSync(mainPath, UTF8);
	const { tokens } = tokenize(source);
	const { ast, comments } = parse(tokens);

	const { exportNames, functions, types } = processLibraryAST(
		ast,
		packageName,
		libraryEnumInfo,
		libraryObjectTypes,
		{ comments },
	);

	libraryExports[packageName] = exportNames;
	libraryFunctions[packageName] = functions;
	libraryTypes[packageName] = types;
	librarySources[packageName] = mainPath;
	const namespacePrefix = coreLibraryPackages.has(packageName)
		? "core_"
		: "lib_";
	libraryNamespaces[packageName] =
		`${namespacePrefix}${sanitizeNamespace(entry)}`;
};

export const loadProjectLibraries = (projectDir, options = {}) => {
	const {
		libraryDirectories: explicitLibraryDirectories = null,
		libraryConfigs: explicitLibraryConfigs = null,
		projectLibraryPackages: explicitProjectLibraryPackages = null,
	} = options;
	const configPath = join(projectDir, CONFIG_FILE);

	const config = existsSync(configPath)
		? JSON.parse(readFileSync(configPath, UTF8))
		: null;

	const libraryConfigs =
		explicitLibraryConfigs ??
		(config ? { ...(config.core ?? {}), ...(config.libraries ?? {}) } : {});
	const projectLibraryPackages =
		explicitProjectLibraryPackages ??
		new Set(Object.keys(config?.libraries ?? {}));

	if (!libraryConfigs || typeof libraryConfigs !== "object") {
		return emptyLibrariesResult();
	}

	const libraryDirectories =
		explicitLibraryDirectories ??
		[
			join(projectDir, LIBRARIES_DIRECTORY_NAME),
			join(projectDir, CORE_LIBRARIES_DIRECTORY_NAME),
		].filter((directory) => existsSync(directory));

	if (libraryDirectories.length === 0) {
		return emptyLibrariesResult();
	}

	const knownLibraries = new Set();
	const libraryExports = {};
	const libraryFunctions = {};
	const libraryTypes = {};
	const libraryEnumInfo = {};
	const libraryObjectTypes = {};
	const librarySources = {};
	const libraryNamespaces = {};
	const coreLibraryPackages = new Set();

	for (const librariesDir of libraryDirectories) {
		for (const entry of readdirSync(librariesDir)) {
			loadLibraryModule({
				librariesDir,
				entry,
				libraryConfigs,
				projectLibraryPackages,
				coreLibraryPackages,
				knownLibraries,
				libraryExports,
				libraryFunctions,
				libraryTypes,
				libraryEnumInfo,
				libraryObjectTypes,
				librarySources,
				libraryNamespaces,
			});
		}
	}

	return {
		knownLibraries,
		libraryExports,
		libraryFunctions,
		libraryTypes,
		libraryEnumInfo,
		libraryObjectTypes,
		projectLibraryPackages,
		coreLibraryPackages,
		librarySources,
		libraryNamespaces,
	};
};

export const excludeLibrary = (libraries, packageName) => {
	if (!packageName) {
		return libraries;
	}
	const copy = { ...libraries };
	for (const key of [
		"knownLibraries",
		"libraryExports",
		"libraryFunctions",
		"libraryTypes",
		"libraryEnumInfo",
		"libraryObjectTypes",
		"librarySources",
		"libraryNamespaces",
	]) {
		const value = copy[key];
		if (value instanceof Set) {
			copy[key] = new Set([...value].filter((name) => name !== packageName));
		} else if (value && typeof value === "object") {
			copy[key] = Object.fromEntries(
				Object.entries(value).filter(([name]) => name !== packageName),
			);
		}
	}
	copy.projectLibraryPackages = new Set(
		[...(copy.projectLibraryPackages ?? new Set())].filter(
			(name) => name !== packageName,
		),
	);
	return copy;
};
