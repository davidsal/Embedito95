// Compiles a real Embedito95 program through the actual codegen (cli build),
// then compiles the generated translation unit AND the generated async module
// (`modules/**/*.cpp`) on the HOST and runs it, asserting the observable device
// behavior (pin writes) recorded by host stand-ins.
//
// This is the only place the generated module/intermediate C++ is compiled; the
// snapshot tests only compare text. A scenario asserts its expected GPIO events
// via a sidecar `<scenario>.events` file (one `operation pin value` per line,
// where operation is `digital` or `analog`); with no events file the program
// must simply build and run to completion.
//
// Toolchain coverage: `avr-g++` is not installed in this environment, so the AVR
// contract is verified by the arduino-nano snapshots plus this host build/run.
// The STM32 ARM contract IS real: `test:runtime` compiles the bluepill snapshots
// with the ARM cross-compiler (stm32-syntax-check.js).
import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
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
	LIBRARIES_DIRECTORY_NAME,
	MODULES_DIRECTORY_NAME,
	UTF8,
} from "embedito95-core";
import {
	BUILD_COMMAND,
	GITIGNORE_CONTENT,
	GITIGNORE_FILE,
	NODE_EXECUTABLE,
} from "../constants.js";
import {
	CLI_PATH,
	COMPILER,
	CPP_STANDARD_ARGUMENT,
	ENTRY_SUFFIX_PATTERN,
	FRAME_POINTER_ARGUMENT,
	INCLUDE_ARGUMENT,
	listScenarios,
	OUTPUT_ARGUMENT,
	runCompiledBinary,
	runScenarioSuite,
	SANITIZER_ARGUMENTS,
	TESTER_PLATFORM_NAME,
	TESTERS_DIRECTORY,
	withTemporaryDirectory,
} from "../runner-harness.js";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const HOST_INCLUDE_DIRECTORY = join(MODULE_DIRECTORY, "host");

const ENTRY_FILE_NAME = "main.e95";
const TRANSLATION_UNIT_EXTENSION = ".ino";
const MODULE_SOURCE_EXTENSION = ".cpp";
const MODULE_HEADER_EXTENSION = ".h";
const EVENTS_EXTENSION = ".events";
const ERRORS_EXTENSION = ".errors";
const SCENARIO_CONFIG_EXTENSION = ".config.json";
const ABSENT_EXTENSION = ".absent";
const REJECTED_SUFFIX = ".rejected.e95";
const REJECTED_PROJECT_DIRECTORY_NAME = "project-rejected";
const PROJECT_DIRECTORY_NAME = "project";
const TYPE_DIRECTORY_NAME = "type";
const DIGITAL_OPERATION = "digital";
const ANALOG_OPERATION = "analog";
const HOST_ANALOG_OPERATION = "E95_ANALOG";
const HOST_DIGITAL_OPERATION = "E95_DIGITAL";
const CPP_LANGUAGE = "c++";
const NO_LANGUAGE = "none";
const LANGUAGE_ARGUMENT = "-x";
const TEMP_DIRECTORY_PREFIX = "embedito95-run-";

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

const parseEventLine = (line, index, eventsPath) => {
	const [operation, pin, value] = line.split(/\s+/);
	if (
		(operation !== DIGITAL_OPERATION && operation !== ANALOG_OPERATION) ||
		Number.isNaN(Number(pin)) ||
		Number.isNaN(Number(value))
	) {
		throw new Error(`invalid event "${line}" at ${eventsPath}:${index + 1}`);
	}
	return { operation, pin: Number(pin), value: Number(value) };
};

const parseEvents = (scenario) => {
	const eventsPath = join(
		MODULE_DIRECTORY,
		scenario.replace(ENTRY_SUFFIX_PATTERN, EVENTS_EXTENSION),
	);
	if (!existsSync(eventsPath)) {
		return [];
	}
	return readFileSync(eventsPath, UTF8)
		.split("\n")
		.map((line) => {
			return line.trim();
		})
		.filter((line) => {
			return line.length > 0 && !line.startsWith("#");
		})
		.map((line, index) => {
			return parseEventLine(line, index, eventsPath);
		});
};

// A scenario may forbid generated tokens with a sidecar `<scenario>.absent`
// file (one substring per line). This lets a config-driven scenario pin that
// codegen left something out of the translation unit (e.g. `enableCycleCollector:
// false` must not emit `_e95Trace_*`), not just that the program still runs.
const parseAbsentTokens = (scenario) => {
	const absentPath = join(
		MODULE_DIRECTORY,
		scenario.replace(ENTRY_SUFFIX_PATTERN, ABSENT_EXTENSION),
	);
	if (!existsSync(absentPath)) {
		return [];
	}
	return readFileSync(absentPath, UTF8)
		.split("\n")
		.map((line) => {
			return line.trim();
		})
		.filter((line) => {
			return line.length > 0 && !line.startsWith("#");
		});
};

const assertAbsentTokens = (translationUnitPath, scenario) => {
	const tokens = parseAbsentTokens(scenario);
	if (tokens.length === 0) {
		return;
	}
	const content = readFileSync(translationUnitPath, UTF8);
	for (const token of tokens) {
		if (content.includes(token)) {
			throw new Error(
				`${scenario}: generated translation unit must not contain "${token}"`,
			);
		}
	}
};

const createProjectDirectory = (projectDirectory) => {
	mkdirSync(projectDirectory, { recursive: true });
	for (const child of [
		CORE_LIBRARIES_DIRECTORY_NAME,
		LIBRARIES_DIRECTORY_NAME,
	]) {
		cpSync(join(TESTERS_DIRECTORY, child), join(projectDirectory, child), {
			recursive: true,
		});
	}
	cpSync(
		join(TESTERS_DIRECTORY, CONFIG_FILE),
		join(projectDirectory, CONFIG_FILE),
	);
	writeFileSync(join(projectDirectory, GITIGNORE_FILE), GITIGNORE_CONTENT);
};

// A scenario may override config.json fields (e.g. `enableCycleCollector:
// false`) with a sidecar `<scenario>.config.json`. The base config is copied
// first, then the overrides are merged on top so existing scenarios keep the
// default.
const applyScenarioConfiguration = (projectDirectory, scenario) => {
	const configurationPath = join(
		MODULE_DIRECTORY,
		scenario.replace(ENTRY_SUFFIX_PATTERN, SCENARIO_CONFIG_EXTENSION),
	);
	if (!existsSync(configurationPath)) {
		return;
	}
	const projectConfigPath = join(projectDirectory, CONFIG_FILE);
	const baseConfiguration = JSON.parse(readFileSync(projectConfigPath, UTF8));
	const overrides = JSON.parse(readFileSync(configurationPath, UTF8));
	writeFileSync(
		projectConfigPath,
		JSON.stringify({ ...baseConfiguration, ...overrides }, null, "\t"),
		UTF8,
	);
};

const prepareProject = (temporaryDirectory, scenario, directoryName) => {
	const projectDirectory = join(temporaryDirectory, directoryName);
	createProjectDirectory(projectDirectory);
	applyScenarioConfiguration(projectDirectory, scenario);
	writeFileSync(
		join(projectDirectory, ENTRY_FILE_NAME),
		readFileSync(join(MODULE_DIRECTORY, scenario), UTF8),
		UTF8,
	);
	return projectDirectory;
};

const buildFixture = (temporaryDirectory, scenario) => {
	const projectDirectory = prepareProject(
		temporaryDirectory,
		scenario,
		PROJECT_DIRECTORY_NAME,
	);
	execFileSync(
		NODE_EXECUTABLE,
		[CLI_PATH, BUILD_COMMAND, ENTRY_OPTION, ENTRY_FILE_NAME],
		{
			cwd: projectDirectory,
			env: { ...process.env, INIT_CWD: projectDirectory },
			stdio: "pipe",
		},
	);
	const buildDirectory = join(
		projectDirectory,
		BUILD_DIRECTORY_NAME,
		TESTER_PLATFORM_NAME,
	);
	const translationUnit = readdirSync(buildDirectory).find((name) => {
		return name.endsWith(TRANSLATION_UNIT_EXTENSION);
	});
	if (!translationUnit) {
		throw new Error(`no generated .ino for ${scenario}`);
	}
	const modulesDirectory = join(buildDirectory, MODULES_DIRECTORY_NAME);
	const coreTypeDirectory = join(
		projectDirectory,
		CORE_LIBRARIES_DIRECTORY_NAME,
		TYPE_DIRECTORY_NAME,
		BUILD_DIRECTORY_NAME,
	);
	return {
		projectDirectory,
		translationUnitPath: join(buildDirectory, translationUnit),
		moduleSources: existsSync(modulesDirectory)
			? listFilesByExtension(modulesDirectory, MODULE_SOURCE_EXTENSION)
			: [],
		coreSources: existsSync(coreTypeDirectory)
			? listFilesByExtension(coreTypeDirectory, MODULE_SOURCE_EXTENSION)
			: [],
		moduleIncludeDirectories: existsSync(modulesDirectory)
			? listFilesByExtension(modulesDirectory, MODULE_HEADER_EXTENSION).map(
					(file) => {
						return dirname(file);
					},
				)
			: [],
	};
};

const isRejectedScenario = (scenario) => {
	return scenario.endsWith(REJECTED_SUFFIX);
};

const parseExpectedErrors = (scenario) => {
	const errorsPath = join(
		MODULE_DIRECTORY,
		scenario.replace(ENTRY_SUFFIX_PATTERN, ERRORS_EXTENSION),
	);
	return readFileSync(errorsPath, UTF8)
		.split("\n")
		.map((line) => {
			return line.trim();
		})
		.filter((line) => {
			return line.length > 0 && !line.startsWith("#");
		});
};

const runBuildExpectingRejection = (projectDirectory) => {
	try {
		execFileSync(
			NODE_EXECUTABLE,
			[CLI_PATH, BUILD_COMMAND, ENTRY_OPTION, ENTRY_FILE_NAME],
			{
				cwd: projectDirectory,
				env: { ...process.env, INIT_CWD: projectDirectory },
				stdio: "pipe",
			},
		);
	} catch (error) {
		return `${error.stdout?.toString() ?? ""}${error.stderr?.toString() ?? ""}`;
	}
	throw new Error(
		"expected the checker to reject this scenario before codegen, but the build succeeded",
	);
};

// A rejected scenario pins the diagnostics that must stop the build. If the
// checker misses one, the codegen would emit the invalid member call instead, so
// this asserts the failure happens before any C++ is generated.
const runRejectedScenario = (temporaryDirectory, scenario) => {
	const projectDirectory = prepareProject(
		temporaryDirectory,
		scenario,
		REJECTED_PROJECT_DIRECTORY_NAME,
	);
	const buildOutput = runBuildExpectingRejection(projectDirectory);
	for (const expectedError of parseExpectedErrors(scenario)) {
		if (!buildOutput.includes(expectedError)) {
			throw new Error(
				`expected diagnostic "${expectedError}" in the rejected build output:\n${buildOutput}`,
			);
		}
	}
};

const buildDriverSource = (events) => {
	const rows = events
		.map((event) => {
			const operation =
				event.operation === ANALOG_OPERATION
					? HOST_ANALOG_OPERATION
					: HOST_DIGITAL_OPERATION;
			return `\t{ ${operation}, ${event.pin}, ${event.value} },`;
		})
		.join("\n");
	return `// Host run driver: records GPIO writes and matches them against the
// scenario's expected event sequence, then exits (the async event loop never
// returns on its own).
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

enum { E95_DIGITAL, E95_ANALOG };

struct E95Event {
	int operation;
	int pin;
	int value;
};

static const E95Event e95_expected[] = {
${rows}
};
static const int e95_expected_count =
	(int)(sizeof(e95_expected) / sizeof(e95_expected[0]));
static int e95_seen = 0;

static void e95_check(int operation, int pin, int value) {
	if (e95_seen < e95_expected_count) {
		const E95Event *expected = &e95_expected[e95_seen];
		if (expected->operation != operation || expected->pin != pin ||
			expected->value != value) {
			fprintf(stderr,
				"event %d mismatch: expected operation=%d pin=%d value=%d, got operation=%d pin=%d value=%d\\n",
				e95_seen, expected->operation, expected->pin, expected->value,
				operation, pin, value);
			exit(1);
		}
	}
	e95_seen++;
	if (e95_seen == e95_expected_count) {
		printf("all %d event(s) matched\\n", e95_expected_count);
		exit(0);
	}
}

extern "C" unsigned long e95_host_millis(void) {
	static unsigned long ticks = 0;
	ticks++;
	return ticks;
}

extern "C" void e95_host_delay(unsigned long milliseconds) {
	(void)milliseconds;
}

extern "C" void e95_host_pin_mode(uint8_t pin, uint8_t mode) {
	(void)pin;
	(void)mode;
}

extern "C" void e95_host_digital_write(uint8_t pin, uint8_t value) {
	e95_check(E95_DIGITAL, (int)pin, (int)value);
}

extern "C" int e95_host_digital_read(uint8_t pin) {
	(void)pin;
	return 0;
}

extern "C" void e95_host_analog_write(uint8_t pin, int value) {
	e95_check(E95_ANALOG, (int)pin, (int)value);
}

extern "C" int e95_host_analog_read(uint8_t pin) {
	(void)pin;
	return 0;
}

void setup();
void loop();

int main() {
	setup();
	if (e95_expected_count == 0) {
		printf("setup returned\\n");
		return 0;
	}
	fprintf(stderr, "setup returned after %d/%d event(s)\\n", e95_seen,
		e95_expected_count);
	return 1;
}
`;
};

const buildCompileArguments = (fixture, driverPath, binary) => {
	const includeArguments = [
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
	return [
		CPP_STANDARD_ARGUMENT,
		SANITIZER_ARGUMENTS,
		FRAME_POINTER_ARGUMENT,
		"-g",
		...includeArguments,
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

const runScenario = (temporaryDirectory, scenario) => {
	const events = parseEvents(scenario);
	const fixture = buildFixture(temporaryDirectory, scenario);
	assertAbsentTokens(fixture.translationUnitPath, scenario);
	const driverPath = join(temporaryDirectory, `${scenario}.driver.cpp`);
	const binary = join(temporaryDirectory, `${scenario}.bin`);
	writeFileSync(driverPath, buildDriverSource(events), UTF8);

	const compileArguments = buildCompileArguments(fixture, driverPath, binary);
	execFileSync(COMPILER, compileArguments, { stdio: "pipe" });
	runCompiledBinary(binary, { stdio: "inherit" });
};

const runAnyScenario = (temporaryDirectory, scenario) => {
	if (isRejectedScenario(scenario)) {
		runRejectedScenario(temporaryDirectory, scenario);
		return;
	}
	runScenario(temporaryDirectory, scenario);
};

const main = () => {
	const failures = withTemporaryDirectory(
		TEMP_DIRECTORY_PREFIX,
		(directory) => {
			return runScenarioSuite({
				scenarios: listScenarios(MODULE_DIRECTORY),
				runScenario: runAnyScenario.bind(null, directory),
			});
		},
	);
	process.exit(failures.length > 0 ? 1 : 0);
};

main();
