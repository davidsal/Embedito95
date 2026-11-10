import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, findEnclosingProjectRoot, UTF8 } from "embedito95-core";
import { writeErrorLine } from "../../console.js";
import {
	CLI_PACKAGE_NAME,
	DELEGATED_ENVIRONMENT_KEY,
	DELEGATED_ENVIRONMENT_VALUE,
	FORCE_FLAG,
	INHERITED_STDIO,
	NPX_COMMAND,
	NPX_YES_FLAG,
	SKIP_VERSION_CHECK_ENVIRONMENT_KEY,
	SKIP_VERSION_CHECK_ENVIRONMENT_VALUE,
	VERSION_PREFIX,
	WINDOWS_COMMAND_INTERPRETER,
	WINDOWS_COMMAND_INTERPRETER_RUN_FLAG,
	WINDOWS_PLATFORM,
} from "../../constants.js";
import { CLI_VERSION } from "./cli-package.js";
import { getCurrentWorkingDirectory } from "./paths.js";

const FAILURE_EXIT_CODE = 1;

export const VERSION_ACTION = {
	run: "run",
	delegate: "delegate",
};

export const parseProjectVersion = (value) => {
	if (typeof value !== "string" || !value.startsWith(VERSION_PREFIX)) {
		return null;
	}

	const version = value.slice(VERSION_PREFIX.length);
	return version.length > 0 ? version : null;
};

const readConfigurationVersion = (configurationPath) => {
	if (!existsSync(configurationPath)) {
		return null;
	}

	try {
		const configuration = JSON.parse(readFileSync(configurationPath, UTF8));
		return parseProjectVersion(configuration.embedito95Version);
	} catch {
		return null;
	}
};

export const resolveProjectToolchainVersion = ({ isLibrary, projectRoot }) => {
	if (!isLibrary || !projectRoot) {
		return CLI_VERSION;
	}

	const parentVersion = readConfigurationVersion(
		join(projectRoot, CONFIG_FILE),
	);
	return parentVersion ?? CLI_VERSION;
};

export const consumeForceFlag = (commandArguments) => {
	const force = commandArguments.includes(FORCE_FLAG);
	const remainingArguments = commandArguments.filter((argument) => {
		return argument !== FORCE_FLAG;
	});

	return { force, commandArguments: remainingArguments };
};

const isVersionCheckSkipped = (environment) => {
	return (
		environment[SKIP_VERSION_CHECK_ENVIRONMENT_KEY] ===
		SKIP_VERSION_CHECK_ENVIRONMENT_VALUE
	);
};

const isDelegationActive = (environment) => {
	return environment[DELEGATED_ENVIRONMENT_KEY] === DELEGATED_ENVIRONMENT_VALUE;
};

const shouldRunCurrentCli = ({ force, environment }) => {
	return (
		force ||
		isVersionCheckSkipped(environment) ||
		isDelegationActive(environment)
	);
};

const isDelegatableVersion = ({ projectVersion, runningVersion }) => {
	return Boolean(projectVersion) && projectVersion !== runningVersion;
};

export const resolveVersionAction = (options = {}) => {
	const {
		workingDirectory = getCurrentWorkingDirectory(),
		runningVersion = CLI_VERSION,
		environment = process.env,
		force = false,
	} = options;

	if (shouldRunCurrentCli({ force, environment })) {
		return { type: VERSION_ACTION.run };
	}

	const projectRoot = findEnclosingProjectRoot(workingDirectory);

	if (!projectRoot) {
		return { type: VERSION_ACTION.run };
	}

	const projectVersion = readConfigurationVersion(
		join(projectRoot, CONFIG_FILE),
	);

	if (!isDelegatableVersion({ projectVersion, runningVersion })) {
		return { type: VERSION_ACTION.run };
	}

	return { type: VERSION_ACTION.delegate, projectVersion };
};

export const formatDelegationNotice = ({ projectVersion }) => {
	return `Using ${CLI_PACKAGE_NAME}@${projectVersion} (project pin)`;
};

const buildManualCommand = ({ projectVersion, commandArguments }) => {
	return [
		NPX_COMMAND,
		`${CLI_PACKAGE_NAME}@${projectVersion}`,
		...commandArguments,
	].join(" ");
};

export const formatDelegationFailure = ({
	projectVersion,
	commandArguments,
}) => {
	const manualCommand = buildManualCommand({
		projectVersion,
		commandArguments,
	});

	return `Could not start ${CLI_PACKAGE_NAME}@${projectVersion} for this project. Run '${manualCommand}' manually, or pass ${FORCE_FLAG} to use the running CLI.`;
};

const buildDelegatedArguments = ({ projectVersion, commandArguments }) => {
	return [
		NPX_YES_FLAG,
		`${CLI_PACKAGE_NAME}@${projectVersion}`,
		...commandArguments,
	];
};

const buildDelegatedCommand = ({
	projectVersion,
	commandArguments,
	platform,
}) => {
	const delegatedArguments = buildDelegatedArguments({
		projectVersion,
		commandArguments,
	});

	if (platform === WINDOWS_PLATFORM) {
		return {
			command: WINDOWS_COMMAND_INTERPRETER,
			commandArguments: [
				WINDOWS_COMMAND_INTERPRETER_RUN_FLAG,
				NPX_COMMAND,
				...delegatedArguments,
			],
		};
	}

	return { command: NPX_COMMAND, commandArguments: delegatedArguments };
};

const startDelegatedProcess = ({
	projectVersion,
	commandArguments,
	environment,
	platform,
	spawn,
}) => {
	const delegatedEnvironment = {
		...environment,
		[DELEGATED_ENVIRONMENT_KEY]: DELEGATED_ENVIRONMENT_VALUE,
	};
	const delegatedCommand = buildDelegatedCommand({
		projectVersion,
		commandArguments,
		platform,
	});

	try {
		return spawn(delegatedCommand.command, delegatedCommand.commandArguments, {
			stdio: INHERITED_STDIO,
			env: delegatedEnvironment,
		});
	} catch (error) {
		return { status: null, error };
	}
};

const isDelegationStartupFailure = (result) => {
	return Boolean(result?.error) || typeof result?.status !== "number";
};

export const delegateToProjectVersion = (options = {}) => {
	const {
		projectVersion,
		commandArguments = [],
		environment = process.env,
		platform = process.platform,
		spawn = spawnSync,
		writeMessage = writeErrorLine,
	} = options;

	writeMessage(formatDelegationNotice({ projectVersion }));

	const result = startDelegatedProcess({
		projectVersion,
		commandArguments,
		environment,
		platform,
		spawn,
	});

	if (isDelegationStartupFailure(result)) {
		writeMessage(formatDelegationFailure({ projectVersion, commandArguments }));
		return FAILURE_EXIT_CODE;
	}

	return result.status;
};
