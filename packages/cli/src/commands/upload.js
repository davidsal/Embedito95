import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	BUILD_DIRECTORY_NAME,
	LIBRARY_PROJECT_TYPE,
	shared,
} from "embedito95-core";
import { green, red, writeErrorLine, writeLine } from "../console.js";
import { loadProjectConfiguration } from "./shared/config.js";
import { loadEngineModules } from "./shared/engine.js";
import { getCurrentWorkingDirectory } from "./shared/paths.js";
import { selectPort } from "./shared/ports.js";
import { select } from "./shared/prompt.js";
import { loadProjectState, saveProjectState } from "./shared/state.js";

const CURRENT_WORKING_DIRECTORY = getCurrentWorkingDirectory();
const SELECT_PORT_MESSAGE = "Select port";

const readProjectConfiguration = () => {
	const configuration = loadProjectConfiguration(CURRENT_WORKING_DIRECTORY);

	if (configuration.type === LIBRARY_PROJECT_TYPE) {
		writeErrorLine(`${red("✖")} Cannot upload a library`);
		process.exit(1);
	}

	return configuration;
};

const resolveOutputDirectory = (projectName) => {
	const outputDirectory = join(
		CURRENT_WORKING_DIRECTORY,
		BUILD_DIRECTORY_NAME,
		projectName,
	);

	if (!existsSync(outputDirectory)) {
		writeErrorLine(`${red("✖")} Build directory not found. Run 'build' first.`);
		process.exit(1);
	}

	return outputDirectory;
};

const selectDevicePort = async (strategy, rememberedState) => {
	const ports = (await strategy.detectPorts?.({ shared })) ?? [];

	if (ports.length === 0) {
		writeErrorLine(`${red("✖")} No devices detected`);
		process.exit(1);
	}

	const port = await selectPort(
		SELECT_PORT_MESSAGE,
		ports,
		rememberedState.port,
	);
	return port;
};

export const run = async () => {
	const configuration = readProjectConfiguration();
	const projectName = configuration.name;

	const { strategy, platform } = await loadEngineModules(
		"upload",
		`${red("✖")} Upload not supported for this platform`,
	);
	const outputDirectory = resolveOutputDirectory(projectName);
	const verbose = process.argv.includes("--verbose");
	const rememberedState = loadProjectState(CURRENT_WORKING_DIRECTORY);
	const port = await selectDevicePort(strategy, rememberedState);

	const selected = await strategy.upload({
		outputDir: outputDirectory,
		projectName,
		platform,
		port,
		shared,
		verbose,
		select,
		rememberedBootloader: rememberedState.bootloader,
	});

	saveProjectState(CURRENT_WORKING_DIRECTORY, {
		port,
		...(selected?.bootloader !== undefined
			? { bootloader: selected.bootloader }
			: {}),
	});

	writeLine(`${green("✔")} Upload successful`);
};
