import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
	BUILD_DIRECTORY_NAME,
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	HEADER_EXTENSION,
	LIBRARY_FILE_PREFIX,
	LIBRARY_PROJECT_TYPE,
	MAIN_FILE,
	PROJECT_TYPE,
	SOURCE_EXTENSION,
	UTF8,
} from "../constants.js";
import { renderLibraryBuildArtifacts } from "../strategy-shared/index.js";
import { collectLibraryEnumInfo } from "./libraries.js";

export const findEnclosingProjectRoot = (startDirectory, options = {}) => {
	const { requireEnclosingLibrary = false } = options;
	let directory = startDirectory;
	let foundLibrary = false;

	while (true) {
		const configPath = join(directory, CONFIG_FILE);

		if (existsSync(configPath)) {
			try {
				const configuration = JSON.parse(readFileSync(configPath, UTF8));
				if (configuration.type === LIBRARY_PROJECT_TYPE) {
					foundLibrary = true;
				}
				const isProjectRoot = configuration.type === PROJECT_TYPE;
				if (isProjectRoot && (!requireEnclosingLibrary || foundLibrary)) {
					return directory;
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

const copyLibraryFiles = async (
	libraryDirectory,
	projectLibraryPath,
	projectPath,
	platform,
) => {
	mkdirSync(projectLibraryPath, { recursive: true });
	cpSync(
		join(libraryDirectory, CONFIG_FILE),
		join(projectLibraryPath, CONFIG_FILE),
	);
	const mainPath = join(libraryDirectory, MAIN_FILE);

	if (existsSync(mainPath)) {
		cpSync(mainPath, join(projectLibraryPath, MAIN_FILE));
	}

	const { loadPostInstall } = await import("embedito95-registry/strategies");
	const postInstallModule = await loadPostInstall({ libraryDirectory });

	if (postInstallModule) {
		const { run: runPostInstall } = postInstallModule;
		await runPostInstall(projectPath, platform);
	}
};

const renderLibraryArtifacts = async ({
	sourceLibraryDirectory,
	buildDirectory,
	libraryName,
	mainSource,
	packageName,
	platform,
	enumStyle,
}) => {
	const { loadLibraryDefinition } = await import(
		"embedito95-registry/strategies"
	);
	const definition = await loadLibraryDefinition({
		libraryDirectory: sourceLibraryDirectory,
		target: platform.strategy,
	});

	if (!definition?.generateSupport && !definition?.generateSource) {
		return;
	}

	const enumInfo = collectLibraryEnumInfo(mainSource, packageName);
	const { header, source } = renderLibraryBuildArtifacts(
		definition,
		platform,
		enumInfo,
		enumStyle,
	);

	if (header) {
		writeFileSync(
			join(
				buildDirectory,
				`${LIBRARY_FILE_PREFIX}${libraryName}${HEADER_EXTENSION}`,
			),
			header,
			UTF8,
		);
	}
	if (source) {
		writeFileSync(
			join(
				buildDirectory,
				`${LIBRARY_FILE_PREFIX}${libraryName}${SOURCE_EXTENSION}`,
			),
			source,
			UTF8,
		);
	}
};

const renderBundledArtifacts = async ({
	libraryDirectory,
	buildDirectory,
	platform,
	enumStyle,
}) => {
	for (const entry of readdirSync(libraryDirectory, {
		withFileTypes: true,
	})) {
		if (!entry.isDirectory()) {
			continue;
		}

		const bundledDirectory = join(libraryDirectory, entry.name);
		const bundledConfigPath = join(bundledDirectory, CONFIG_FILE);

		if (!existsSync(bundledConfigPath)) {
			continue;
		}

		const bundledConfig = JSON.parse(readFileSync(bundledConfigPath, UTF8));
		const bundledMainPath = join(bundledDirectory, MAIN_FILE);

		await renderLibraryArtifacts({
			sourceLibraryDirectory: bundledDirectory,
			buildDirectory,
			libraryName: entry.name,
			mainSource: existsSync(bundledMainPath)
				? readFileSync(bundledMainPath, UTF8)
				: "",
			packageName: bundledConfig.package,
			platform,
			enumStyle,
		});
	}
};

export const installLibrary = async ({
	sourceDirectory,
	libraryName,
	projectPath,
	platform,
	enumStyle,
	destinationDirectoryName = CORE_LIBRARIES_DIRECTORY_NAME,
}) => {
	const libraryDirectory = join(sourceDirectory, libraryName);
	const libraryConfiguration = JSON.parse(
		readFileSync(join(libraryDirectory, CONFIG_FILE), UTF8),
	);
	const packageName = libraryConfiguration.package;
	const packageVersion = libraryConfiguration.version;

	const projectLibraryPath = join(
		projectPath,
		destinationDirectoryName,
		libraryName,
	);
	await copyLibraryFiles(
		libraryDirectory,
		projectLibraryPath,
		projectPath,
		platform,
	);

	const buildDirectory = join(projectLibraryPath, BUILD_DIRECTORY_NAME);
	const { loadLibraryDefinition } = await import(
		"embedito95-registry/strategies"
	);
	const hasStrategy = await loadLibraryDefinition({
		libraryDirectory,
		target: platform.strategy,
	});

	if (hasStrategy) {
		mkdirSync(buildDirectory, { recursive: true });

		await renderLibraryArtifacts({
			sourceLibraryDirectory: libraryDirectory,
			buildDirectory,
			libraryName,
			mainSource: readFileSync(join(projectLibraryPath, MAIN_FILE), UTF8),
			packageName,
			platform,
			enumStyle,
		});

		await renderBundledArtifacts({
			libraryDirectory,
			buildDirectory,
			platform,
			enumStyle,
		});
	}

	return { packageName, packageVersion };
};

const loadConfigPlatform = async (projectDir) => {
	const configPath = join(projectDir, CONFIG_FILE);

	if (!existsSync(configPath)) {
		return null;
	}

	const config = JSON.parse(readFileSync(configPath, UTF8));
	const { platforms } = await import("embedito95-registry/platforms");

	return platforms.find((platform) => {
		return platform.name === config.platform;
	});
};

export const loadProjectEngine = async (projectDir) => {
	return loadConfigPlatform(projectDir);
};
