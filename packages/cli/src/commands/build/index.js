import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
	BUILD_DIRECTORY_NAME,
	buildLibraryFunctionReturnTypes,
	LIBRARY_PROJECT_TYPE,
	MODULES_DIRECTORY_NAME,
	mergeModuleLibraries,
	shared,
	UTF8,
} from "embedito95-core";
import { PLATFORM_CATEGORY } from "embedito95-registry/platforms";
import { green, red, writeErrorLine, writeLine } from "../../console.js";
import { INTERMEDIATE_DIRECTORY_NAME } from "../../constants.js";
import { loadProjectConfiguration } from "../shared/config.js";
import { loadEngineModules } from "../shared/engine.js";
import { getCurrentWorkingDirectory } from "../shared/paths.js";
import {
	buildAsyncModuleOverlay,
	resolveMainIntermediate,
} from "./async-overlay.js";
import { checkIntermediate, checkProject } from "./check.js";
import { compileAsyncTaskModule } from "./compileAsyncTaskModule.js";
import { parseEntryFile, readEntrySource } from "./entry-source.js";
import { generateProjectCode } from "./generate.js";
import {
	collectProjectLibraryImports,
	readLibrarySources,
} from "./library-sources.js";
import { loadLibraryModules } from "./loadLibraryModules.js";
import {
	copyCoreLibraries,
	writeModuleFiles,
	writeProjectFiles,
} from "./write-artifacts.js";

const CURRENT_WORKING_DIRECTORY = getCurrentWorkingDirectory();

const validateProjectConfiguration = (configuration) => {
	if (!configuration.name) {
		writeErrorLine(`${red("✖")} Project name not found in config.json`);
		process.exit(1);
	}

	if (configuration.type === LIBRARY_PROJECT_TYPE) {
		writeErrorLine(`${red("✖")} Cannot build a library. Use 'publish' instead`);
		process.exit(1);
	}

	const enableCycleCollector =
		configuration[shared.ENABLE_CYCLE_COLLECTOR_OPTION];
	if (
		enableCycleCollector !== undefined &&
		typeof enableCycleCollector !== "boolean"
	) {
		writeErrorLine(
			`${red("✖")} Invalid "${shared.ENABLE_CYCLE_COLLECTOR_OPTION}" in config.json: expected true or false`,
		);
		process.exit(1);
	}
};

const prepareBuildDirectory = (projectName) => {
	const buildDirectory = join(
		CURRENT_WORKING_DIRECTORY,
		BUILD_DIRECTORY_NAME,
		projectName,
	);

	if (existsSync(buildDirectory)) {
		rmSync(buildDirectory, { recursive: true, force: true });
	}

	mkdirSync(buildDirectory, { recursive: true });

	return buildDirectory;
};

const writeIntermediates = (
	source,
	entryFile,
	projectLibraries,
	usedLibraries,
	buildDirectory,
	variableTypes,
	libraryTypeContext,
	platform,
) => {
	const intermediateDirectory = join(
		buildDirectory,
		INTERMEDIATE_DIRECTORY_NAME,
	);
	mkdirSync(intermediateDirectory, { recursive: true });

	const intermediate = shared.buildAsyncIntermediate(
		source,
		readLibrarySources(projectLibraries, usedLibraries),
		buildLibraryFunctionReturnTypes(projectLibraries?.libraryFunctions ?? {}),
		variableTypes,
		libraryTypeContext,
		{ exitWhenIdle: platform?.category === PLATFORM_CATEGORY.HOST },
	);
	const intermediateEntryPath = join(
		intermediateDirectory,
		basename(entryFile),
	);
	writeFileSync(intermediateEntryPath, intermediate.main, UTF8);

	if (intermediate.async) {
		writeFileSync(
			join(intermediateDirectory, shared.ASYNC_INTERMEDIATE_FILE_NAME),
			intermediate.async,
			UTF8,
		);
	}

	return { intermediate, intermediateDirectory, intermediateEntryPath };
};

const compileAsyncModule = (
	intermediate,
	platform,
	libraryModules,
	projectLibraries,
	cycles,
) => {
	if (!intermediate.async) {
		return null;
	}
	return compileAsyncTaskModule(
		intermediate.async,
		platform,
		libraryModules,
		projectLibraries.libraryNamespaces,
		cycles,
	);
};

const buildAsyncModuleIncludes = (strategy, asyncTaskModule) => {
	if (!asyncTaskModule) {
		return [];
	}
	return [
		strategy.renderModuleInclude({
			directory: asyncTaskModule.directory,
			headerFileName: asyncTaskModule.headerFileName,
		}),
	];
};

const checkIntermediates = ({
	intermediate,
	intermediateDirectory,
	intermediateEntryPath,
	entryLibraries,
	localModules,
	projectLibraries,
	platform,
}) => {
	if (intermediate.async) {
		checkIntermediate(
			intermediate.async,
			join(intermediateDirectory, shared.ASYNC_INTERMEDIATE_FILE_NAME),
			mergeModuleLibraries(projectLibraries, localModules.entryLibraries),
			platform,
		);
	}

	checkIntermediate(
		intermediate.main,
		intermediateEntryPath,
		entryLibraries,
		platform,
	);
};

const writeBuildOutput = ({
	generated,
	projectName,
	strategy,
	projectLibraryFiles,
	moduleFiles,
	asyncTaskModule,
	libraryModules,
	buildDirectory,
	cycles,
}) => {
	mkdirSync(join(buildDirectory, MODULES_DIRECTORY_NAME), { recursive: true });

	const main = generated.main ?? "";
	const outputPath = join(
		buildDirectory,
		`${projectName}${strategy.extension}`,
	);
	writeFileSync(outputPath, main, UTF8);

	writeProjectFiles(projectLibraryFiles, buildDirectory);
	writeModuleFiles(
		asyncTaskModule ? [...moduleFiles, asyncTaskModule] : moduleFiles,
		buildDirectory,
	);
	copyCoreLibraries(libraryModules, buildDirectory, CURRENT_WORKING_DIRECTORY);
	shared.writeCyclesConfigHeaders(buildDirectory, cycles);

	writeLine(`${green("✔")} Built ${projectName}${strategy.extension}`);
};

export const run = async () => {
	const configuration = loadProjectConfiguration(CURRENT_WORKING_DIRECTORY);
	validateProjectConfiguration(configuration);

	const projectName = configuration.name;
	const cycles = shared.resolveCyclesEnabled(configuration);
	const { strategy, platform } = await loadEngineModules(
		"generate",
		`${red("✖")} Could not load engine`,
	);

	const entryFile = parseEntryFile();
	const { source, sourceLines, entryPath } = readEntrySource(
		entryFile,
		CURRENT_WORKING_DIRECTORY,
	);
	const {
		ast,
		projectLibraries,
		localModules,
		variableTypes,
		libraryTypeContext,
	} = checkProject(
		source,
		entryFile,
		entryPath,
		platform,
		CURRENT_WORKING_DIRECTORY,
	);
	const usedLibraries = collectProjectLibraryImports(
		projectLibraries,
		shared.extractUsedLibraries(ast),
	);

	const { modules: libraryModules } = await loadLibraryModules(
		usedLibraries,
		strategy.name,
		CURRENT_WORKING_DIRECTORY,
		platform,
	);

	const buildDirectory = prepareBuildDirectory(projectName);
	const { intermediate, intermediateDirectory, intermediateEntryPath } =
		writeIntermediates(
			source,
			entryFile,
			projectLibraries,
			usedLibraries,
			buildDirectory,
			variableTypes,
			libraryTypeContext,
			platform,
		);

	const asyncTaskModule = compileAsyncModule(
		intermediate,
		platform,
		libraryModules,
		projectLibraries,
		cycles,
	);
	const asyncModuleIncludes = buildAsyncModuleIncludes(
		strategy,
		asyncTaskModule,
	);
	const asyncModuleOverlay = buildAsyncModuleOverlay(asyncTaskModule);

	const entryLibraries = mergeModuleLibraries(
		projectLibraries,
		asyncModuleOverlay ?? localModules.entryLibraries,
	);

	checkIntermediates({
		intermediate,
		intermediateDirectory,
		intermediateEntryPath,
		entryLibraries,
		localModules,
		projectLibraries,
		platform,
	});

	const mainIntermediate = resolveMainIntermediate(
		intermediate,
		ast,
		sourceLines,
	);

	const { generated, projectLibraryFiles, moduleFiles } =
		await generateProjectCode(
			mainIntermediate.ast,
			mainIntermediate.sourceLines,
			strategy,
			platform,
			projectLibraries,
			usedLibraries,
			localModules,
			libraryModules,
			entryLibraries,
			asyncModuleIncludes,
			asyncTaskModule?.objectTypeInfo ?? null,
			cycles,
		);

	writeBuildOutput({
		generated,
		projectName,
		strategy,
		projectLibraryFiles,
		moduleFiles,
		asyncTaskModule,
		libraryModules,
		buildDirectory,
		cycles,
	});
};
