import { join } from "node:path";
import { BUILD_DIRECTORY_NAME, LIBRARY_PROJECT_TYPE } from "embedito95-core";
import { red, writeErrorLine } from "../console.js";
import { run as build } from "./build/index.js";
import { run as compile } from "./compile.js";
import { loadProjectConfiguration } from "./shared/config.js";
import { loadEngineModules } from "./shared/engine.js";
import { getCurrentWorkingDirectory } from "./shared/paths.js";

const CURRENT_WORKING_DIRECTORY = getCurrentWorkingDirectory();
const EXIT_SUCCESS_CODE = 0;
const DEFAULT_SIGNAL_EXIT_CODE = 1;
const SIGNAL_EXIT_CODES = {
	SIGINT: 130,
	SIGTERM: 143,
	SIGHUP: 129,
};
const INTERRUPTED_MESSAGE = "Interrupted";

const readProjectConfiguration = () => {
	const configuration = loadProjectConfiguration(CURRENT_WORKING_DIRECTORY);

	if (configuration.type === LIBRARY_PROJECT_TYPE) {
		writeErrorLine(`${red("✖")} Cannot run a library`);
		process.exit(1);
	}

	return configuration;
};

export const resolveExecutionExitCode = ({ exitCode, signal }) => {
	if (signal) {
		return SIGNAL_EXIT_CODES[signal] ?? DEFAULT_SIGNAL_EXIT_CODE;
	}

	return exitCode ?? EXIT_SUCCESS_CODE;
};

const reportInterruptedExecution = ({ signal }) => {
	writeErrorLine(`${red("✖")} ${INTERRUPTED_MESSAGE} (${signal})`);
};

export const run = async () => {
	const configuration = readProjectConfiguration();
	const projectName = configuration.name;

	const { strategy } = await loadEngineModules(
		"execute",
		`${red("✖")} Execution not supported for this platform`,
	);

	await build();
	await compile();

	const { exitCode, signal } = await strategy.execute({
		outputDir: join(
			CURRENT_WORKING_DIRECTORY,
			BUILD_DIRECTORY_NAME,
			projectName,
		),
		projectName,
	});

	if (signal) {
		reportInterruptedExecution({ signal });
	}

	process.exit(resolveExecutionExitCode({ exitCode, signal }));
};
