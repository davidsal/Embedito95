import { execFile } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
	CONFIG_FILE,
	ENTRY_OPTION,
	installLibrary,
	JSON_INDENTATION,
	PROJECT_TYPE,
	UTF8,
} from "embedito95-core";
import { strategies } from "embedito95-registry/strategies";
import { listEntryFiles, listSubdirectories } from "./case-discovery.js";
import {
	BUILD_COMMAND,
	CLI_PATH,
	DEFAULT_LIBRARY_VERSION,
	EMBEDITO95_PROJECT_VERSION,
	GITIGNORE_CONTENT,
	GITIGNORE_FILE,
	INSTALL_COMMAND,
	NODE_EXECUTABLE,
	REGISTRY_CLIENT_LIBRARIES_DIRECTORY,
	REGISTRY_LIBRARIES_DIRECTORY,
	REGISTRY_PLATFORMS_DIRECTORY,
} from "./constants.js";

export const listLibraryNames = () => {
	return listSubdirectories(REGISTRY_LIBRARIES_DIRECTORY).filter(
		(libraryName) => {
			return existsSync(
				join(REGISTRY_LIBRARIES_DIRECTORY, libraryName, CONFIG_FILE),
			);
		},
	);
};

const copyLibraries = async (projectDirectory, platform) => {
	const configurationLibraries = {};
	const enumStyle = strategies[platform.strategy]?.enumStyle;

	for (const libraryName of listLibraryNames()) {
		const { packageName, packageVersion } = await installLibrary({
			sourceDirectory: REGISTRY_LIBRARIES_DIRECTORY,
			libraryName,
			projectPath: projectDirectory,
			platform,
			enumStyle,
		});

		if (packageName && packageVersion) {
			configurationLibraries[packageName] = packageVersion;
		}
	}

	return configurationLibraries;
};

const runExecFile = promisify(execFile);

const runCliCommand = async ({ command, projectDirectory, runProcess }) => {
	try {
		await runProcess(NODE_EXECUTABLE, [CLI_PATH, command], {
			cwd: projectDirectory,
			env: { ...process.env, INIT_CWD: projectDirectory },
			encoding: UTF8,
		});
	} catch (error) {
		throw new Error(
			`CLI ${command} failed:\n${error.stdout ?? ""}\n${error.stderr ?? ""}`,
		);
	}
};

const listProjectLibraries = () => {
	const clientLibraryNames = listSubdirectories(
		REGISTRY_CLIENT_LIBRARIES_DIRECTORY,
	).filter((libraryName) => {
		return existsSync(
			join(REGISTRY_CLIENT_LIBRARIES_DIRECTORY, libraryName, CONFIG_FILE),
		);
	});

	const projectLibraries = {};
	for (const libraryName of clientLibraryNames) {
		const configurationPath = join(
			REGISTRY_CLIENT_LIBRARIES_DIRECTORY,
			libraryName,
			CONFIG_FILE,
		);
		const libraryConfiguration = JSON.parse(
			readFileSync(configurationPath, UTF8),
		);
		if (libraryConfiguration.package) {
			projectLibraries[libraryConfiguration.package] =
				libraryConfiguration.version ?? DEFAULT_LIBRARY_VERSION;
		}
	}

	return projectLibraries;
};

const writeProjectConfiguration = (
	projectDirectory,
	platformName,
	libraryVersions,
	projectLibraries,
) => {
	const configuration = {
		name: platformName,
		type: PROJECT_TYPE,
		embedito95Version: EMBEDITO95_PROJECT_VERSION,
		platform: platformName,
		core: libraryVersions,
		libraries: projectLibraries,
	};

	writeFileSync(
		join(projectDirectory, CONFIG_FILE),
		`${JSON.stringify(configuration, null, JSON_INDENTATION)}\n`,
		UTF8,
	);
	writeFileSync(
		join(projectDirectory, GITIGNORE_FILE),
		GITIGNORE_CONTENT,
		UTF8,
	);
};

export const createProject = async (temporaryDirectory, platformName) => {
	const projectDirectory = join(temporaryDirectory, platformName);
	mkdirSync(projectDirectory, { recursive: true });

	const platformModule = await import(
		pathToFileURL(join(REGISTRY_PLATFORMS_DIRECTORY, `${platformName}.js`))
	);
	const platform = platformModule.platform;
	const libraryVersions = await copyLibraries(projectDirectory, platform);
	const projectLibraries = listProjectLibraries();

	writeProjectConfiguration(
		projectDirectory,
		platformName,
		libraryVersions,
		projectLibraries,
	);

	await runCliCommand({
		command: INSTALL_COMMAND,
		projectDirectory,
		runProcess: runExecFile,
	});

	return projectDirectory;
};

export const copyEntryFiles = (sourceDirectory, projectDirectory) => {
	for (const entryFile of listEntryFiles(sourceDirectory)) {
		cpSync(join(sourceDirectory, entryFile), join(projectDirectory, entryFile));
	}
};

export const buildEntry = async (
	projectDirectory,
	platformName,
	entryFile,
	runProcess = runExecFile,
) => {
	try {
		await runProcess(
			NODE_EXECUTABLE,
			[CLI_PATH, BUILD_COMMAND, ENTRY_OPTION, entryFile],
			{
				cwd: projectDirectory,
				env: { ...process.env, INIT_CWD: projectDirectory },
				encoding: UTF8,
			},
		);
	} catch (error) {
		throw new Error(
			`Build failed for ${platformName}/${entryFile}:\n${error.stdout ?? ""}\n${error.stderr ?? ""}`,
		);
	}
};
