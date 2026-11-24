// Host build plumbing for the bench. It provisions a real `arduino-nano`
// project from the tracked registry sources (same hermetic setup as
// `test:run`/`test:leak`), generates the C++ through `cli build`, instruments
// the TEMPORARY copies of the generated sources and links them with the bench
// driver. Nothing here touches the committed snapshots.
import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BUILD_DIRECTORY_NAME,
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	ENTRY_OPTION,
	MODULES_DIRECTORY_NAME,
	shared,
	UTF8,
} from "embedito95-core";
import { BUILD_COMMAND, NODE_EXECUTABLE } from "../constants.js";
import { createProject } from "../project-setup.js";
import {
	CLI_PATH,
	COMPILER,
	CPP_STANDARD_ARGUMENT,
	INCLUDE_ARGUMENT,
	OUTPUT_ARGUMENT,
	TESTER_PLATFORM_NAME,
} from "../runner-harness.js";
import {
	BENCH_HOOK_DECLARATIONS,
	instrumentSchedulerSource,
	instrumentSleepChecks,
} from "./instrumentation.js";

const HOST_INCLUDE_DIRECTORY = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"codegen-run",
	"host",
);
const ENTRY_FILE_NAME = "main.e95";
const TRANSLATION_UNIT_EXTENSION = ".ino";
const MODULE_SOURCE_EXTENSION = ".cpp";
const MODULE_HEADER_EXTENSION = ".h";
const CPP_LANGUAGE = "c++";
const NO_LANGUAGE = "none";
const LANGUAGE_ARGUMENT = "-x";
const TYPE_DIRECTORY_NAME = "type";
const PROJECT_DIRECTORY_NAME = "bench-project";
// The host bench measures scheduler CPU cost, not flash size, so it is built
// optimized. `-O2` is chosen over `-Os`: `-Os` trades speed for size (the AVR
// target concern), which would distort the host timing. This flag is host-only;
// AVR codegen/flags are unchanged.
const HOST_OPTIMIZATION_ARGUMENT = "-O2";

const listFilesByExtension = (directory, extension) => {
	const results = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const filePath = join(directory, entry.name);
		if (entry.isDirectory()) {
			results.push(...listFilesByExtension(filePath, extension));
		} else if (entry.name.endsWith(extension)) {
			results.push(filePath);
		}
	}
	return results;
};

const listCoreIncludeDirectories = (projectDirectory) => {
	const coreDirectory = join(projectDirectory, CORE_LIBRARIES_DIRECTORY_NAME);
	return readdirSync(coreDirectory, { withFileTypes: true })
		.filter((entry) => {
			return entry.isDirectory();
		})
		.map((entry) => {
			return join(coreDirectory, entry.name, BUILD_DIRECTORY_NAME);
		})
		.filter((directory) => {
			return existsSync(directory);
		});
};

const writeFixtureCyclesConfigHeaders = (
	projectDirectory,
	moduleIncludeDirectories,
) => {
	const configuration = JSON.parse(
		readFileSync(join(projectDirectory, CONFIG_FILE), UTF8),
	);
	const cycles = shared.resolveCyclesEnabled(configuration);
	for (const directory of [
		...listCoreIncludeDirectories(projectDirectory),
		...moduleIncludeDirectories,
	]) {
		shared.writeCyclesConfigHeader(directory, cycles);
	}
};

const collectModuleSources = (buildDirectory) => {
	const modulesDirectory = join(buildDirectory, MODULES_DIRECTORY_NAME);
	if (!existsSync(modulesDirectory)) {
		return { moduleSources: [], moduleIncludeDirectories: [] };
	}
	return {
		moduleSources: listFilesByExtension(
			modulesDirectory,
			MODULE_SOURCE_EXTENSION,
		),
		moduleIncludeDirectories: listFilesByExtension(
			modulesDirectory,
			MODULE_HEADER_EXTENSION,
		).map((file) => {
			return dirname(file);
		}),
	};
};

const collectCoreSources = (projectDirectory) => {
	const coreTypeDirectory = join(
		projectDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		TYPE_DIRECTORY_NAME,
		BUILD_DIRECTORY_NAME,
	);
	return existsSync(coreTypeDirectory)
		? listFilesByExtension(coreTypeDirectory, MODULE_SOURCE_EXTENSION)
		: [];
};

const writeEntrySource = (projectDirectory, scenarioPath) => {
	writeFileSync(
		join(projectDirectory, ENTRY_FILE_NAME),
		readFileSync(scenarioPath, UTF8),
		UTF8,
	);
};

const runCliBuild = (projectDirectory) => {
	execFileSync(
		NODE_EXECUTABLE,
		[CLI_PATH, BUILD_COMMAND, ENTRY_OPTION, ENTRY_FILE_NAME],
		{
			cwd: projectDirectory,
			env: { ...process.env, INIT_CWD: projectDirectory },
			stdio: "pipe",
		},
	);
};

// Provisions the platform template, writes the scenario and runs the real
// codegen. Returns the project directory and the generated build output.
export const prepareBenchProject = async ({
	temporaryDirectory,
	scenarioPath,
	directoryName = PROJECT_DIRECTORY_NAME,
	platformName = TESTER_PLATFORM_NAME,
}) => {
	const templateDirectory = await createProject(
		temporaryDirectory,
		platformName,
	);
	const projectDirectory = join(temporaryDirectory, directoryName);
	cpSync(templateDirectory, projectDirectory, { recursive: true });
	writeEntrySource(projectDirectory, scenarioPath);
	runCliBuild(projectDirectory);
	const buildDirectory = join(
		projectDirectory,
		BUILD_DIRECTORY_NAME,
		platformName,
	);
	return { projectDirectory, buildDirectory };
};

export const collectHostFixture = (projectDirectory, buildDirectory) => {
	const translationUnit = readdirSync(buildDirectory).find((name) => {
		return name.endsWith(TRANSLATION_UNIT_EXTENSION);
	});
	if (!translationUnit) {
		throw new Error("the bench scenario generated no translation unit");
	}
	const { moduleSources, moduleIncludeDirectories } =
		collectModuleSources(buildDirectory);
	writeFixtureCyclesConfigHeaders(projectDirectory, moduleIncludeDirectories);
	return {
		projectDirectory,
		buildDirectory,
		translationUnitPath: join(buildDirectory, translationUnit),
		moduleSources,
		moduleIncludeDirectories,
		coreSources: collectCoreSources(projectDirectory),
	};
};

// Rewrites the temp translation unit and modules: swaps the sleep checks for
// the recording hook and injects the scheduler hooks into the event loop.
export const instrumentHostFixture = (fixture) => {
	const entrySource = readFileSync(fixture.translationUnitPath, UTF8);
	writeFileSync(
		fixture.translationUnitPath,
		`${BENCH_HOOK_DECLARATIONS}\n${instrumentSleepChecks(entrySource)}`,
		UTF8,
	);
	let schedulerInstrumented = false;
	for (const moduleSourcePath of fixture.moduleSources) {
		const source = readFileSync(moduleSourcePath, UTF8);
		const instrumentedScheduler = instrumentSchedulerSource(source);
		if (instrumentedScheduler !== null) {
			schedulerInstrumented = true;
		}
		const instrumented = instrumentSleepChecks(instrumentedScheduler ?? source);
		writeFileSync(
			moduleSourcePath,
			`${BENCH_HOOK_DECLARATIONS}\n${instrumented}`,
			UTF8,
		);
	}
	if (!schedulerInstrumented) {
		throw new Error(
			"the bench could not find the generated event loop to instrument",
		);
	}
};

const buildIncludeArguments = (fixture) => {
	return [
		INCLUDE_ARGUMENT,
		HOST_INCLUDE_DIRECTORY,
		...listCoreIncludeDirectories(fixture.projectDirectory).flatMap(
			(directory) => {
				return [INCLUDE_ARGUMENT, directory];
			},
		),
		...fixture.moduleIncludeDirectories.flatMap((directory) => {
			return [INCLUDE_ARGUMENT, directory];
		}),
	];
};

const buildCompileArguments = (fixture, driverPath, binary) => {
	return [
		CPP_STANDARD_ARGUMENT,
		HOST_OPTIMIZATION_ARGUMENT,
		"-g",
		...buildIncludeArguments(fixture),
		LANGUAGE_ARGUMENT,
		CPP_LANGUAGE,
		fixture.translationUnitPath,
		...fixture.moduleSources,
		...fixture.coreSources,
		LANGUAGE_ARGUMENT,
		NO_LANGUAGE,
		driverPath,
		OUTPUT_ARGUMENT,
		binary,
	];
};

export const compileHostBench = ({ fixture, driverPath, binary }) => {
	execFileSync(COMPILER, buildCompileArguments(fixture, driverPath, binary), {
		stdio: "pipe",
	});
};
