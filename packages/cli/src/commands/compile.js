import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	BUILD_DIRECTORY_NAME,
	LIBRARY_PROJECT_TYPE,
	shared,
} from "embedito95-core";
import { red, writeErrorLine } from "../console.js";
import { loadProjectConfiguration } from "./shared/config.js";
import { loadEngineModules } from "./shared/engine.js";
import { getCurrentWorkingDirectory } from "./shared/paths.js";
import {
	ensurePlatformRequirements,
	isAnyUnsatisfied,
} from "./shared/requirements.js";

const CURRENT_WORKING_DIRECTORY = getCurrentWorkingDirectory();

export const run = async () => {
	const configuration = loadProjectConfiguration(CURRENT_WORKING_DIRECTORY);

	if (configuration.type === LIBRARY_PROJECT_TYPE) {
		writeErrorLine(`${red("✖")} Cannot compile a library`);
		process.exit(1);
	}

	const { strategy, platform } = await loadEngineModules(
		"compile",
		`${red("✖")} Compilation not supported for this platform`,
	);

	const requirements = await ensurePlatformRequirements({ platform });

	if (isAnyUnsatisfied({ requirements })) {
		writeErrorLine(
			`${red("✖")} Cannot compile: platform requirements are not met. Run 'doctor' to check and fix them.`,
		);
		process.exit(1);
	}

	const projectName = configuration.name;
	const cycles = shared.resolveCyclesEnabled(configuration);
	const outputDirectory = join(
		CURRENT_WORKING_DIRECTORY,
		BUILD_DIRECTORY_NAME,
		projectName,
	);

	if (!existsSync(outputDirectory)) {
		writeErrorLine(`${red("✖")} Build directory not found. Run 'build' first.`);
		process.exit(1);
	}

	await strategy.compile({
		outputDir: outputDirectory,
		projectName,
		platform,
		shared,
		cycles,
	});
};
