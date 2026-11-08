// Entry generation and compilation for `test:compile`. Every `.e95` entry is
// generated in its own temporary project (createProject + copyEntryFiles +
// buildEntry) so its build directory is unique and concurrent entries never
// collide. The generated build is what gets compiled, never a checked-in or
// stale `build/` directory.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BUILD_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
} from "embedito95-core";
import { listEntryFiles, listExcludedEntryFiles } from "./case-discovery.js";
import {
	compileArduinoSketch,
	compileStm32Project,
	verifyCompileArtifacts,
} from "./compile-check-compilers.js";
import {
	ARTIFACTS_DIRECTORY_NAME,
	AVR_ARTIFACT_EXTENSION,
	CLIENT_LIBRARY_BASENAMES,
	COMPILE_PLATFORM_KIND,
	COMPILE_PLATFORM_KIND_BY_PLATFORM,
	COMPILE_TEMP_DIRECTORY_PREFIX,
	COMPILE_TEST_SOURCES_PLATFORM_BY_PLATFORM,
	CORE_CATEGORY_NAME,
	EXAMPLES_DIRECTORY_NAME,
	EXCLUDED_TEST_SKIP_REASON,
	STM32_ARTIFACT_EXTENSIONS,
	TEST_ENTRY_SUFFIX_PATTERN,
	TEST_SOURCES_DIRECTORY,
} from "./constants.js";
import { buildEntry, copyEntryFiles, createProject } from "./project-setup.js";

const ARDUINO_BUILD_DIRECTORY_NAME = "arduino-build";

export const resolveCompileEntryCategory = ({ category, entryFile }) => {
	if (category !== LIBRARIES_DIRECTORY_NAME) {
		return category;
	}
	const entryBasename = entryFile.replace(TEST_ENTRY_SUFFIX_PATTERN, "");
	return CLIENT_LIBRARY_BASENAMES.includes(entryBasename)
		? LIBRARIES_DIRECTORY_NAME
		: CORE_CATEGORY_NAME;
};

const createSourceJobs = ({
	platformName,
	sourceDirectory,
	category,
	excludedEntryFiles,
}) => {
	return listEntryFiles(sourceDirectory).map((entryFile) => {
		const entryCategory = resolveCompileEntryCategory({ category, entryFile });
		const label = `${entryCategory}/${platformName}/${entryFile}`;
		return {
			key: label,
			label,
			platformName,
			sourceDirectory,
			entryFile,
			skipReason: excludedEntryFiles.has(entryFile)
				? EXCLUDED_TEST_SKIP_REASON
				: null,
		};
	});
};

export const collectPlatformJobs = ({ platformName, compileAll }) => {
	const testSourcesDirectory = join(
		TEST_SOURCES_DIRECTORY,
		COMPILE_TEST_SOURCES_PLATFORM_BY_PLATFORM[platformName],
	);
	const examplesDirectory = join(testSourcesDirectory, EXAMPLES_DIRECTORY_NAME);
	const librariesDirectory = join(
		testSourcesDirectory,
		LIBRARIES_DIRECTORY_NAME,
	);
	const excludedEntryFiles = listExcludedEntryFiles(platformName);

	const jobs = createSourceJobs({
		platformName,
		sourceDirectory: examplesDirectory,
		category: EXAMPLES_DIRECTORY_NAME,
		excludedEntryFiles,
	});

	if (compileAll) {
		jobs.push(
			...createSourceJobs({
				platformName,
				sourceDirectory: librariesDirectory,
				category: LIBRARIES_DIRECTORY_NAME,
				excludedEntryFiles,
			}),
		);
	}

	return jobs;
};

const createCompileTemporaryDirectory = () => {
	return mkdtempSync(join(tmpdir(), COMPILE_TEMP_DIRECTORY_PREFIX));
};

const removeCompileTemporaryDirectory = (temporaryDirectory) => {
	rmSync(temporaryDirectory, { recursive: true, force: true });
};

const DEFAULT_ENTRY_DEPENDENCIES = {
	createProject,
	copyEntryFiles,
	buildEntry,
	compileArduinoSketch,
	compileStm32Project,
	verifyCompileArtifacts,
	createCompileTemporaryDirectory,
	removeCompileTemporaryDirectory,
};

const prepareEntryProject = async ({
	job,
	temporaryDirectory,
	dependencies,
}) => {
	const projectDirectory = await dependencies.createProject(
		temporaryDirectory,
		job.platformName,
	);
	dependencies.copyEntryFiles(job.sourceDirectory, projectDirectory);
	await dependencies.buildEntry(
		projectDirectory,
		job.platformName,
		job.entryFile,
	);
	return projectDirectory;
};

const verifyArduinoEntryArtifacts = ({
	job,
	temporaryDirectory,
	dependencies,
}) => {
	const artifactsDirectory = join(temporaryDirectory, ARTIFACTS_DIRECTORY_NAME);
	dependencies.verifyCompileArtifacts({
		directory: artifactsDirectory,
		extensions: [AVR_ARTIFACT_EXTENSION],
		label: job.label,
	});
};

const compileArduinoEntry = async ({
	job,
	temporaryDirectory,
	outputDirectory,
	context,
	dependencies,
}) => {
	const sizes = await dependencies.compileArduinoSketch({
		outputDirectory,
		artifactsDirectory: join(temporaryDirectory, ARTIFACTS_DIRECTORY_NAME),
		platformName: job.platformName,
		buildPath: join(temporaryDirectory, ARDUINO_BUILD_DIRECTORY_NAME),
		buildCachePath: context.buildCacheDirectory,
	});
	verifyArduinoEntryArtifacts({ job, temporaryDirectory, dependencies });
	return { sizes };
};

const compileStm32Entry = async ({
	job,
	outputDirectory,
	context,
	dependencies,
}) => {
	const sizes = await dependencies.compileStm32Project({
		outputDirectory,
		projectName: job.platformName,
		platformName: job.platformName,
		maximumCompileJobs: context.maximumCompileJobs,
	});
	dependencies.verifyCompileArtifacts({
		directory: join(outputDirectory, ARTIFACTS_DIRECTORY_NAME),
		extensions: STM32_ARTIFACT_EXTENSIONS,
		label: job.label,
	});
	return { sizes };
};

export const runEntryCompileJob = async ({
	job,
	context,
	dependencies = {},
}) => {
	const resolvedDependencies = {
		...DEFAULT_ENTRY_DEPENDENCIES,
		...dependencies,
	};
	const temporaryDirectory =
		resolvedDependencies.createCompileTemporaryDirectory();

	try {
		const projectDirectory = await prepareEntryProject({
			job,
			temporaryDirectory,
			dependencies: resolvedDependencies,
		});
		const outputDirectory = join(
			projectDirectory,
			BUILD_DIRECTORY_NAME,
			job.platformName,
		);
		const kind = COMPILE_PLATFORM_KIND_BY_PLATFORM[job.platformName];

		if (kind === COMPILE_PLATFORM_KIND.arduino) {
			return await compileArduinoEntry({
				job,
				temporaryDirectory,
				outputDirectory,
				context,
				dependencies: resolvedDependencies,
			});
		}

		return await compileStm32Entry({
			job,
			outputDirectory,
			context,
			dependencies: resolvedDependencies,
		});
	} finally {
		resolvedDependencies.removeCompileTemporaryDirectory(temporaryDirectory);
	}
};
