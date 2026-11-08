import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	CONFIG_FILE,
	findEnclosingProjectRoot,
	JSON_INDENTATION,
	LIBRARIES_DIRECTORY_NAME,
	LIBRARY_PROJECT_TYPE,
	MAIN_FILE,
	PROJECT_TYPE,
	UTF8,
} from "embedito95-core";
import { supportedPlatforms } from "embedito95-registry/platforms";
import { cyan, red, write, writeErrorLine, writeLine } from "../../console.js";
import {
	AGENTS_FILE_NAME,
	GITIGNORE_CONTENT,
	HEADER_BORDER_PADDING,
	HEADER_BOX_WIDTH,
	INITIAL_VERSION,
	PACKAGE_FILE,
	PACKAGE_PREFIX,
	TEMPLATE_LIBRARY_FILE,
	TEMPLATE_PROJECT_FILE,
} from "../../constants.js";
import { copyLibraries } from "../shared/libraries.js";
import { CLI_DIRECTORY, getCurrentWorkingDirectory } from "../shared/paths.js";
import { input, select } from "../shared/prompt.js";
import {
	ensurePlatformRequirements,
	isAnyUnsatisfied,
} from "../shared/requirements.js";
import { buildAgentsDocument } from "./agents-template.js";
import { copyProjectDocumentation } from "./project-docs.js";

const CURRENT_WORKING_DIRECTORY = getCurrentWorkingDirectory();
const IS_LIBRARY = process.argv[3] === "--library";
const TEMPLATE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ENVIRONMENT_OK_MESSAGE = "Toolchain ready";
const ENVIRONMENT_NOT_READY_MESSAGE = "Toolchain not ready";
const ENVIRONMENT_MISSING_MESSAGE =
	"Some requirements are missing. Run 'doctor' to fix them";
const CLI_PACKAGE = JSON.parse(
	readFileSync(join(CLI_DIRECTORY, PACKAGE_FILE), UTF8),
);

const isNameValid = (name) => {
	return /^[a-zA-Z0-9_-]+$/.test(name);
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
		writeLine(`${red("✖")} ${ENVIRONMENT_NOT_READY_MESSAGE}`);
		return false;
	}

	writeLine(`${cyan("✔")} ${ENVIRONMENT_OK_MESSAGE}`);
	return true;
};

const makeHeader = () => {
	const left = `v${CLI_PACKAGE.version}`;
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

const buildConfiguration = (projectName, platformName) => {
	const configuration = {
		name: projectName,
		type: IS_LIBRARY ? LIBRARY_PROJECT_TYPE : PROJECT_TYPE,
		embedito95Version: `embedito95@${CLI_PACKAGE.version}`,
	};

	if (IS_LIBRARY) {
		configuration.package = `${PACKAGE_PREFIX}${projectName}`;
		configuration.version = INITIAL_VERSION;
	} else {
		configuration.platform = platformName;
		configuration.core = {};
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

	projectConfiguration.libraries = {
		...(projectConfiguration.libraries ?? {}),
		[configuration.package]: configuration.version,
	};
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
		: TEMPLATE_PROJECT_FILE;
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
	copyProjectDocumentation(projectPath, CLI_PACKAGE.version);
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
	const configuration = buildConfiguration(projectName, platformName);

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
