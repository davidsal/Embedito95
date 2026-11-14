import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	appendPackageName,
	CONFIG_FILE,
	findEnclosingProjectRoot,
	JSON_INDENTATION,
	LIBRARIES_DIRECTORY_NAME,
	LIBRARY_PROJECT_TYPE,
	MAIN_FILE,
	PROJECT_TYPE,
	readPackageNames,
	UTF8,
} from "embedito95-core";
import {
	PLATFORM_CATEGORY,
	supportedPlatforms,
} from "embedito95-registry/platforms";
import { cyan, red, write, writeErrorLine, writeLine } from "../../console.js";
import {
	AGENTS_FILE_NAME,
	GITIGNORE_CONTENT,
	HEADER_BORDER_PADDING,
	HEADER_BOX_WIDTH,
	PACKAGE_PREFIX,
	TEMPLATE_HOST_PROJECT_FILE,
	TEMPLATE_LIBRARY_FILE,
	TEMPLATE_PROJECT_FILE,
	VERSION_PREFIX,
} from "../../constants.js";
import { CLI_VERSION } from "../shared/cli-package.js";
import { copyLibraries } from "../shared/libraries.js";
import { getCurrentWorkingDirectory } from "../shared/paths.js";
import { input, select } from "../shared/prompt.js";
import {
	ensurePlatformRequirements,
	isAnyUnsatisfied,
	printRequirements,
} from "../shared/requirements.js";
import { resolveProjectToolchainVersion } from "../shared/version.js";
import { buildAgentsDocument } from "./agents-template.js";
import { copyProjectDocumentation } from "./project-docs.js";

const CURRENT_WORKING_DIRECTORY = getCurrentWorkingDirectory();
const IS_LIBRARY = process.argv[3] === "--library";
const TEMPLATE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_TEMPLATE_FILES = {
	[PLATFORM_CATEGORY.BOARD]: TEMPLATE_PROJECT_FILE,
	[PLATFORM_CATEGORY.HOST]: TEMPLATE_HOST_PROJECT_FILE,
};
const DEFAULT_PLATFORM_CATEGORY = PLATFORM_CATEGORY.BOARD;
const ENVIRONMENT_OK_MESSAGE = "Toolchain ready";
const ENVIRONMENT_NOT_READY_MESSAGE = "Toolchain not ready";
const ENVIRONMENT_MISSING_MESSAGE =
	"Some requirements are missing. Run 'doctor' to fix them";

const isNameValid = (name) => {
	return /^[a-zA-Z0-9_-]+$/.test(name);
};

export const resolveProjectTemplateFile = (platform) => {
	const category = platform?.category ?? DEFAULT_PLATFORM_CATEGORY;
	return (
		PROJECT_TEMPLATE_FILES[category] ??
		PROJECT_TEMPLATE_FILES[DEFAULT_PLATFORM_CATEGORY]
	);
};

const getPlatformName = async (isLibrary) => {
	if (isLibrary) {
		return null;
	}

	return select({
		message: "Platform",
		choices: supportedPlatforms.map((platform) => {
			return { name: platform.displayName, value: platform.name };
		}),
	});
};

const getProjectName = async (isLibrary) => {
	const label = isLibrary ? "Library name" : "Project name";

	while (true) {
		const name = await input({ message: label });

		if (isNameValid(name)) {
			return name;
		}

		writeErrorLine(
			`  ${red("✖")} Invalid ${isLibrary ? "library" : "project"} name. Use only letters, numbers, hyphens and underscores`,
		);
	}
};

const findPlatform = (platformName) => {
	if (!platformName) {
		return null;
	}

	return supportedPlatforms.find((candidate) => {
		return candidate.name === platformName;
	});
};

const runEnvironmentCheck = async ({ platform }) => {
	const requirements = await ensurePlatformRequirements({ platform });

	if (isAnyUnsatisfied({ requirements })) {
		printRequirements({ requirements });
		writeLine(`${red("✖")} ${ENVIRONMENT_NOT_READY_MESSAGE}`);
		return false;
	}

	writeLine(`${cyan("✔")} ${ENVIRONMENT_OK_MESSAGE}`);
	return true;
};

const makeHeader = () => {
	const left = `v${CLI_VERSION}`;
	const right = "GT ♥";
	const padding =
		HEADER_BOX_WIDTH - left.length - right.length - HEADER_BORDER_PADDING;
	const versionLine = `║ ${left}${" ".repeat(padding)}${right} ║`;

	return `
  ╔══════════════════════════════════╗
  ║                                  ║
  ║          Embedito95              ║
  ║        by David Melara           ║
  ║                                  ║
  ║             Welcome              ║
  ║                                  ║
  ${versionLine}
  ╚══════════════════════════════════╝
`;
};

const validateProjectContext = (projectRoot) => {
	if (IS_LIBRARY || !projectRoot) {
		return;
	}

	writeErrorLine(
		`${red("✖")} Cannot create an embedito95 project inside another embedito95 project. To create a library, use 'embedito95-cli init --library'`,
	);
	process.exit(1);
};

const resolveProjectPath = (projectName, projectRoot) => {
	if (IS_LIBRARY && projectRoot) {
		return join(projectRoot, LIBRARIES_DIRECTORY_NAME, projectName);
	}
	return join(CURRENT_WORKING_DIRECTORY, projectName);
};

export const buildConfiguration = (
	projectName,
	platformName,
	isLibrary,
	toolchainVersion = CLI_VERSION,
) => {
	const configuration = {
		name: projectName,
		type: isLibrary ? LIBRARY_PROJECT_TYPE : PROJECT_TYPE,
		embedito95Version: `${VERSION_PREFIX}${toolchainVersion}`,
	};

	if (isLibrary) {
		configuration.package = `${PACKAGE_PREFIX}${projectName}`;
	} else {
		configuration.platform = platformName;
		configuration.enableCycleCollector = true;
		configuration.core = [];
		configuration.libraries = [];
	}

	return configuration;
};

const registerLibraryInParentProject = (configuration, projectRoot) => {
	if (!projectRoot) {
		return null;
	}

	const projectConfigPath = join(projectRoot, CONFIG_FILE);
	const projectConfiguration = JSON.parse(
		readFileSync(projectConfigPath, UTF8),
	);
	const projectPlatform = projectConfiguration.platform ?? null;

	projectConfiguration.libraries = appendPackageName(
		readPackageNames(projectConfiguration.libraries),
		configuration.package,
	);
	writeFileSync(
		projectConfigPath,
		`${JSON.stringify(projectConfiguration, null, JSON_INDENTATION)}\n`,
		UTF8,
	);

	return projectPlatform;
};

const prepareProjectSetup = async (
	isLibrary,
	configuration,
	projectPath,
	projectRoot,
	platform,
) => {
	if (isLibrary) {
		return registerLibraryInParentProject(configuration, projectRoot);
	}
	await copyLibraries(projectPath, configuration, platform);
	return null;
};

const writeScaffoldFiles = (
	projectPath,
	configuration,
	projectPlatform,
	isLibrary,
	platform,
) => {
	const entryFileName =
		isLibrary && projectPlatform ? `${projectPlatform}.e95` : MAIN_FILE;
	const templateName = isLibrary
		? TEMPLATE_LIBRARY_FILE
		: resolveProjectTemplateFile(platform);
	writeFileSync(
		join(projectPath, entryFileName),
		readFileSync(join(TEMPLATE_DIRECTORY, templateName), UTF8),
	);
	writeFileSync(
		join(projectPath, CONFIG_FILE),
		`${JSON.stringify(configuration, null, JSON_INDENTATION)}\n`,
	);
	writeFileSync(join(projectPath, ".gitignore"), GITIGNORE_CONTENT);

	if (isLibrary) {
		return;
	}

	writeFileSync(
		join(projectPath, AGENTS_FILE_NAME),
		buildAgentsDocument({ platform }),
		UTF8,
	);
	copyProjectDocumentation(projectPath, CLI_VERSION);
};

export const run = async () => {
	const projectRoot = findEnclosingProjectRoot(CURRENT_WORKING_DIRECTORY);
	validateProjectContext(projectRoot);

	write(makeHeader());
	writeLine();

	const projectName = await getProjectName(IS_LIBRARY);
	const projectPath = resolveProjectPath(projectName, projectRoot);

	if (existsSync(projectPath)) {
		writeErrorLine(`${red("✖")} Project already exists "${projectName}"`);
		process.exit(1);
	}

	const platformName = await getPlatformName(IS_LIBRARY);
	const platform = findPlatform(platformName);
	const environmentReady = platform
		? await runEnvironmentCheck({ platform })
		: true;
	const toolchainVersion = resolveProjectToolchainVersion({
		isLibrary: IS_LIBRARY,
		projectRoot,
	});
	const configuration = buildConfiguration(
		projectName,
		platformName,
		IS_LIBRARY,
		toolchainVersion,
	);

	mkdirSync(projectPath, { recursive: true });

	const projectPlatform = await prepareProjectSetup(
		IS_LIBRARY,
		configuration,
		projectPath,
		projectRoot,
		platform,
	);

	writeScaffoldFiles(
		projectPath,
		configuration,
		projectPlatform,
		IS_LIBRARY,
		platform,
	);
	write(
		`${cyan("✔")} ${IS_LIBRARY ? "Library" : "Project"} created: 🚀 Gotta blast!\n\n`,
	);

	if (!environmentReady) {
		writeLine(`${red("✖")} ${ENVIRONMENT_MISSING_MESSAGE}`);
		writeLine();
	}
};
