import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, readPackageNames, UTF8 } from "embedito95-core";
import { writeLine } from "../console.js";
import {
	listCoreLibraries,
	listRegistryLibraries,
} from "./shared/libraries.js";
import { getCurrentWorkingDirectory } from "./shared/paths.js";

const CURRENT_WORKING_DIRECTORY = getCurrentWorkingDirectory();
const CONFIGURATION_PATH = join(CURRENT_WORKING_DIRECTORY, CONFIG_FILE);
const CORE_LIBRARIES_HEADER = "Core libraries (always installed):";
const BUILT_IN_LIBRARIES_HEADER = "Built-in libraries (install <name>):";
const INSTALLED_SUFFIX = " (installed)";

const readInstalledPackages = () => {
	if (!existsSync(CONFIGURATION_PATH)) {
		return new Set();
	}

	try {
		const configuration = JSON.parse(readFileSync(CONFIGURATION_PATH, UTF8));
		return new Set(readPackageNames(configuration.libraries));
	} catch {
		return new Set();
	}
};

const printCoreLibraries = () => {
	writeLine(CORE_LIBRARIES_HEADER);

	for (const library of listCoreLibraries()) {
		writeLine(`  ${library.packageName}`);
	}
};

const printBuiltInLibraries = (installedPackages) => {
	writeLine(BUILT_IN_LIBRARIES_HEADER);

	for (const library of listRegistryLibraries()) {
		const suffix = installedPackages.has(library.packageName)
			? INSTALLED_SUFFIX
			: "";
		writeLine(`  ${library.directoryName}${suffix}`);
	}
};

export const run = () => {
	const installedPackages = readInstalledPackages();

	printCoreLibraries();
	writeLine();
	printBuiltInLibraries(installedPackages);
};
