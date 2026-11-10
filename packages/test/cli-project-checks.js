import { execFile } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	appendPackageName,
	CONFIG_FILE,
	JSON_INDENTATION,
	LIBRARIES_DIRECTORY_NAME,
	LIBRARY_PROJECT_TYPE,
	PROJECT_TYPE,
	readPackageNames,
	UTF8,
} from "embedito95-core";
import { buildAgentsDocument } from "../cli/src/commands/init/agents-template.js";
import { buildConfiguration } from "../cli/src/commands/init/index.js";
import { copyProjectDocumentation } from "../cli/src/commands/init/project-docs.js";
import { CLI_VERSION } from "../cli/src/commands/shared/cli-package.js";
import { copyDocumentation } from "../cli/src/commands/shared/docs.js";
import {
	findRegistryLibrary,
	listCoreLibraries,
	listRegistryLibraries,
} from "../cli/src/commands/shared/libraries.js";
import {
	consumeForceFlag,
	delegateToProjectVersion,
	formatDelegationFailure,
	formatDelegationNotice,
	resolveProjectToolchainVersion,
	resolveVersionAction,
	VERSION_ACTION,
} from "../cli/src/commands/shared/version.js";
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
} from "../cli/src/constants.js";
import {
	BUILD_COMMAND,
	CLI_PATH,
	CLI_PROJECT_TEMP_DIRECTORY_PREFIX,
	EMBEDITO95_PROJECT_VERSION,
	INSTALL_COMMAND,
	NODE_EXECUTABLE,
} from "./constants.js";
import { expectEqual } from "./reporting.js";

const ARDUINO_NANO_DISPLAY_NAME = "Arduino Nano";
const ABSENT_DOCS_DIRECTORY_NAME = "absent-docs";
const AVAILABLE_LIBRARIES_LABEL = "Available libraries";
const CLI_DOC_FILE_NAME = "cli.md";
const CONTROL_FLOW_TOPIC_FILE_NAME = "control-flow.md";
const CORE_LIBRARY_NAME = "gpio";
const CORE_LIBRARY_PACKAGE_NAME = "@embedito95/gpio";
const DEVELOPER_DOC_FILE_NAME = "development.md";
const DHT22_LIBRARY_NAME = "dht22";
const DHT22_PACKAGE_NAME = "@embedito95/dht22";
const DHT22_SHORT_PACKAGE_NAME = "embedito95-dht22";
const DOCS_DIRECTORY_NAME = "docs";
const DOCS_PROJECT_DIRECTORY_NAME = "docs-project";
const DOCS_VERSION = "9.9.9";
const DOCS_VERSION_FILE_NAME = "VERSION";
const DOCS_VERSION_REFERENCE = "docs/VERSION";
const INIT_LIBRARY_NAME = "init-library";
const INIT_PROJECT_NAME = "init-project";
const INSTALL_PROJECT_DIRECTORY_NAME = "install-project";
const LIBRARY_PACKAGE_PREFIX = "embedito95-";
const LANGUAGE_DOC_FILE_NAME = "e95-language.md";
const LANGUAGE_TOPIC_DIRECTORY_NAME = "language";
const LANGUAGE_TOPIC_LINK = "language/declarations.md";
const LIBRARIES_COMMAND = "libraries";
const LIBRARIES_DOC_FILE_NAME = "libraries.md";
const MISSING_DOCS_DIRECTORY_NAME = "missing-docs";
const PROJECT_NAME = "cli-project-checks";
const PROJECT_PLATFORM = "arduino-nano";
const TYPESCRIPT_MIGRATION_HEADING = "## Coming from TypeScript";
const UNKNOWN_LIBRARY_NAME = "not-a-real-library";
const INHERITED_PROJECT_VERSION_NUMBER = "1.0.0";
const INHERITED_PROJECT_VERSION = `${VERSION_PREFIX}${INHERITED_PROJECT_VERSION_NUMBER}`;
const MISMATCH_PROJECT_VERSION_NUMBER = "999.0.0";
const MISMATCH_PROJECT_VERSION = `${VERSION_PREFIX}${MISMATCH_PROJECT_VERSION_NUMBER}`;
const INVALID_PREFIX_PROJECT_VERSION = "1.2.3";
const INVALID_TYPE_PROJECT_VERSION = 123;
const VERSION_MATCH_DIRECTORY_NAME = "version-match-project";
const VERSION_MISMATCH_DIRECTORY_NAME = "version-mismatch-project";
const VERSION_MISSING_DIRECTORY_NAME = "version-missing-project";
const VERSION_NO_CONFIG_DIRECTORY_NAME = "version-no-config-project";
const VERSION_ESCAPE_DIRECTORY_NAME = "version-escape-project";
const VERSION_FORCE_DIRECTORY_NAME = "version-force-project";
const VERSION_DELEGATED_DIRECTORY_NAME = "version-delegated-project";
const VERSION_INVALID_PREFIX_DIRECTORY_NAME = "version-invalid-prefix-project";
const VERSION_INVALID_TYPE_DIRECTORY_NAME = "version-invalid-type-project";
const VERSION_PARENT_DIRECTORY_NAME = "version-parent-project";
const DELEGATION_ARGUMENT = "--verbose";
const DELEGATED_EXIT_CODE = 7;
const DELEGATED_FAILURE_EXIT_CODE = 1;
const DELEGATION_BUILD_ARGUMENTS = [BUILD_COMMAND, DELEGATION_ARGUMENT];
const POSIX_TEST_PLATFORM = "linux";
const ARDUINO_NANO_PLATFORM = {
	name: PROJECT_PLATFORM,
	displayName: ARDUINO_NANO_DISPLAY_NAME,
};

const runProcess = promisify(execFile);

const readJson = (path) => {
	return JSON.parse(readFileSync(path, UTF8));
};

const runCliCommandWithEnvironment = async (
	projectDirectory,
	environment,
	...args
) => {
	return runProcess(NODE_EXECUTABLE, [CLI_PATH, ...args], {
		cwd: projectDirectory,
		env: { ...process.env, INIT_CWD: projectDirectory, ...environment },
		encoding: UTF8,
	});
};

const runCliCommand = async (projectDirectory, ...args) => {
	return runCliCommandWithEnvironment(projectDirectory, {}, ...args);
};

const writeMinimalProject = (
	projectDirectory,
	version = EMBEDITO95_PROJECT_VERSION,
) => {
	mkdirSync(projectDirectory, { recursive: true });
	const configuration = {
		name: PROJECT_NAME,
		type: PROJECT_TYPE,
		platform: PROJECT_PLATFORM,
		core: [],
		libraries: [],
		...(version === null ? {} : { embedito95Version: version }),
	};
	writeFileSync(
		join(projectDirectory, CONFIG_FILE),
		`${JSON.stringify(configuration, null, JSON_INDENTATION)}\n`,
		UTF8,
	);
};

const checkRegistryLibraryListing = () => {
	const libraries = listRegistryLibraries();

	return [
		expectEqual(
			"registry library listing is not empty",
			libraries.length > 0,
			true,
		),
		expectEqual(
			"registry library listing includes dht22",
			libraries.some((library) => {
				return library.directoryName === DHT22_LIBRARY_NAME;
			}),
			true,
		),
		expectEqual(
			"registry libraries expose a package name",
			libraries.every((library) => {
				return typeof library.packageName === "string" && !!library.packageName;
			}),
			true,
		),
		expectEqual(
			"registry libraries do not expose a version",
			libraries.every((library) => {
				return library.version === undefined;
			}),
			true,
		),
	];
};

const checkCoreLibraryListing = () => {
	const libraries = listCoreLibraries();

	return [
		expectEqual(
			"core library listing is not empty",
			libraries.length > 0,
			true,
		),
		expectEqual(
			"core library listing includes gpio",
			libraries.some((library) => {
				return library.directoryName === CORE_LIBRARY_NAME;
			}),
			true,
		),
		expectEqual(
			"core libraries expose a package name",
			libraries.every((library) => {
				return typeof library.packageName === "string" && !!library.packageName;
			}),
			true,
		),
	];
};

const checkRegistryLibraryLookup = () => {
	const byDirectoryName = findRegistryLibrary(DHT22_LIBRARY_NAME);
	const byPackageName = findRegistryLibrary(DHT22_PACKAGE_NAME);
	const byShortPackageName = findRegistryLibrary(DHT22_SHORT_PACKAGE_NAME);
	const normalized = findRegistryLibrary(
		`  ${DHT22_LIBRARY_NAME.toUpperCase()}  `,
	);
	const unknown = findRegistryLibrary(UNKNOWN_LIBRARY_NAME);

	return [
		expectEqual(
			"find registry library by directory name",
			byDirectoryName?.packageName,
			DHT22_PACKAGE_NAME,
		),
		expectEqual(
			"find registry library by package name",
			byPackageName?.directoryName,
			DHT22_LIBRARY_NAME,
		),
		expectEqual(
			"find registry library by short package name",
			byShortPackageName?.directoryName,
			DHT22_LIBRARY_NAME,
		),
		expectEqual(
			"find registry library ignores case and surrounding spaces",
			normalized?.directoryName,
			DHT22_LIBRARY_NAME,
		),
		expectEqual("unknown registry library returns null", unknown, null),
	];
};

const checkPackageNameNormalization = () => {
	const arrayPackageNames = readPackageNames([CORE_LIBRARY_PACKAGE_NAME]);
	const objectPackageNames = readPackageNames({
		[CORE_LIBRARY_PACKAGE_NAME]: null,
	});
	const appendedPackageNames = appendPackageName([], CORE_LIBRARY_PACKAGE_NAME);
	const duplicatedPackageNames = appendPackageName(
		appendedPackageNames,
		CORE_LIBRARY_PACKAGE_NAME,
	);

	return [
		expectEqual(
			"reads package names from an array",
			arrayPackageNames.join(","),
			CORE_LIBRARY_PACKAGE_NAME,
		),
		expectEqual(
			"ignores package names in the unsupported object format",
			objectPackageNames.length,
			0,
		),
		expectEqual(
			"reads missing package names as an empty array",
			readPackageNames(undefined).length,
			0,
		),
		expectEqual(
			"appends a new package name",
			appendedPackageNames.join(","),
			CORE_LIBRARY_PACKAGE_NAME,
		),
		expectEqual(
			"does not append a duplicate package name",
			duplicatedPackageNames.join(","),
			CORE_LIBRARY_PACKAGE_NAME,
		),
	];
};

const checkInitConfiguration = () => {
	const libraryConfiguration = buildConfiguration(
		INIT_LIBRARY_NAME,
		null,
		true,
	);
	const projectConfiguration = buildConfiguration(
		INIT_PROJECT_NAME,
		PROJECT_PLATFORM,
		false,
	);

	return [
		expectEqual(
			"init library configuration uses the library project type",
			libraryConfiguration.type,
			LIBRARY_PROJECT_TYPE,
		),
		expectEqual(
			"init library configuration keeps the package name",
			libraryConfiguration.package,
			`${LIBRARY_PACKAGE_PREFIX}${INIT_LIBRARY_NAME}`,
		),
		expectEqual(
			"init library configuration omits the version field",
			"version" in libraryConfiguration,
			false,
		),
		expectEqual(
			"init library configuration keeps the toolchain version anchor",
			typeof libraryConfiguration.embedito95Version,
			"string",
		),
		expectEqual(
			"init project configuration starts with an empty core list",
			Array.isArray(projectConfiguration.core) &&
				projectConfiguration.core.length === 0,
			true,
		),
		expectEqual(
			"init project configuration starts with an empty libraries list",
			Array.isArray(projectConfiguration.libraries) &&
				projectConfiguration.libraries.length === 0,
			true,
		),
	];
};

const checkAgentsDocument = () => {
	const document = buildAgentsDocument({ platform: ARDUINO_NANO_PLATFORM });
	const unknownDocument = buildAgentsDocument({ platform: null });

	return [
		expectEqual(
			"agents document names the target platform",
			document.includes(
				`${ARDUINO_NANO_PLATFORM.displayName} (\`${ARDUINO_NANO_PLATFORM.name}\`)`,
			),
			true,
		),
		expectEqual(
			"agents document points at the pinned docs version",
			document.includes(DOCS_VERSION_REFERENCE),
			true,
		),
		expectEqual(
			"agents document names the config version field",
			document.includes("embedito95Version"),
			true,
		),
		expectEqual(
			"agents document explains the version prefix",
			document.includes("`embedito95@`"),
			true,
		),
		expectEqual(
			"agents document states docs/VERSION holds the same version",
			document.includes(`\`${DOCS_VERSION_REFERENCE}\` holds the same`),
			true,
		),
		expectEqual(
			"agents document states that e95 is not TypeScript",
			document.includes("e95 is not TypeScript"),
			true,
		),
		expectEqual(
			"agents document points at the language reference",
			document.includes(`${DOCS_DIRECTORY_NAME}/${LANGUAGE_DOC_FILE_NAME}`),
			true,
		),
		expectEqual(
			"agents document points at the libraries command",
			document.includes(`embedito95-cli ${LIBRARIES_COMMAND}`),
			true,
		),
		expectEqual(
			"agents document does not duplicate the language rules",
			document.includes("There are no `interface`"),
			false,
		),
		expectEqual(
			"agents document falls back to an unknown platform label",
			unknownDocument.includes("unknown"),
			true,
		),
	];
};

const checkProjectDocsCopy = (projectDirectory) => {
	const copied = copyProjectDocumentation(projectDirectory, DOCS_VERSION);
	const docsDirectory = join(projectDirectory, DOCS_DIRECTORY_NAME);

	return [
		expectEqual("project docs copy reports success", copied, true),
		expectEqual(
			"project docs copy includes the CLI reference",
			existsSync(join(docsDirectory, CLI_DOC_FILE_NAME)),
			true,
		),
		expectEqual(
			"project docs copy includes the library reference",
			existsSync(join(docsDirectory, LIBRARIES_DOC_FILE_NAME)),
			true,
		),
		expectEqual(
			"project docs copy excludes development docs",
			existsSync(join(docsDirectory, DEVELOPER_DOC_FILE_NAME)),
			false,
		),
		expectEqual(
			"project docs copy pins the requested version",
			readFileSync(join(docsDirectory, DOCS_VERSION_FILE_NAME), UTF8),
			`${DOCS_VERSION}\n`,
		),
		expectEqual(
			"language reference documents the TypeScript differences",
			readFileSync(join(docsDirectory, LANGUAGE_DOC_FILE_NAME), UTF8).includes(
				TYPESCRIPT_MIGRATION_HEADING,
			),
			true,
		),
		expectEqual(
			"language reference links to the topic files",
			readFileSync(join(docsDirectory, LANGUAGE_DOC_FILE_NAME), UTF8).includes(
				LANGUAGE_TOPIC_LINK,
			),
			true,
		),
		expectEqual(
			"language topic files are copied",
			existsSync(
				join(
					docsDirectory,
					LANGUAGE_TOPIC_DIRECTORY_NAME,
					CONTROL_FLOW_TOPIC_FILE_NAME,
				),
			),
			true,
		),
	];
};

const checkMissingDocsSource = (temporaryDirectory) => {
	const destinationDirectory = join(
		temporaryDirectory,
		MISSING_DOCS_DIRECTORY_NAME,
	);
	const copied = copyDocumentation(
		join(temporaryDirectory, ABSENT_DOCS_DIRECTORY_NAME),
		destinationDirectory,
		DOCS_VERSION,
	);

	return [
		expectEqual("missing docs source reports no copy", copied, false),
		expectEqual(
			"missing docs source leaves the destination absent",
			existsSync(destinationDirectory),
			false,
		),
	];
};

const captureCliFailure = async (projectDirectory, ...args) => {
	try {
		await runCliCommand(projectDirectory, ...args);
		return null;
	} catch (error) {
		return error;
	}
};

const checkInstalledLibraryState = async (projectDirectory) => {
	const configuration = readJson(join(projectDirectory, CONFIG_FILE));
	const libraryOutput = await runCliCommand(
		projectDirectory,
		LIBRARIES_COMMAND,
	);

	return [
		expectEqual(
			"install command registers the requested library",
			configuration.libraries.includes(DHT22_PACKAGE_NAME),
			true,
		),
		expectEqual(
			"install command copies the requested library",
			existsSync(
				join(
					projectDirectory,
					LIBRARIES_DIRECTORY_NAME,
					DHT22_LIBRARY_NAME,
					CONFIG_FILE,
				),
			),
			true,
		),
		expectEqual(
			"libraries command lists core libraries",
			libraryOutput.stdout.includes(CORE_LIBRARY_NAME),
			true,
		),
		expectEqual(
			"libraries command lists built-in libraries",
			libraryOutput.stdout.includes(DHT22_LIBRARY_NAME),
			true,
		),
		expectEqual(
			"libraries command marks installed libraries",
			libraryOutput.stdout.includes(`${DHT22_LIBRARY_NAME} (installed)`),
			true,
		),
	];
};

const checkUnknownLibraryInstall = async (projectDirectory) => {
	const unknownLibraryError = await captureCliFailure(
		projectDirectory,
		INSTALL_COMMAND,
		UNKNOWN_LIBRARY_NAME,
	);

	return [
		expectEqual(
			"install command rejects an unknown library",
			unknownLibraryError !== null,
			true,
		),
		expectEqual(
			"install command lists available libraries on unknown names",
			unknownLibraryError?.stderr.includes(AVAILABLE_LIBRARIES_LABEL),
			true,
		),
	];
};

const checkInstallLibraryCommand = async (temporaryDirectory) => {
	const projectDirectory = join(
		temporaryDirectory,
		INSTALL_PROJECT_DIRECTORY_NAME,
	);
	writeMinimalProject(projectDirectory);

	await runCliCommand(projectDirectory, INSTALL_COMMAND, DHT22_LIBRARY_NAME);

	return [
		...(await checkInstalledLibraryState(projectDirectory)),
		...(await checkUnknownLibraryInstall(projectDirectory)),
	];
};

const createVersionProject = (temporaryDirectory, directoryName, version) => {
	const projectDirectory = join(temporaryDirectory, directoryName);
	writeMinimalProject(projectDirectory, version);
	return projectDirectory;
};

const resolveAction = (projectDirectory, options = {}) => {
	return resolveVersionAction({
		workingDirectory: projectDirectory,
		runningVersion: CLI_VERSION,
		...options,
	});
};

class SpawnRecorder {
	constructor(result) {
		this.result = result;
		this.calls = [];
	}

	record(command, commandArguments, spawnOptions) {
		this.calls.push({ command, commandArguments, spawnOptions });
		return this.result;
	}
}

const throwSpawn = () => {
	throw new Error("spawn failed");
};

const ignoreMessage = () => {};

const checkVersionDecision = (temporaryDirectory) => {
	const matchProject = createVersionProject(
		temporaryDirectory,
		VERSION_MATCH_DIRECTORY_NAME,
		EMBEDITO95_PROJECT_VERSION,
	);
	const mismatchProject = createVersionProject(
		temporaryDirectory,
		VERSION_MISMATCH_DIRECTORY_NAME,
		MISMATCH_PROJECT_VERSION,
	);
	const missingProject = createVersionProject(
		temporaryDirectory,
		VERSION_MISSING_DIRECTORY_NAME,
		null,
	);
	const invalidPrefixProject = createVersionProject(
		temporaryDirectory,
		VERSION_INVALID_PREFIX_DIRECTORY_NAME,
		INVALID_PREFIX_PROJECT_VERSION,
	);
	const invalidTypeProject = createVersionProject(
		temporaryDirectory,
		VERSION_INVALID_TYPE_DIRECTORY_NAME,
		INVALID_TYPE_PROJECT_VERSION,
	);
	createVersionProject(
		temporaryDirectory,
		VERSION_ESCAPE_DIRECTORY_NAME,
		MISMATCH_PROJECT_VERSION,
	);
	createVersionProject(
		temporaryDirectory,
		VERSION_FORCE_DIRECTORY_NAME,
		MISMATCH_PROJECT_VERSION,
	);
	createVersionProject(
		temporaryDirectory,
		VERSION_DELEGATED_DIRECTORY_NAME,
		MISMATCH_PROJECT_VERSION,
	);

	const noConfigDirectory = join(
		temporaryDirectory,
		VERSION_NO_CONFIG_DIRECTORY_NAME,
	);
	mkdirSync(noConfigDirectory, { recursive: true });

	const mismatchAction = resolveAction(mismatchProject);
	const skippedAction = resolveAction(mismatchProject, {
		environment: {
			[SKIP_VERSION_CHECK_ENVIRONMENT_KEY]:
				SKIP_VERSION_CHECK_ENVIRONMENT_VALUE,
		},
	});
	const delegatedAction = resolveAction(mismatchProject, {
		environment: { [DELEGATED_ENVIRONMENT_KEY]: DELEGATED_ENVIRONMENT_VALUE },
	});

	return [
		expectEqual(
			"matching project versions run the current CLI",
			resolveAction(matchProject).type,
			VERSION_ACTION.run,
		),
		expectEqual(
			"differing project versions delegate",
			mismatchAction.type,
			VERSION_ACTION.delegate,
		),
		expectEqual(
			"delegation pins the project version",
			mismatchAction.projectVersion,
			MISMATCH_PROJECT_VERSION_NUMBER,
		),
		expectEqual(
			"missing project version runs the current CLI",
			resolveAction(missingProject).type,
			VERSION_ACTION.run,
		),
		expectEqual(
			"missing config runs the current CLI",
			resolveAction(noConfigDirectory).type,
			VERSION_ACTION.run,
		),
		expectEqual(
			"invalid version prefix runs the current CLI",
			resolveAction(invalidPrefixProject).type,
			VERSION_ACTION.run,
		),
		expectEqual(
			"non-string project version runs the current CLI",
			resolveAction(invalidTypeProject).type,
			VERSION_ACTION.run,
		),
		expectEqual(
			"force runs the current CLI",
			resolveAction(mismatchProject, { force: true }).type,
			VERSION_ACTION.run,
		),
		expectEqual(
			"skip environment variable runs the current CLI",
			skippedAction.type,
			VERSION_ACTION.run,
		),
		expectEqual(
			"delegated child does not delegate again",
			delegatedAction.type,
			VERSION_ACTION.run,
		),
	];
};

const buildExpectedDelegatedArguments = () => {
	return [
		NPX_YES_FLAG,
		`${CLI_PACKAGE_NAME}@${MISMATCH_PROJECT_VERSION_NUMBER}`,
		...DELEGATION_BUILD_ARGUMENTS,
	].join(" ");
};

const checkDelegationExecution = () => {
	const recorder = new SpawnRecorder({ status: DELEGATED_EXIT_CODE });
	const messages = [];
	const exitCode = delegateToProjectVersion({
		projectVersion: MISMATCH_PROJECT_VERSION_NUMBER,
		commandArguments: DELEGATION_BUILD_ARGUMENTS,
		environment: { KEEP: "1" },
		platform: POSIX_TEST_PLATFORM,
		spawn: recorder.record.bind(recorder),
		writeMessage: messages.push.bind(messages),
	});
	const call = recorder.calls[0];

	return [
		expectEqual(
			"delegation returns the child exit code",
			exitCode,
			DELEGATED_EXIT_CODE,
		),
		expectEqual("delegation runs npx", call?.command, NPX_COMMAND),
		expectEqual(
			"delegation forwards the command arguments",
			call?.commandArguments.join(" "),
			buildExpectedDelegatedArguments(),
		),
		expectEqual(
			"delegation inherits stdio",
			call?.spawnOptions.stdio,
			INHERITED_STDIO,
		),
		expectEqual(
			"delegation keeps the environment",
			call?.spawnOptions.env.KEEP,
			"1",
		),
		expectEqual(
			"delegation marks the child process",
			call?.spawnOptions.env[DELEGATED_ENVIRONMENT_KEY],
			DELEGATED_ENVIRONMENT_VALUE,
		),
		expectEqual(
			"delegation prints one notice line",
			messages.join("\n"),
			formatDelegationNotice({
				projectVersion: MISMATCH_PROJECT_VERSION_NUMBER,
			}),
		),
	];
};

const checkDelegationFailure = () => {
	const startFailureRecorder = new SpawnRecorder({
		status: null,
		error: new Error("ENOENT"),
	});
	const startFailureMessages = [];
	const startFailureExitCode = delegateToProjectVersion({
		projectVersion: MISMATCH_PROJECT_VERSION_NUMBER,
		commandArguments: DELEGATION_BUILD_ARGUMENTS,
		spawn: startFailureRecorder.record.bind(startFailureRecorder),
		writeMessage: startFailureMessages.push.bind(startFailureMessages),
	});
	const throwMessages = [];
	const throwExitCode = delegateToProjectVersion({
		projectVersion: MISMATCH_PROJECT_VERSION_NUMBER,
		commandArguments: DELEGATION_BUILD_ARGUMENTS,
		spawn: throwSpawn,
		writeMessage: throwMessages.push.bind(throwMessages),
	});
	const expectedFailure = formatDelegationFailure({
		projectVersion: MISMATCH_PROJECT_VERSION_NUMBER,
		commandArguments: DELEGATION_BUILD_ARGUMENTS,
	});

	return [
		expectEqual(
			"failed delegation returns a failure exit code",
			startFailureExitCode,
			DELEGATED_FAILURE_EXIT_CODE,
		),
		expectEqual(
			"failed delegation reports the manual command",
			startFailureMessages[1],
			expectedFailure,
		),
		expectEqual(
			"manual command names the pinned CLI",
			expectedFailure.includes(
				`${NPX_COMMAND} ${CLI_PACKAGE_NAME}@${MISMATCH_PROJECT_VERSION_NUMBER}`,
			),
			true,
		),
		expectEqual(
			"manual command mentions the force flag",
			expectedFailure.includes(FORCE_FLAG),
			true,
		),
		expectEqual(
			"thrown spawn failures return a failure exit code",
			throwExitCode,
			DELEGATED_FAILURE_EXIT_CODE,
		),
		expectEqual(
			"thrown spawn failures report the manual command",
			throwMessages[1],
			expectedFailure,
		),
	];
};

const checkDelegationPlatformCommand = () => {
	const windowsRecorder = new SpawnRecorder({ status: DELEGATED_EXIT_CODE });
	const posixRecorder = new SpawnRecorder({ status: DELEGATED_EXIT_CODE });

	delegateToProjectVersion({
		projectVersion: MISMATCH_PROJECT_VERSION_NUMBER,
		commandArguments: DELEGATION_BUILD_ARGUMENTS,
		platform: WINDOWS_PLATFORM,
		spawn: windowsRecorder.record.bind(windowsRecorder),
		writeMessage: ignoreMessage,
	});
	delegateToProjectVersion({
		projectVersion: MISMATCH_PROJECT_VERSION_NUMBER,
		commandArguments: DELEGATION_BUILD_ARGUMENTS,
		platform: POSIX_TEST_PLATFORM,
		spawn: posixRecorder.record.bind(posixRecorder),
		writeMessage: ignoreMessage,
	});

	const windowsCall = windowsRecorder.calls[0];
	const posixCall = posixRecorder.calls[0];
	const expectedArguments = [
		NPX_YES_FLAG,
		`${CLI_PACKAGE_NAME}@${MISMATCH_PROJECT_VERSION_NUMBER}`,
		...DELEGATION_BUILD_ARGUMENTS,
	];

	return [
		expectEqual(
			"windows delegation uses the command interpreter",
			windowsCall?.command,
			WINDOWS_COMMAND_INTERPRETER,
		),
		expectEqual(
			"windows delegation runs npx through the run flag",
			windowsCall?.commandArguments.join(" "),
			[
				WINDOWS_COMMAND_INTERPRETER_RUN_FLAG,
				NPX_COMMAND,
				...expectedArguments,
			].join(" "),
		),
		expectEqual(
			"posix delegation runs npx directly",
			posixCall?.command,
			NPX_COMMAND,
		),
		expectEqual(
			"posix delegation forwards arguments without an interpreter",
			posixCall?.commandArguments.join(" "),
			expectedArguments.join(" "),
		),
	];
};

const checkForceFlagConsumption = () => {
	const withForce = consumeForceFlag([
		BUILD_COMMAND,
		FORCE_FLAG,
		DELEGATION_ARGUMENT,
	]);
	const withoutForce = consumeForceFlag([BUILD_COMMAND, DELEGATION_ARGUMENT]);

	return [
		expectEqual("force flag is detected", withForce.force, true),
		expectEqual(
			"force flag is not forwarded to commands",
			withForce.commandArguments.join(" "),
			`${BUILD_COMMAND} ${DELEGATION_ARGUMENT}`,
		),
		expectEqual("absent force flag stays false", withoutForce.force, false),
		expectEqual(
			"command arguments are preserved without force",
			withoutForce.commandArguments.join(" "),
			`${BUILD_COMMAND} ${DELEGATION_ARGUMENT}`,
		),
	];
};

const checkToolchainVersionInheritance = (temporaryDirectory) => {
	const parentDirectory = join(
		temporaryDirectory,
		VERSION_PARENT_DIRECTORY_NAME,
	);
	writeMinimalProject(parentDirectory, INHERITED_PROJECT_VERSION);
	const inheritedVersion = resolveProjectToolchainVersion({
		isLibrary: true,
		projectRoot: parentDirectory,
	});
	const standaloneVersion = resolveProjectToolchainVersion({
		isLibrary: true,
		projectRoot: null,
	});
	const projectVersion = resolveProjectToolchainVersion({
		isLibrary: false,
		projectRoot: parentDirectory,
	});
	const libraryConfiguration = buildConfiguration(
		INIT_LIBRARY_NAME,
		null,
		true,
		inheritedVersion,
	);

	return [
		expectEqual(
			"init --library inherits the parent project version",
			inheritedVersion,
			INHERITED_PROJECT_VERSION_NUMBER,
		),
		expectEqual(
			"standalone libraries fall back to the CLI version",
			standaloneVersion,
			CLI_VERSION,
		),
		expectEqual(
			"project init keeps the CLI version",
			projectVersion,
			CLI_VERSION,
		),
		expectEqual(
			"inherited library config keeps the parent version",
			libraryConfiguration.embedito95Version,
			INHERITED_PROJECT_VERSION,
		),
	];
};

export const runCliProjectChecks = async () => {
	const temporaryDirectory = mkdtempSync(
		join(tmpdir(), CLI_PROJECT_TEMP_DIRECTORY_PREFIX),
	);

	try {
		return [
			...checkRegistryLibraryListing(),
			...checkCoreLibraryListing(),
			...checkRegistryLibraryLookup(),
			...checkPackageNameNormalization(),
			...checkInitConfiguration(),
			...checkAgentsDocument(),
			...checkProjectDocsCopy(
				join(temporaryDirectory, DOCS_PROJECT_DIRECTORY_NAME),
			),
			...checkMissingDocsSource(temporaryDirectory),
			...checkToolchainVersionInheritance(temporaryDirectory),
			...checkVersionDecision(temporaryDirectory),
			...checkDelegationExecution(),
			...checkDelegationFailure(),
			...checkDelegationPlatformCommand(),
			...checkForceFlagConsumption(),
			...(await checkInstallLibraryCommand(temporaryDirectory)),
		];
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
};
