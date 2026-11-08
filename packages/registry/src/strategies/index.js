import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STRATEGIES_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const INDEX_FILE_NAME = "index.js";
const SHARED_DIRECTORY_NAME = "shared";

const loadStrategyDirectory = async (directoryName) => {
	const indexPath = join(STRATEGIES_DIRECTORY, directoryName, INDEX_FILE_NAME);

	if (!existsSync(indexPath)) {
		return null;
	}

	const module = await import(pathToFileURL(indexPath).href);
	return module.strategy ?? null;
};

export const strategies = await (async () => {
	const strategiesByName = {};

	for (const entry of readdirSync(STRATEGIES_DIRECTORY, {
		withFileTypes: true,
	})) {
		if (!entry.isDirectory() || entry.name === SHARED_DIRECTORY_NAME) {
			continue;
		}

		const strategy = await loadStrategyDirectory(entry.name);

		if (strategy?.name) {
			strategiesByName[strategy.name] = strategy;
		}
	}

	return strategiesByName;
})();

const SUPPORT_FILE_NAME = "support.js";
const POST_INSTALL_FILE_NAME = "post-install.js";

const basename = (path) => {
	return path.split(/[\\/]/).pop();
};

const supportPath = (libraryDirectory, target) => {
	return join(
		STRATEGIES_DIRECTORY,
		target,
		basename(libraryDirectory),
		SUPPORT_FILE_NAME,
	);
};

const postInstallPath = (libraryDirectory) => {
	return join(
		STRATEGIES_DIRECTORY,
		SHARED_DIRECTORY_NAME,
		basename(libraryDirectory),
		POST_INSTALL_FILE_NAME,
	);
};

export const loadLibraryDefinition = async ({ libraryDirectory, target }) => {
	const path = supportPath(libraryDirectory, target);

	if (!existsSync(path)) {
		return null;
	}

	const libraryModule = await import(`file://${path}`);

	if (libraryModule.definition?.name !== target) {
		return null;
	}

	return libraryModule.definition;
};

export const loadPostInstall = async ({ libraryDirectory }) => {
	const path = postInstallPath(libraryDirectory);

	if (!existsSync(path)) {
		return null;
	}

	return import(`file://${path}`);
};
