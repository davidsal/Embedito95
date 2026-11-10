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
import { copyDocumentation } from "../cli/src/commands/shared/docs.js";
import {
	findRegistryLibrary,
	listCoreLibraries,
	listRegistryLibraries,
} from "../cli/src/commands/shared/libraries.js";
import {
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
const ARDUINO_NANO_PLATFORM = {
	name: PROJECT_PLATFORM,
	displayName: ARDUINO_NANO_DISPLAY_NAME,
};

const runProcess = promisify(execFile);

const readJson = (path) => {
	return JSON.parse(readFileSync(path, UTF8));
};

const runCliCommand = async (projectDirectory, ...args) => {
	return runProcess(NODE_EXECUTABLE, [CLI_PATH, ...args], {
		cwd: projectDirectory,
		env: { ...process.env, INIT_CWD: projectDirectory },
		encoding: UTF8,
	});
};

const writeMinimalProject = (projectDirectory) => {
	mkdirSync(projectDirectory, { recursive: true });
	const configuration = {
		name: PROJECT_NAME,
		type: PROJECT_TYPE,
		embedito95Version: EMBEDITO95_PROJECT_VERSION,
		platform: PROJECT_PLATFORM,
		core: [],
		libraries: [],
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
			...(await checkInstallLibraryCommand(temporaryDirectory)),
		];
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
};
