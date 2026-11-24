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
	ENTRY_SUFFIX_PATTERN,
	FRAME_POINTER_ARGUMENT,
	INCLUDE_ARGUMENT,
	listScenarios,
	OUTPUT_ARGUMENT,
	runCompiledBinary,
	runScenarioSuite,
	SANITIZER_ARGUMENTS,
	TESTER_PLATFORM_NAME,
	withTemporaryDirectoryAsync,
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
const PASSES_EXTENSION = ".passes";
const ALLOCATION_EXTENSION = ".alloc";
// Event recording is an explicit, single-scenario debugging mode invoked with
// `node codegen-run/run.js --record <scenario>`. It is deliberately NOT an
// environment variable: `E95_RECORD_EVENTS=1` used to switch every scenario to
// "print events and exit 0", which let `test:run` go green without comparing
// anything. The suite never passes `--record`, so a normal run always compares.
const RECORD_FLAG = "--record";
const LEGACY_RECORD_ENVIRONMENT_KEY = "E95_RECORD_EVENTS";
const EVENT_LOOP_MARKER = "_asyncEventLoop";
const EVENT_LOOP_WHILE_MARKER = "while (true) {";
const PASS_HOOK_NAME = "e95_host_event_loop_pass";
const PASS_HOOK_DECLARATION = `extern "C" void ${PASS_HOOK_NAME}(void);`;
const PASS_HOOK_CALL = `\t\t${PASS_HOOK_NAME}();`;
const DRAIN_PASS_BUDGET = 20;
const SETTLE_PASS_BUDGET = 20;
const RECORD_PASS_LIMIT = 4000;
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
// A scenario may pin the pass range in which its last expected event must be
// observed with a sidecar `<scenario>.passes` file (`min <n>` / `max <n>`).
// This turns "await sleep resumes promptly" into an observable scheduler
// contract without putting instrumentation in the generated code.
const parsePasses = (scenario) => {
	const passesPath = join(
		MODULE_DIRECTORY,
		scenario.replace(ENTRY_SUFFIX_PATTERN, PASSES_EXTENSION),
	);
	if (!existsSync(passesPath)) {
		return null;
	}
	const passes = { min: 1, max: RECORD_PASS_LIMIT };
	for (const line of readFileSync(passesPath, UTF8).split("\n")) {
		const [key, value] = line.trim().split(/\s+/);
		if (key === "min" || key === "max") {
			passes[key] = Number(value);
		}
	}
	return passes;
};

// A scenario may ask the host driver to watch live `malloc` blocks with a
// sidecar `<scenario>.alloc` file. The check is a *stability* contract, not an
// exact implementation value: after the expected events drain, the driver
// samples the live-block delta once the queue has had time to settle and then
// again after a quiet window; both samples must match. An optional `max <n>`
// line adds an upper bound (the queue backing buffer is an accepted startup
// cost, but it is never pinned to a concrete allocator value).
const parseAllocationExpectation = (scenario) => {
	const allocationPath = join(
		MODULE_DIRECTORY,
		scenario.replace(ENTRY_SUFFIX_PATTERN, ALLOCATION_EXTENSION),
	);
	if (!existsSync(allocationPath)) {
		return null;
	}
	const content = readFileSync(allocationPath, UTF8);
	let maxLiveBlocks = null;
	for (const line of content.split("\n")) {
		const [key, value] = line.trim().split(/\s+/);
		if (key === "max") {
			maxLiveBlocks = Number(value);
		}
	}
	return { maxLiveBlocks };
};

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

// Copies the suite's provisioned template project (from tracked registry
// sources) into each scenario directory, so the suite never reads the
// gitignored `packages/test/testers/` tree.
const createProjectDirectory = (templateDirectory, projectDirectory) => {
	cpSync(templateDirectory, projectDirectory, { recursive: true });
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

const prepareProject = (
	templateDirectory,
	temporaryDirectory,
	scenario,
	directoryName,
) => {
	const projectDirectory = join(temporaryDirectory, directoryName);
	createProjectDirectory(templateDirectory, projectDirectory);
	applyScenarioConfiguration(projectDirectory, scenario);
	writeFileSync(
		join(projectDirectory, ENTRY_FILE_NAME),
		readFileSync(join(MODULE_DIRECTORY, scenario), UTF8),
		UTF8,
	);
	return projectDirectory;
};

const buildFixture = ({ temporaryDirectory, templateDirectory }, scenario) => {
	const projectDirectory = prepareProject(
		templateDirectory,
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
	const fixture = {
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
	writeFixtureCyclesConfigHeaders(fixture);
	return fixture;
};

const writeFixtureCyclesConfigHeaders = (fixture) => {
	const configuration = JSON.parse(
		readFileSync(join(fixture.projectDirectory, CONFIG_FILE), UTF8),
	);
	const cycles = shared.resolveCyclesEnabled(configuration);
	for (const directory of [
		...listCoreIncludeDirectories(fixture.projectDirectory),
		...fixture.moduleIncludeDirectories,
	]) {
		shared.writeCyclesConfigHeader(directory, cycles);
	}
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
const runRejectedScenario = (
	{ temporaryDirectory, templateDirectory },
	scenario,
) => {
	const projectDirectory = prepareProject(
		templateDirectory,
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

const buildAllocationInterposerSource = () => {
	return `#include <dlfcn.h>

extern "C" void *malloc(size_t size) {
	static void *(*realMalloc)(size_t) = (void *(*)(size_t))dlsym(RTLD_NEXT, "malloc");
	void *pointer = realMalloc(size);
	if (pointer) {
		e95_live_blocks++;
	}
	return pointer;
}

extern "C" void free(void *pointer) {
	static void (*realFree)(void *) = (void (*)(void *))dlsym(RTLD_NEXT, "free");
	if (pointer) {
		e95_live_blocks--;
	}
	realFree(pointer);
}

// A successful realloc with a non-null pointer replaces the old block: it is
// counted as a free of the old block plus an alloc of the new one, so the net
// live count is unchanged. A failed realloc leaves the original block live
// (no change); realloc(p, 0) frees.
extern "C" void *realloc(void *pointer, size_t size) {
	static void *(*realRealloc)(void *, size_t) = (void *(*)(void *, size_t))dlsym(RTLD_NEXT, "realloc");
	void *result = realRealloc(pointer, size);
	if (result) {
		if (pointer) {
			e95_live_blocks--;
		}
		e95_live_blocks++;
	} else if (pointer && size == 0) {
		e95_live_blocks--;
	}
	return result;
}
`;
};

const buildDriverRuntimeSource = ({
	allocationExpectation,
	passes,
	recordEvents,
}) => {
	const tracksAllocations = allocationExpectation !== null;
	const maxLiveBlocks = allocationExpectation?.maxLiveBlocks ?? null;
	const maximumLiveBlocks = maxLiveBlocks === null ? -1 : maxLiveBlocks;
	const minimumPass = passes?.min ?? 0;
	const maximumPass = passes?.max ?? RECORD_PASS_LIMIT;
	return `static int e95_seen = 0;
static long e95_pass_count = 0;
static long e95_last_event_pass = 0;
static int e95_events_done = 0;
static int e95_post_match_passes = 0;
static long e95_initial_live_blocks = 0;
static long e95_drained_live_blocks = 0;
static int e95_drain_sampled = 0;

static const long e95_minimum_pass = ${minimumPass};
static const long e95_maximum_pass = ${maximumPass};
static const int e95_tracks_allocations = ${tracksAllocations ? 1 : 0};
static const int e95_records_events = ${recordEvents ? 1 : 0};
static const long e95_maximum_live_blocks = ${maximumLiveBlocks};

static void e95_finish_allocation_check(long liveBlocks) {
	const long settledDelta = liveBlocks - e95_drained_live_blocks;
	const int stable = settledDelta == 0;
	const int bounded =
		e95_maximum_live_blocks < 0 || liveBlocks <= e95_maximum_live_blocks;
	printf("live allocations after drain: drained=%ld settled=%ld stable=%ld max=%ld\\n",
		e95_drained_live_blocks, liveBlocks, settledDelta,
		e95_maximum_live_blocks);
	exit(stable && bounded ? 0 : 1);
}

extern "C" void e95_host_event_loop_pass(void) {
	e95_pass_count++;
	if (e95_records_events && e95_pass_count >= ${RECORD_PASS_LIMIT}) {
		printf("record stopped after %ld pass(es)\\n", e95_pass_count);
		exit(0);
	}
	if (!e95_events_done || !e95_tracks_allocations) {
		return;
	}
	e95_post_match_passes++;
	if (e95_post_match_passes < ${DRAIN_PASS_BUDGET}) {
		return;
	}
	const long liveBlocks = e95_live_blocks - e95_initial_live_blocks;
	if (e95_drain_sampled == 0) {
		e95_drained_live_blocks = liveBlocks;
		e95_drain_sampled = 1;
		return;
	}
	if (e95_post_match_passes >= ${DRAIN_PASS_BUDGET} + ${SETTLE_PASS_BUDGET}) {
		e95_finish_allocation_check(liveBlocks);
	}
}
`;
};

const buildDriverSource = (events, options) => {
	const { allocationExpectation } = options;
	const rows = events
		.map((event) => {
			const operation =
				event.operation === ANALOG_OPERATION
					? HOST_ANALOG_OPERATION
					: HOST_DIGITAL_OPERATION;
			return `\t{ ${operation}, ${event.pin}, ${event.value} },`;
		})
		.join("\n");
	// The interposer defines malloc/free/realloc, which would collide with the
	// sanitizer's own interceptors, so allocation scenarios build without them
	// and pay for observability with the ASan/UBSan checks (documented choice).
	const allocationSource =
		allocationExpectation === null ? "" : buildAllocationInterposerSource();
	return `// Host run driver: records GPIO writes and matches them against the
// scenario's expected event sequence, then exits (the async event loop never
// returns on its own). An allocation-counting scenario instead drains cleanup
// passes and checks the net live blocks against its expected value.
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

static long e95_live_blocks = 0;

${allocationSource}
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

${buildDriverRuntimeSource(options)}
static void e95_check(int operation, int pin, int value) {
	if (e95_records_events) {
		printf("event %s %d %d\\n",
			operation == E95_ANALOG ? "analog" : "digital", pin, value);
		fflush(stdout);
		return;
	}
	if (e95_events_done) {
		fprintf(stderr, "unexpected extra event operation=%d pin=%d value=%d\\n",
			operation, pin, value);
		exit(1);
	}
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
	e95_last_event_pass = e95_pass_count;
	if (e95_seen < e95_expected_count) {
		return;
	}
	if (e95_last_event_pass < e95_minimum_pass ||
		e95_last_event_pass > e95_maximum_pass) {
		fprintf(stderr,
			"last event arrived in pass %ld, outside the expected range [%ld, %ld]\\n",
			e95_last_event_pass, e95_minimum_pass, e95_maximum_pass);
		exit(1);
	}
	e95_events_done = 1;
	if (e95_tracks_allocations) {
		return;
	}
	printf("all %d event(s) matched in %ld pass(es)\\n", e95_expected_count,
		e95_last_event_pass);
	exit(0);
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
	e95_initial_live_blocks = e95_live_blocks;
	setup();
	if (e95_expected_count == 0) {
		// The stability check needs the event loop to keep running after the last
		// event; an allocation scenario with no events has nothing to drain.
		printf("setup returned\\n");
		return 0;
	}
	fprintf(stderr, "setup returned after %d/%d event(s)\\n", e95_seen,
		e95_expected_count);
	return 1;
}
`;
};

// The pass counter is a test-only hook: we rewrite the generated module in the
// temp project to call it at the start of every event-loop iteration. The
// production codegen and the snapshots never see this instrumentation.
const instrumentEventLoopPass = (fixture) => {
	for (const sourcePath of fixture.moduleSources) {
		const content = readFileSync(sourcePath, UTF8);
		const loopIndex = content.indexOf(EVENT_LOOP_MARKER);
		if (loopIndex === -1) {
			continue;
		}
		const whileIndex = content.indexOf(EVENT_LOOP_WHILE_MARKER, loopIndex);
		if (whileIndex === -1) {
			throw new Error(
				`event loop in ${sourcePath} has no '${EVENT_LOOP_WHILE_MARKER}' body`,
			);
		}
		const insertIndex = whileIndex + EVENT_LOOP_WHILE_MARKER.length;
		const instrumented = `${content.slice(0, insertIndex)}\n${PASS_HOOK_CALL}\n${content.slice(insertIndex)}`;
		writeFileSync(
			sourcePath,
			`${PASS_HOOK_DECLARATION}\n${instrumented}`,
			UTF8,
		);
		return;
	}
	throw new Error(
		"scenario needs event-loop instrumentation but no generated module exposes the loop",
	);
};

const buildCompileArguments = (fixture, driverPath, binary, useSanitizers) => {
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
		...(useSanitizers ? [SANITIZER_ARGUMENTS] : []),
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

const runScenario = (context, scenario) => {
	const { recordEvents } = context;
	const passes = parsePasses(scenario);
	const allocationExpectation = parseAllocationExpectation(scenario);
	const events = recordEvents ? [] : parseEvents(scenario);
	const needsInstrumentation =
		recordEvents || passes !== null || allocationExpectation !== null;
	const fixture = buildFixture(context, scenario);
	assertAbsentTokens(fixture.translationUnitPath, scenario);
	if (needsInstrumentation) {
		instrumentEventLoopPass(fixture);
	}
	const driverPath = join(context.temporaryDirectory, `${scenario}.driver.cpp`);
	const binary = join(context.temporaryDirectory, `${scenario}.bin`);
	writeFileSync(
		driverPath,
		buildDriverSource(events, {
			allocationExpectation,
			passes,
			recordEvents,
		}),
		UTF8,
	);

	const compileArguments = buildCompileArguments(
		fixture,
		driverPath,
		binary,
		allocationExpectation === null,
	);
	execFileSync(COMPILER, compileArguments, { stdio: "pipe" });
	runCompiledBinary(binary, { stdio: "inherit" });
};

const runAnyScenario = (context, scenario) => {
	if (isRejectedScenario(scenario)) {
		runRejectedScenario(context, scenario);
		return;
	}
	runScenario(context, scenario);
};

const parseScenarioArguments = (argumentsList) => {
	const recordEvents = argumentsList.includes(RECORD_FLAG);
	const requested = argumentsList.filter((argument) => {
		return argument !== RECORD_FLAG;
	})[0];
	return { recordEvents, requested: requested ?? null };
};

// The legacy environment variable replaced every scenario's comparison with a
// trivial "print and exit 0". Fail loudly instead of silently going green.
const assertLegacyRecordModeUnused = () => {
	if (process.env[LEGACY_RECORD_ENVIRONMENT_KEY] !== undefined) {
		throw new Error(
			`${LEGACY_RECORD_ENVIRONMENT_KEY} is not supported: it let test:run pass without comparing events. Use the explicit, single-scenario \`node codegen-run/run.js ${RECORD_FLAG} <scenario>\` instead.`,
		);
	}
};

// Running a single scenario (`node run.js async-order`) keeps a focused
// iteration fast without changing the default full-suite behavior. Recording is
// restricted to exactly one scenario so it can never be the suite's mode.
const selectScenarios = (scenarios, requested, recordEvents) => {
	if (!requested) {
		if (recordEvents) {
			throw new Error(`${RECORD_FLAG} needs exactly one scenario to record`);
		}
		return scenarios;
	}
	const matching = scenarios.filter((scenario) => {
		return scenario.includes(requested);
	});
	if (matching.length === 0) {
		throw new Error(`no scenario matches "${requested}"`);
	}
	if (recordEvents && matching.length !== 1) {
		throw new Error(
			`${RECORD_FLAG} needs exactly one scenario, "${requested}" matched ${matching.length}`,
		);
	}
	return matching;
};

const main = async () => {
	assertLegacyRecordModeUnused();
	const { recordEvents, requested } = parseScenarioArguments(
		process.argv.slice(2),
	);
	const scenarios = selectScenarios(
		listScenarios(MODULE_DIRECTORY),
		requested,
		recordEvents,
	);
	const failures = await withTemporaryDirectoryAsync(
		TEMP_DIRECTORY_PREFIX,
		async (temporaryDirectory) => {
			const templateDirectory = await createProject(
				temporaryDirectory,
				TESTER_PLATFORM_NAME,
			);
			return runScenarioSuite({
				scenarios,
				runScenario: runAnyScenario.bind(null, {
					temporaryDirectory,
					templateDirectory,
					recordEvents,
				}),
			});
		},
	);
	process.exit(failures.length > 0 ? 1 : 0);
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
