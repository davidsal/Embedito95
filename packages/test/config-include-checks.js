// T-036: every header that reads the `E95_*` macro namespace must reach the
// generated `e95_config.h`, directly or through its include chain. Otherwise a
// translation unit that includes only that header falls back to the `ref.h`
// default and disagrees with the project configuration (ODR / behaviour drift).
// This group audits the strategy source headers and the real generated core
// headers for that chain, plus a fixture that proves the auditor catches a
// missing include.
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
	CORE_LIBRARIES_DIRECTORY_NAME,
	CYCLES_CONFIG_FILE_NAME,
	installLibrary,
	renderCyclesConfigHeader,
	UTF8,
} from "embedito95-core";
import { strategies } from "embedito95-registry/strategies";
import { platform as arduinoNanoPlatform } from "../registry/src/platforms/arduino-nano.js";
import {
	REGISTRY_LIBRARIES_DIRECTORY,
	REGISTRY_SOURCE_DIRECTORY,
} from "./constants.js";
import { expectEqual } from "./reporting.js";

const STRATEGIES_DIRECTORY = join(REGISTRY_SOURCE_DIRECTORY, "strategies");
const SHARED_STRATEGIES_DIRECTORY = join(STRATEGIES_DIRECTORY, "shared");
const HEADER_EXTENSIONS = [".h", ".inc"];
const TEMPORARY_DIRECTORY_PREFIX = "embedito95-config-include-";
const GENERATED_PROJECT_NAME = "generated-project";
const FIXTURE_BAD_DIRECTORY_NAME = "bad";
const FIXTURE_GOOD_DIRECTORY_NAME = "good";
const FIXTURE_HEADER_FILE_NAME = "uses_cycles.h";
const FIXTURE_HEADER_CONTENT = "#if E95_CYCLES\n#endif\n";
const FIXTURE_GOOD_HEADER_CONTENT = `#include "${CYCLES_CONFIG_FILE_NAME}"\n${FIXTURE_HEADER_CONTENT}`;
const CONFIG_FILE_NAME = "config.json";

const COMMENT_OR_STRING_PATTERN =
	/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const E95_MACRO_PATTERN = /\bE95_[A-Z0-9_]+\b/g;
const INCLUDE_PATTERN = /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm;

const stripCommentsAndStrings = (content) => {
	return content.replace(COMMENT_OR_STRING_PATTERN, "");
};

const usesE95Macro = (content) => {
	return stripCommentsAndStrings(content).match(E95_MACRO_PATTERN) !== null;
};

const collectIncludes = (content) => {
	const includes = [];
	for (const match of content.matchAll(INCLUDE_PATTERN)) {
		includes.push(match[1]);
	}
	return includes;
};

const resolveIncludePath = ({ includeName, headerDirectory, includePaths }) => {
	const candidateDirectories = [headerDirectory, ...includePaths];
	for (const directory of candidateDirectories) {
		const candidatePath = join(directory, includeName);
		if (existsSync(candidatePath)) {
			return candidatePath;
		}
	}
	return null;
};

const reachesConfigHeader = ({ headerPath, includePaths, visitedPaths }) => {
	if (visitedPaths.has(headerPath)) {
		return false;
	}
	visitedPaths.add(headerPath);

	const content = readFileSync(headerPath, UTF8);
	const headerDirectory = dirname(headerPath);
	for (const includeName of collectIncludes(content)) {
		if (basename(includeName) === CYCLES_CONFIG_FILE_NAME) {
			return true;
		}
		const resolvedInclude = resolveIncludePath({
			includeName,
			headerDirectory,
			includePaths,
		});
		if (
			resolvedInclude !== null &&
			reachesConfigHeader({
				headerPath: resolvedInclude,
				includePaths,
				visitedPaths,
			})
		) {
			return true;
		}
	}
	return false;
};

export const auditConfigIncludes = ({ headerPaths, includePaths }) => {
	const failures = [];
	for (const headerPath of headerPaths) {
		if (basename(headerPath) === CYCLES_CONFIG_FILE_NAME) {
			continue;
		}
		if (!usesE95Macro(readFileSync(headerPath, UTF8))) {
			continue;
		}
		const reachesConfig = reachesConfigHeader({
			headerPath,
			includePaths,
			visitedPaths: new Set(),
		});
		if (!reachesConfig) {
			failures.push({ headerPath, includePaths });
		}
	}
	return failures;
};

const hasHeaderExtension = (fileName) => {
	return HEADER_EXTENSIONS.some((extension) => {
		return fileName.endsWith(extension);
	});
};

const listHeadersRecursively = (directory) => {
	const headerPaths = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const entryPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			headerPaths.push(...listHeadersRecursively(entryPath));
			continue;
		}
		if (entry.isFile() && hasHeaderExtension(entry.name)) {
			headerPaths.push(entryPath);
		}
	}
	return headerPaths;
};

const checkSourceHeadersReachConfig = () => {
	const headerPaths = listHeadersRecursively(STRATEGIES_DIRECTORY);
	const failures = auditConfigIncludes({
		headerPaths,
		includePaths: [SHARED_STRATEGIES_DIRECTORY],
	});
	return [
		expectEqual(
			"strategy source headers using E95_* reach e95_config.h",
			failures.length,
			0,
		),
		expectEqual(
			"strategy source headers were found to audit",
			headerPaths.length > 0,
			true,
		),
	];
};

const writeFixture = ({ directory, fileName, content }) => {
	mkdirSync(directory, { recursive: true });
	const filePath = join(directory, fileName);
	writeFileSync(filePath, content, UTF8);
	return filePath;
};

const checkAuditorDetectsMissingInclude = (rootDirectory) => {
	const badHeaderPath = writeFixture({
		directory: join(rootDirectory, FIXTURE_BAD_DIRECTORY_NAME),
		fileName: FIXTURE_HEADER_FILE_NAME,
		content: FIXTURE_HEADER_CONTENT,
	});
	const badFailures = auditConfigIncludes({
		headerPaths: [badHeaderPath],
		includePaths: [],
	});
	return [
		expectEqual(
			"auditor flags a header that uses E95_* without the config include",
			badFailures.length,
			1,
		),
		expectEqual(
			"auditor reports the failing header path",
			badFailures[0]?.headerPath,
			badHeaderPath,
		),
	];
};

const checkAuditorAcceptsConfigInclude = (rootDirectory) => {
	const goodDirectory = join(rootDirectory, FIXTURE_GOOD_DIRECTORY_NAME);
	writeFixture({
		directory: goodDirectory,
		fileName: CYCLES_CONFIG_FILE_NAME,
		content: renderCyclesConfigHeader(true),
	});
	const goodHeaderPath = writeFixture({
		directory: goodDirectory,
		fileName: FIXTURE_HEADER_FILE_NAME,
		content: FIXTURE_GOOD_HEADER_CONTENT,
	});
	const goodFailures = auditConfigIncludes({
		headerPaths: [goodHeaderPath],
		includePaths: [goodDirectory],
	});
	return [
		expectEqual(
			"auditor accepts a header that includes e95_config.h",
			goodFailures.length,
			0,
		),
	];
};

const listCoreLibraryNames = () => {
	return readdirSync(REGISTRY_LIBRARIES_DIRECTORY, { withFileTypes: true })
		.filter((entry) => {
			return (
				entry.isDirectory() &&
				existsSync(
					join(REGISTRY_LIBRARIES_DIRECTORY, entry.name, CONFIG_FILE_NAME),
				)
			);
		})
		.map((entry) => {
			return entry.name;
		});
};

const installGeneratedCoreLibraries = async (projectDirectory) => {
	const buildDirectories = [];
	const enumStyle = strategies[arduinoNanoPlatform.strategy]?.enumStyle;
	for (const libraryName of listCoreLibraryNames()) {
		await installLibrary({
			sourceDirectory: REGISTRY_LIBRARIES_DIRECTORY,
			libraryName,
			projectPath: projectDirectory,
			platform: arduinoNanoPlatform,
			enumStyle,
		});
		buildDirectories.push(
			join(
				projectDirectory,
				CORE_LIBRARIES_DIRECTORY_NAME,
				libraryName,
				"build",
			),
		);
	}
	return buildDirectories;
};

const listGeneratedHeaders = (buildDirectories) => {
	const headerPaths = [];
	for (const buildDirectory of buildDirectories) {
		if (!existsSync(buildDirectory)) {
			continue;
		}
		for (const entry of readdirSync(buildDirectory, { withFileTypes: true })) {
			if (entry.isFile() && entry.name.endsWith(".h")) {
				headerPaths.push(join(buildDirectory, entry.name));
			}
		}
	}
	return headerPaths;
};

const checkGeneratedHeadersReachConfig = async (rootDirectory) => {
	const projectDirectory = join(rootDirectory, GENERATED_PROJECT_NAME);
	mkdirSync(projectDirectory, { recursive: true });
	const buildDirectories =
		await installGeneratedCoreLibraries(projectDirectory);
	const headerPaths = listGeneratedHeaders(buildDirectories);
	const failures = auditConfigIncludes({
		headerPaths,
		includePaths: [...buildDirectories, SHARED_STRATEGIES_DIRECTORY],
	});
	return [
		expectEqual(
			"generated core headers were found to audit",
			headerPaths.length > 0,
			true,
		),
		expectEqual(
			"generated core headers using E95_* reach e95_config.h",
			failures.length,
			0,
		),
	];
};

export const runConfigIncludeChecks = async () => {
	const rootDirectory = mkdtempSync(join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX));
	try {
		return [
			...checkSourceHeadersReachConfig(),
			...checkAuditorDetectsMissingInclude(rootDirectory),
			...checkAuditorAcceptsConfigInclude(rootDirectory),
			...(await checkGeneratedHeadersReachConfig(rootDirectory)),
		];
	} finally {
		rmSync(rootDirectory, { recursive: true, force: true });
	}
};
