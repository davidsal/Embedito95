// Hermetic checks for the opt-in `test:compile` command. They never invoke the
// real Arduino or ARM toolchains: the compilation paths are exercised with fake
// executables, so the snapshot suite stays fast and toolchain-free.
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
	BUILD_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	UTF8,
} from "embedito95-core";
import { resolveCompileJobCount } from "../registry/src/strategies/stm32-ll/compile-jobs.js";
import { STM32_COMPILE_JOBS_ENVIRONMENT_KEY } from "../registry/src/strategies/stm32-ll/constants.js";
import {
	compileArduinoSketch,
	runCompileStrategySilently,
	verifyCompileArtifacts,
} from "./compile-check-compilers.js";
import {
	collectPlatformJobs,
	resolveCompileEntryCategory,
	runEntryCompileJob,
} from "./compile-check-jobs.js";
import { runCompilePool } from "./compile-check-pool.js";
import { resolvePlatformSkip } from "./compile-check-probes.js";
import {
	beginCompileProgressSection,
	CLEAR_LINE_SEQUENCE,
	commitCompileProgressSection,
	createCompileProgress,
	finishCompileProgress,
	formatActiveProgressLine,
	isCompileProgressEnabled,
	SPINNER_FRAMES,
	SPINNER_INTERVAL_MILLISECONDS,
	startCompileProgress,
} from "./compile-check-progress.js";
import {
	buildCompileSizesSnapshot,
	compareCompileSizesSnapshot,
	formatCompiledTestLine,
	parseArduinoCompileSizes,
	parseArmCompileSizes,
	processCompileSizesSnapshot,
	serializeCompileSizesSnapshot,
} from "./compile-check-sizes.js";
import {
	formatCompileSummary,
	formatPlatformReport,
	formatTestName,
	parseCompileFast,
	parseCompileSnapshotUpdate,
	resolveCompileConcurrency,
	resolveStm32CompileJobCount,
	resolveStm32ProjectConcurrency,
	runTestCompile,
} from "./compile-checks.js";
import {
	AVR_ARTIFACT_EXTENSION,
	CLIENT_LIBRARY_BASENAMES,
	COMPILE_CONCURRENCY_ENVIRONMENT_KEY,
	COMPILE_FAST_ENVIRONMENT_KEY,
	COMPILE_PLATFORM_ORDER,
	COMPILE_SIZES_SNAPSHOT_STATUS,
	COMPILE_UPDATE_SNAPSHOTS_ENVIRONMENT_KEY,
	CORE_CATEGORY_NAME,
	EXAMPLES_DIRECTORY_NAME,
	EXCLUDED_TEST_SKIP_REASON,
	GREEN_CHECK,
	NO_SPINNER_ENVIRONMENT_KEY,
	RED_CROSS,
	REGISTRY_SOURCE_DIRECTORY,
	SKIP_MARK,
	SNAPSHOT_STATUS,
	STM32_MAXIMUM_PROJECT_CONCURRENCY,
	STM32_TOTAL_COMPILE_JOB_BUDGET,
	TEST_COMPILE_UNIT_CHECKS_GROUP,
} from "./constants.js";
import { buildEntry } from "./project-setup.js";
import { expectEqual, reportUnitChecks } from "./reporting.js";
import { withTemporaryDirectory } from "./runner-harness.js";
import { isMainModule } from "./src/language/language-snapshot-harness.mjs";

const POOL_JOB_COUNT = 8;
const POOL_MAXIMUM_CONCURRENCY = 3;
const POOL_JOB_DURATION_MILLISECONDS = 20;
const DUPLICATE_KEY = "shared-project";
const FILE_EXECUTABLE_MODE = 0o755;
const FAKE_DIAGNOSTIC_LINE =
	"fake.ino:3:1: error: 'brokenSymbol' was not declared in this scope";
const FAKE_AVR_ARTIFACT_FILE = "fake.ino.hex";
const FAILING_FAKE_ARDUINO_CLI = [
	"#!/bin/sh",
	`echo "fake.ino: In function 'void setup()':" >&2`,
	`echo "${FAKE_DIAGNOSTIC_LINE}" >&2`,
	"exit 1",
].join("\n");
const SUCCESSFUL_FAKE_ARDUINO_CLI = [
	"#!/bin/sh",
	'previousArgument=""',
	'outputDirectory=""',
	'for argument in "$@"; do',
	'  if [ "$previousArgument" = "--output-dir" ]; then',
	'    outputDirectory="$argument"',
	"  fi",
	'  previousArgument="$argument"',
	"done",
	'mkdir -p "$outputDirectory"',
	': > "$outputDirectory/fake.ino.hex"',
	"exit 0",
].join("\n");

const writeExecutableScript = ({ filePath, content }) => {
	writeFileSync(filePath, content);
	chmodSync(filePath, FILE_EXECUTABLE_MODE);
};

const withAsyncTemporaryDirectory = async (prefix, callback) => {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	try {
		return await callback(directory);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

const availableParallelismEight = () => {
	return 8;
};

const availableParallelismFour = () => {
	return 4;
};

const noSkipReason = () => {
	return null;
};

const arduinoCliMissingReason = () => {
	return "arduino-cli not found";
};

const stm32ToolchainMissingReason = () => {
	return "arm-none-eabi-g++ not found";
};

const writeNothing = () => {};

const NON_INTERACTIVE_PROGRESS_STREAM = {
	isTTY: false,
	write: writeNothing,
};

const checkCompileConcurrencyResolution = () => {
	const cases = [
		{
			label: "compile concurrency default follows available parallelism",
			environment: {},
			parallelism: 4,
			expected: 4,
		},
		{
			label: "compile concurrency default is capped at 8",
			environment: {},
			parallelism: 32,
			expected: 8,
		},
		{
			label: "compile concurrency default is at least 1",
			environment: {},
			parallelism: 0,
			expected: 1,
		},
		{
			label: "compile concurrency accepts an explicit integer",
			environment: { [COMPILE_CONCURRENCY_ENVIRONMENT_KEY]: "3" },
			parallelism: 16,
			expected: 3,
		},
		{
			label: "compile concurrency override is capped at 8",
			environment: { [COMPILE_CONCURRENCY_ENVIRONMENT_KEY]: "20" },
			parallelism: 16,
			expected: 8,
		},
		{
			label: "compile concurrency rejects zero",
			environment: { [COMPILE_CONCURRENCY_ENVIRONMENT_KEY]: "0" },
			parallelism: 4,
			expected: 4,
		},
		{
			label: "compile concurrency rejects non numeric values",
			environment: { [COMPILE_CONCURRENCY_ENVIRONMENT_KEY]: "many" },
			parallelism: 4,
			expected: 4,
		},
		{
			label: "compile concurrency rejects fractional values",
			environment: { [COMPILE_CONCURRENCY_ENVIRONMENT_KEY]: "2.5" },
			parallelism: 4,
			expected: 4,
		},
	];

	return cases.map(({ label, environment, parallelism, expected }) => {
		return expectEqual(
			label,
			resolveCompileConcurrency({ environment, parallelism }),
			expected,
		);
	});
};

const checkStm32CompileBudgetResolution = () => {
	const maximumConcurrencyCases = [
		{
			label: "stm32 projects run four at a time instead of one at a time",
			maximumConcurrency: 8,
			expected: STM32_MAXIMUM_PROJECT_CONCURRENCY,
		},
		{
			label: "stm32 project concurrency respects a lower configured limit",
			maximumConcurrency: 2,
			expected: 2,
		},
		{
			label: "stm32 project concurrency keeps at least one project",
			maximumConcurrency: 0,
			expected: 1,
		},
	];
	const compileJobCases = [
		{
			label: "stm32 translation units split the budget across four projects",
			maximumConcurrency: 4,
			expected: 2,
		},
		{
			label: "stm32 translation units grow with fewer concurrent projects",
			maximumConcurrency: 2,
			expected: 4,
		},
		{
			label: "stm32 translation units use the full budget for one project",
			maximumConcurrency: 1,
			expected: STM32_TOTAL_COMPILE_JOB_BUDGET,
		},
	];

	return [
		...maximumConcurrencyCases.map(
			({ label, maximumConcurrency, expected }) => {
				return expectEqual(
					label,
					resolveStm32ProjectConcurrency({ maximumConcurrency }),
					expected,
				);
			},
		),
		...compileJobCases.map(({ label, maximumConcurrency, expected }) => {
			return expectEqual(
				label,
				resolveStm32CompileJobCount({ maximumConcurrency }),
				expected,
			);
		}),
		expectEqual(
			"stm32 translation units never exceed the total process budget",
			resolveStm32CompileJobCount({ maximumConcurrency: 8 }) *
				resolveStm32ProjectConcurrency({ maximumConcurrency: 8 }) <=
				STM32_TOTAL_COMPILE_JOB_BUDGET,
			true,
		),
	];
};

const checkStm32CompileJobCountOption = () => {
	return [
		expectEqual(
			"stm32 compile jobs use the caller budget when the variable is unset",
			resolveCompileJobCount({
				environment: {},
				parallelism: 8,
				maximumCompileJobs: 2,
			}),
			2,
		),
		expectEqual(
			"stm32 environment override wins over the caller budget",
			resolveCompileJobCount({
				environment: { [STM32_COMPILE_JOBS_ENVIRONMENT_KEY]: "3" },
				parallelism: 8,
				maximumCompileJobs: 2,
			}),
			3,
		),
		expectEqual(
			"stm32 caller budget is clamped to the maximum",
			resolveCompileJobCount({
				environment: {},
				parallelism: 8,
				maximumCompileJobs: 20,
			}),
			8,
		),
		expectEqual(
			"stm32 invalid override falls back to the caller budget",
			resolveCompileJobCount({
				environment: { [STM32_COMPILE_JOBS_ENVIRONMENT_KEY]: "many" },
				parallelism: 8,
				maximumCompileJobs: 2,
			}),
			2,
		),
	];
};

const checkCompileFastParsing = () => {
	const cases = [
		{
			label: "fast compile is disabled by default",
			environment: {},
			expected: false,
		},
		{
			label: "fast compile accepts the value 1",
			environment: { [COMPILE_FAST_ENVIRONMENT_KEY]: "1" },
			expected: true,
		},
		{
			label: "fast compile rejects the value 0",
			environment: { [COMPILE_FAST_ENVIRONMENT_KEY]: "0" },
			expected: false,
		},
		{
			label: "fast compile rejects arbitrary text",
			environment: { [COMPILE_FAST_ENVIRONMENT_KEY]: "true" },
			expected: false,
		},
	];

	return cases.map(({ label, environment, expected }) => {
		return expectEqual(label, parseCompileFast({ environment }), expected);
	});
};

const checkCompileSnapshotUpdateParsing = () => {
	return [
		expectEqual(
			"snapshot update is disabled by default",
			parseCompileSnapshotUpdate({ environment: {} }),
			false,
		),
		expectEqual(
			"snapshot update accepts the value 1",
			parseCompileSnapshotUpdate({
				environment: { [COMPILE_UPDATE_SNAPSHOTS_ENVIRONMENT_KEY]: "1" },
			}),
			true,
		),
		expectEqual(
			"snapshot update rejects other values",
			parseCompileSnapshotUpdate({
				environment: { [COMPILE_UPDATE_SNAPSHOTS_ENVIRONMENT_KEY]: "yes" },
			}),
			false,
		),
	];
};

const createIndexedJobs = (count) => {
	const jobs = [];
	for (const jobIndex of Array.from({ length: count }).keys()) {
		jobs.push({ key: `job-${jobIndex}`, label: `job-${jobIndex}` });
	}
	return jobs;
};

const runTrackedPoolJob = async ({ job, context }) => {
	context.inFlight += 1;
	context.maximumInFlight = Math.max(context.maximumInFlight, context.inFlight);
	context.startedLabels.push(job.label);
	await setTimeout(context.jobDurationMilliseconds);
	context.inFlight -= 1;
};

const checkPoolLimitsAndRunsEachJobOnce = async () => {
	const context = {
		inFlight: 0,
		maximumInFlight: 0,
		startedLabels: [],
		jobDurationMilliseconds: POOL_JOB_DURATION_MILLISECONDS,
	};
	const results = await runCompilePool({
		jobs: createIndexedJobs(POOL_JOB_COUNT),
		maximumConcurrency: POOL_MAXIMUM_CONCURRENCY,
		runJob: runTrackedPoolJob,
		context,
	});
	const compiledLabels = results
		.filter((result) => {
			return result.status === "compiled";
		})
		.map((result) => {
			return result.label;
		});

	return [
		expectEqual(
			"pool runs every job exactly once",
			new Set(context.startedLabels).size,
			POOL_JOB_COUNT,
		),
		expectEqual(
			"pool starts more than one job at a time",
			context.maximumInFlight > 1,
			true,
		),
		expectEqual(
			"pool never exceeds the requested concurrency",
			context.maximumInFlight <= POOL_MAXIMUM_CONCURRENCY,
			true,
		),
		expectEqual(
			"pool returns one result per job",
			compiledLabels.length,
			POOL_JOB_COUNT,
		),
	];
};

const runTrackedKeyJob = async ({ job, context }) => {
	const keyInFlight = (context.inFlightByKey[job.key] ?? 0) + 1;
	context.inFlightByKey[job.key] = keyInFlight;
	context.maximumInFlightByKey[job.key] = Math.max(
		context.maximumInFlightByKey[job.key] ?? 0,
		keyInFlight,
	);
	context.totalInFlight += 1;
	context.maximumTotalInFlight = Math.max(
		context.maximumTotalInFlight,
		context.totalInFlight,
	);
	await setTimeout(context.jobDurationMilliseconds);
	context.inFlightByKey[job.key] = keyInFlight - 1;
	context.totalInFlight -= 1;
};

const checkPoolSerializesDuplicateKeys = async () => {
	const context = {
		inFlightByKey: {},
		maximumInFlightByKey: {},
		totalInFlight: 0,
		maximumTotalInFlight: 0,
		jobDurationMilliseconds: POOL_JOB_DURATION_MILLISECONDS,
	};
	const jobs = [
		{ key: DUPLICATE_KEY, label: "duplicate-first" },
		{ key: DUPLICATE_KEY, label: "duplicate-second" },
		{ key: "unique-project", label: "unique" },
	];
	await runCompilePool({
		jobs,
		maximumConcurrency: POOL_MAXIMUM_CONCURRENCY,
		runJob: runTrackedKeyJob,
		context,
	});

	return [
		expectEqual(
			"pool never compiles the same project concurrently",
			context.maximumInFlightByKey[DUPLICATE_KEY],
			1,
		),
		expectEqual(
			"pool still overlaps unrelated projects",
			context.maximumTotalInFlight > 1,
			true,
		),
	];
};

const ORCHESTRATION_JOB_COUNT = 5;
const ORCHESTRATION_MAXIMUM_CONCURRENCY = 3;
const ORCHESTRATION_JOB_DURATION_MILLISECONDS = 15;
const ORCHESTRATION_PLATFORM = "arduino-nano";
const STM32_ORCHESTRATION_PLATFORM = "stm32-bluepill";
const ORCHESTRATION_TRACKER = {
	inFlight: 0,
	maximumInFlight: 0,
};
const ORCHESTRATION_COMPILE_JOB_COUNTS = [];

const resetOrchestrationTracker = () => {
	ORCHESTRATION_TRACKER.inFlight = 0;
	ORCHESTRATION_TRACKER.maximumInFlight = 0;
	ORCHESTRATION_COMPILE_JOB_COUNTS.length = 0;
};

const createOrchestrationJobs = ({ platformName, targetPlatformName }) => {
	if (platformName !== targetPlatformName) {
		return [];
	}

	const jobs = [];
	for (const jobIndex of Array.from({
		length: ORCHESTRATION_JOB_COUNT,
	}).keys()) {
		jobs.push({
			key: `orchestration-${jobIndex}`,
			label: `orchestration-${jobIndex}`,
			platformName,
		});
	}
	return jobs;
};

const collectOrchestrationJobs = ({ platformName }) => {
	return createOrchestrationJobs({
		platformName,
		targetPlatformName: ORCHESTRATION_PLATFORM,
	});
};

const collectStm32OrchestrationJobs = ({ platformName }) => {
	return createOrchestrationJobs({
		platformName,
		targetPlatformName: STM32_ORCHESTRATION_PLATFORM,
	});
};

const runTrackedOrchestrationJob = async ({ context }) => {
	ORCHESTRATION_COMPILE_JOB_COUNTS.push(context.maximumCompileJobs);
	ORCHESTRATION_TRACKER.inFlight += 1;
	ORCHESTRATION_TRACKER.maximumInFlight = Math.max(
		ORCHESTRATION_TRACKER.maximumInFlight,
		ORCHESTRATION_TRACKER.inFlight,
	);
	await setTimeout(ORCHESTRATION_JOB_DURATION_MILLISECONDS);
	ORCHESTRATION_TRACKER.inFlight -= 1;
};

const runOrchestrationScenario = async ({
	environment,
	directory,
	collectPlatformJobs,
}) => {
	resetOrchestrationTracker();
	const result = await runTestCompile({
		environment,
		dependencies: {
			availableParallelism: availableParallelismEight,
			probePlatform: noSkipReason,
			collectPlatformJobs,
			runEntryCompileJob: runTrackedOrchestrationJob,
			compileSizesSnapshotPath: join(directory, "compile-sizes.json"),
			progressStream: NON_INTERACTIVE_PROGRESS_STREAM,
			writeOutput: writeNothing,
			writeError: writeNothing,
		},
	});

	return {
		result,
		maximumInFlight: ORCHESTRATION_TRACKER.maximumInFlight,
		compileJobCounts: [...ORCHESTRATION_COMPILE_JOB_COUNTS],
	};
};

const checkOrchestrationUsesBoundedConcurrency = async () => {
	const scenario = await withAsyncTemporaryDirectory(
		"embedito95-compile-orchestration-",
		async (directory) => {
			return await runOrchestrationScenario({
				environment: {
					[COMPILE_CONCURRENCY_ENVIRONMENT_KEY]: `${ORCHESTRATION_MAXIMUM_CONCURRENCY}`,
				},
				directory,
				collectPlatformJobs: collectOrchestrationJobs,
			});
		},
	);

	return [
		expectEqual(
			"orchestration exits successfully",
			scenario.result.exitCode,
			0,
		),
		expectEqual(
			"orchestration overlaps sketch compilations",
			scenario.maximumInFlight > 1,
			true,
		),
		expectEqual(
			"orchestration respects the concurrency budget",
			scenario.maximumInFlight <= ORCHESTRATION_MAXIMUM_CONCURRENCY,
			true,
		),
	];
};

const checkStm32OrchestrationRunsProjectsInParallel = async () => {
	const scenarios = await withAsyncTemporaryDirectory(
		"embedito95-compile-stm32-orchestration-",
		async (directory) => {
			const defaultScenario = await runOrchestrationScenario({
				environment: {},
				directory: join(directory, "default"),
				collectPlatformJobs: collectStm32OrchestrationJobs,
			});
			const limitedScenario = await runOrchestrationScenario({
				environment: { [COMPILE_CONCURRENCY_ENVIRONMENT_KEY]: "2" },
				directory: join(directory, "limited"),
				collectPlatformJobs: collectStm32OrchestrationJobs,
			});
			const clampedScenario = await runOrchestrationScenario({
				environment: { [COMPILE_CONCURRENCY_ENVIRONMENT_KEY]: "20" },
				directory: join(directory, "clamped"),
				collectPlatformJobs: collectStm32OrchestrationJobs,
			});
			return { defaultScenario, limitedScenario, clampedScenario };
		},
	);

	return [
		expectEqual(
			"stm32 orchestration exits successfully",
			scenarios.defaultScenario.result.exitCode,
			0,
		),
		expectEqual(
			"stm32 projects are no longer forced to one at a time",
			scenarios.defaultScenario.maximumInFlight > 1,
			true,
		),
		expectEqual(
			"stm32 project concurrency stops at the hard limit",
			scenarios.defaultScenario.maximumInFlight <=
				STM32_MAXIMUM_PROJECT_CONCURRENCY,
			true,
		),
		expectEqual(
			"stm32 jobs receive the translation-unit budget split across projects",
			scenarios.defaultScenario.compileJobCounts.every((compileJobCount) => {
				return compileJobCount === 2;
			}),
			true,
		),
		expectEqual(
			"stm32 configured concurrency limits the project pool",
			scenarios.limitedScenario.maximumInFlight <= 2 &&
				scenarios.limitedScenario.maximumInFlight > 1,
			true,
		),
		expectEqual(
			"stm32 configured concurrency adjusts the translation-unit budget",
			scenarios.limitedScenario.compileJobCounts.every((compileJobCount) => {
				return compileJobCount === 4;
			}),
			true,
		),
		expectEqual(
			"stm32 clamp still caps an oversized concurrency override",
			scenarios.clampedScenario.maximumInFlight <=
				STM32_MAXIMUM_PROJECT_CONCURRENCY,
			true,
		),
	];
};

const checkSkipResolution = () => {
	const skipped = resolvePlatformSkip({
		platformName: "arduino-nano",
		probes: { arduino: arduinoCliMissingReason },
	});
	const available = resolvePlatformSkip({
		platformName: "stm32-bluepill",
		probes: { stm32: noSkipReason },
	});

	return [
		expectEqual(
			"skip resolves the arduino probe reason",
			skipped,
			"arduino-cli not found",
		),
		expectEqual("skip is null when the platform is available", available, null),
		expectEqual(
			"skip treats both platforms independently",
			resolvePlatformSkip({
				platformName: "stm32-bluepill",
				probes: { stm32: stm32ToolchainMissingReason },
			}),
			"arm-none-eabi-g++ not found",
		),
	];
};

const captureMissingArtifacts = ({ directory }) => {
	try {
		verifyCompileArtifacts({
			directory,
			extensions: [".missing"],
			label: "missing compile",
		});
		return null;
	} catch (error) {
		return error.message;
	}
};

const checkArtifactVerification = () => {
	return withTemporaryDirectory(
		"embedito95-compile-artifacts-",
		(directory) => {
			const artifactsDirectory = join(directory, "artifacts");
			mkdirSync(artifactsDirectory, { recursive: true });
			writeFileSync(join(artifactsDirectory, "project.hex"), "");
			writeFileSync(join(artifactsDirectory, "project.elf"), "");
			writeFileSync(join(artifactsDirectory, "project.bin"), "");

			verifyCompileArtifacts({
				directory: artifactsDirectory,
				extensions: [AVR_ARTIFACT_EXTENSION],
				label: "successful compile",
			});

			const message = captureMissingArtifacts({
				directory: artifactsDirectory,
			});
			return [
				expectEqual(
					"artifact verification accepts produced files",
					message === null,
					false,
				),
				expectEqual(
					"artifact verification reports a missing artifact",
					message?.includes(".missing"),
					true,
				),
			];
		},
	);
};

const runFakeCompileJob = async ({ job }) => {
	await compileArduinoSketch({
		outputDirectory: job.outputDirectory,
		artifactsDirectory: job.artifactsDirectory,
		platformName: "arduino-nano",
		command: job.command,
	});
};

const collectSingleFakeJob = ({ platformName }) => {
	return [
		{
			key: `fake-${platformName}`,
			label: `fake-${platformName}`,
			platformName,
		},
	];
};

const checkBrokenCppFixtureFails = async () => {
	return withAsyncTemporaryDirectory(
		"embedito95-compile-broken-",
		async (directory) => {
			const command = join(directory, "fake-arduino-cli");
			writeExecutableScript({
				filePath: command,
				content: FAILING_FAKE_ARDUINO_CLI,
			});

			const artifactsDirectory = join(directory, "artifacts");
			const result = await runTestCompile({
				environment: { [COMPILE_CONCURRENCY_ENVIRONMENT_KEY]: "2" },
				dependencies: {
					availableParallelism: availableParallelismFour,
					probePlatform: noSkipReason,
					collectPlatformJobs: ({ platformName }) => {
						return collectSingleFakeJob({ platformName }).map((job) => {
							return {
								...job,
								command,
								outputDirectory: directory,
								artifactsDirectory,
							};
						});
					},
					runEntryCompileJob: runFakeCompileJob,
					compileSizesSnapshotPath: join(directory, "compile-sizes.json"),
					progressStream: NON_INTERACTIVE_PROGRESS_STREAM,
					writeOutput: () => {},
					writeError: () => {},
				},
			});
			const failures = result.reports.flatMap((report) => {
				return report.results.filter((jobResult) => {
					return jobResult.status === "failed";
				});
			});
			const diagnostics = failures
				.map((failure) => {
					return failure.error.message;
				})
				.join("\n");

			return [
				expectEqual(
					"broken C++ fixture makes test:compile fail",
					result.exitCode,
					1,
				),
				expectEqual(
					"broken C++ fixture reports the compiler diagnostic",
					diagnostics.includes(FAKE_DIAGNOSTIC_LINE),
					true,
				),
				expectEqual(
					"broken C++ fixture fails once per platform",
					failures.length,
					COMPILE_PLATFORM_ORDER.length,
				),
			];
		},
	);
};

const checkSuccessfulHermeticCompile = async () => {
	return withAsyncTemporaryDirectory(
		"embedito95-compile-success-",
		async (directory) => {
			const command = join(directory, "fake-arduino-cli");
			writeExecutableScript({
				filePath: command,
				content: SUCCESSFUL_FAKE_ARDUINO_CLI,
			});
			const artifactsDirectory = join(directory, "artifacts");

			await compileArduinoSketch({
				outputDirectory: directory,
				artifactsDirectory,
				platformName: "arduino-nano",
				command,
			});
			verifyCompileArtifacts({
				directory: artifactsDirectory,
				extensions: [AVR_ARTIFACT_EXTENSION],
				label: "hermetic compile",
			});

			return [
				expectEqual(
					"hermetic compile succeeds and produces an AVR artifact",
					existsSync(join(artifactsDirectory, FAKE_AVR_ARTIFACT_FILE)),
					true,
				),
			];
		},
	);
};

const EXAMPLE_JOB_COUNT = 4;
const ENTRY_PIPELINE_PLATFORM = "arduino-nano";
const FAKE_SOURCE_DIRECTORY = "/fake-source";

const createFakeEntryJob = (entryFile) => {
	return {
		key: entryFile,
		label: `${EXAMPLES_DIRECTORY_NAME}/${ENTRY_PIPELINE_PLATFORM}/${entryFile}`,
		platformName: ENTRY_PIPELINE_PLATFORM,
		sourceDirectory: FAKE_SOURCE_DIRECTORY,
		entryFile,
	};
};

const findJobByEntryFile = ({ jobs, entryFile }) => {
	return jobs.find((job) => {
		return job.entryFile === entryFile;
	});
};

const checkCompileEntryCategories = () => {
	const stm32Jobs = collectPlatformJobs({
		platformName: "stm32-bluepill",
		compileAll: true,
	});
	const clientCategoryResults = CLIENT_LIBRARY_BASENAMES.map((basename) => {
		return expectEqual(
			`client library ${basename} is grouped under libraries`,
			resolveCompileEntryCategory({
				category: LIBRARIES_DIRECTORY_NAME,
				entryFile: `${basename}.test.e95`,
			}),
			LIBRARIES_DIRECTORY_NAME,
		);
	});

	return [
		...clientCategoryResults,
		expectEqual(
			"core module gpio is grouped under core",
			resolveCompileEntryCategory({
				category: LIBRARIES_DIRECTORY_NAME,
				entryFile: "gpio.test.e95",
			}),
			CORE_CATEGORY_NAME,
		),
		expectEqual(
			"language entry anon-nested is grouped under core",
			resolveCompileEntryCategory({
				category: LIBRARIES_DIRECTORY_NAME,
				entryFile: "anon-nested.test.e95",
			}),
			CORE_CATEGORY_NAME,
		),
		expectEqual(
			"examples keep their own category",
			resolveCompileEntryCategory({
				category: EXAMPLES_DIRECTORY_NAME,
				entryFile: "blink.test.e95",
			}),
			EXAMPLES_DIRECTORY_NAME,
		),
		expectEqual(
			"dht22 job label reports the libraries category",
			findJobByEntryFile({ jobs: stm32Jobs, entryFile: "dht22.test.e95" })
				.label,
			`${LIBRARIES_DIRECTORY_NAME}/stm32-bluepill/dht22.test.e95`,
		),
		expectEqual(
			"gpio job label reports the core category",
			findJobByEntryFile({ jobs: stm32Jobs, entryFile: "gpio.test.e95" }).label,
			`${CORE_CATEGORY_NAME}/stm32-bluepill/gpio.test.e95`,
		),
		expectEqual(
			"skipped eeprom keeps the libraries category",
			findJobByEntryFile({ jobs: stm32Jobs, entryFile: "eeprom.test.e95" })
				.label,
			`${LIBRARIES_DIRECTORY_NAME}/stm32-bluepill/eeprom.test.e95`,
		),
	];
};

const checkCollectPlatformJobsUsesGeneratedEntries = () => {
	const fastJobs = collectPlatformJobs({
		platformName: ENTRY_PIPELINE_PLATFORM,
		compileAll: false,
	});
	const fullJobs = collectPlatformJobs({
		platformName: ENTRY_PIPELINE_PLATFORM,
		compileAll: true,
	});

	return [
		expectEqual(
			"fast compile jobs contain exactly the four platform examples",
			fastJobs.length,
			EXAMPLE_JOB_COUNT,
		),
		expectEqual(
			"fast compile jobs never contain core or library entries",
			fastJobs.every((job) => {
				return (
					job.label.startsWith(`${EXAMPLES_DIRECTORY_NAME}/`) &&
					!job.label.startsWith(`${CORE_CATEGORY_NAME}/`) &&
					!job.label.startsWith(`${LIBRARIES_DIRECTORY_NAME}/`)
				);
			}),
			true,
		),
		expectEqual(
			"compile jobs never reuse the prebuilt testers",
			fullJobs.every((job) => {
				return !job.label.startsWith("tester/");
			}),
			true,
		),
		expectEqual(
			"every compile job carries its source entry",
			fullJobs.every((job) => {
				return (
					typeof job.sourceDirectory === "string" &&
					typeof job.entryFile === "string"
				);
			}),
			true,
		),
		expectEqual(
			"full compile includes the library entries",
			fullJobs.length > fastJobs.length,
			true,
		),
	];
};

const checkPlatformTestExclusionsSkipUnsupportedEntries = () => {
	const stm32Jobs = collectPlatformJobs({
		platformName: "stm32-bluepill",
		compileAll: true,
	});
	const arduinoJobs = collectPlatformJobs({
		platformName: "arduino-nano",
		compileAll: true,
	});

	return [
		expectEqual(
			"stm32 eeprom entry is collected but skipped as unsupported",
			findJobByEntryFile({ jobs: stm32Jobs, entryFile: "eeprom.test.e95" })
				?.skipReason,
			EXCLUDED_TEST_SKIP_REASON,
		),
		expectEqual(
			"arduino eeprom entry still compiles",
			findJobByEntryFile({ jobs: arduinoJobs, entryFile: "eeprom.test.e95" })
				?.skipReason,
			null,
		),
		expectEqual(
			"excluded entries keep their slot in the job list",
			stm32Jobs.some((job) => {
				return job.entryFile === "eeprom.test.e95";
			}),
			true,
		),
	];
};

const captureCompileAllValues = async ({ environment, directory }) => {
	const observedCompileAllValues = [];
	const result = await runTestCompile({
		environment,
		dependencies: {
			availableParallelism: availableParallelismFour,
			probePlatform: noSkipReason,
			collectPlatformJobs: ({ compileAll }) => {
				observedCompileAllValues.push(compileAll);
				return [];
			},
			runEntryCompileJob: async () => {},
			compileSizesSnapshotPath: join(directory, "compile-sizes.json"),
			progressStream: NON_INTERACTIVE_PROGRESS_STREAM,
			writeOutput: writeNothing,
			writeError: writeNothing,
		},
	});
	return { result, observedCompileAllValues };
};

const checkCompileScopeDefaultsToFull = async () => {
	return withAsyncTemporaryDirectory(
		"embedito95-compile-scope-",
		async (directory) => {
			const defaultScope = await captureCompileAllValues({
				environment: {},
				directory: join(directory, "default"),
			});
			const fastScope = await captureCompileAllValues({
				environment: { [COMPILE_FAST_ENVIRONMENT_KEY]: "1" },
				directory: join(directory, "fast"),
			});

			return [
				expectEqual(
					"default compile scope includes the library entries",
					defaultScope.observedCompileAllValues.every((compileAll) => {
						return compileAll;
					}),
					true,
				),
				expectEqual(
					"fast compile scope excludes the library entries",
					fastScope.observedCompileAllValues.every((compileAll) => {
						return !compileAll;
					}),
					true,
				),
			];
		},
	);
};

const SERIAL_TIME_DEPENDENCY = "time";
const ARDUINO_SERIAL_SUPPORT_FILE = join(
	REGISTRY_SOURCE_DIRECTORY,
	"strategies/arduino/serial/support.js",
);
const STM32_SERIAL_SUPPORT_FILE = join(
	REGISTRY_SOURCE_DIRECTORY,
	"strategies/stm32-ll/serial/support.js",
);
const STM32_SERIAL_HEADER_FILE = join(
	REGISTRY_SOURCE_DIRECTORY,
	"strategies/stm32-ll/serial/serial.h",
);
const STM32_SERIAL_SOURCE_FILE = join(
	REGISTRY_SOURCE_DIRECTORY,
	"strategies/stm32-ll/serial/serial.cpp",
);
const STM32_SERIAL_PLAIN_INT_PATTERNS = {
	sendDeclaration: /void send\(int value\) const;/,
	sendDefinition: /void SerialPort::send\(int value\) const \{/,
	sendLineDeclaration: /void sendLine\(int value\) const;/,
	sendLineDefinition: /void SerialPort::sendLine\(int value\) const \{/,
};

const loadStrategyDefinition = async (filePath) => {
	const loadedModule = await import(pathToFileURL(filePath).href);
	return loadedModule.definition;
};

const checkSerialStrategyDeclaresTimeDependency = async () => {
	const arduinoDefinition = await loadStrategyDefinition(
		ARDUINO_SERIAL_SUPPORT_FILE,
	);
	const stm32Definition = await loadStrategyDefinition(
		STM32_SERIAL_SUPPORT_FILE,
	);

	return [
		expectEqual(
			"arduino serial declares the time dependency it includes",
			arduinoDefinition.dependencies.includes(SERIAL_TIME_DEPENDENCY),
			true,
		),
		expectEqual(
			"stm32 serial declares the time dependency it includes",
			stm32Definition.dependencies.includes(SERIAL_TIME_DEPENDENCY),
			true,
		),
	];
};

const checkStm32SerialCoversPlainIntLiterals = () => {
	const header = readFileSync(STM32_SERIAL_HEADER_FILE, UTF8);
	const source = readFileSync(STM32_SERIAL_SOURCE_FILE, UTF8);

	return [
		expectEqual(
			"stm32 serial header declares send(int)",
			STM32_SERIAL_PLAIN_INT_PATTERNS.sendDeclaration.test(header),
			true,
		),
		expectEqual(
			"stm32 serial source defines send(int)",
			STM32_SERIAL_PLAIN_INT_PATTERNS.sendDefinition.test(source),
			true,
		),
		expectEqual(
			"stm32 serial header declares sendLine(int)",
			STM32_SERIAL_PLAIN_INT_PATTERNS.sendLineDeclaration.test(header),
			true,
		),
		expectEqual(
			"stm32 serial source defines sendLine(int)",
			STM32_SERIAL_PLAIN_INT_PATTERNS.sendLineDefinition.test(source),
			true,
		),
	];
};

const checkEntryPipelineGeneratesOwnProjectPerEntry = async () => {
	const events = [];
	const dependencies = {
		createProject: async (temporaryDirectory, platformName) => {
			const projectDirectory = join(temporaryDirectory, platformName);
			mkdirSync(projectDirectory, { recursive: true });
			events.push({
				type: "createProject",
				temporaryDirectory,
				platformName,
				projectDirectory,
			});
			return projectDirectory;
		},
		copyEntryFiles: (sourceDirectory, projectDirectory) => {
			events.push({
				type: "copyEntryFiles",
				sourceDirectory,
				projectDirectory,
			});
		},
		buildEntry: (projectDirectory, platformName, entryFile) => {
			events.push({
				type: "buildEntry",
				projectDirectory,
				platformName,
				entryFile,
			});
		},
		compileArduinoSketch: async ({ outputDirectory, artifactsDirectory }) => {
			mkdirSync(artifactsDirectory, { recursive: true });
			writeFileSync(join(artifactsDirectory, FAKE_AVR_ARTIFACT_FILE), "");
			events.push({
				type: "compileArduinoSketch",
				outputDirectory,
				artifactsDirectory,
			});
		},
		compileStm32Project: async () => {
			throw new Error("unexpected STM32 compile");
		},
		verifyCompileArtifacts,
	};
	const jobs = ["first.test.e95", "second.test.e95"].map(createFakeEntryJob);

	await Promise.all(
		jobs.map((job) => {
			return runEntryCompileJob({
				job,
				context: { buildCacheDirectory: "/fake-cache" },
				dependencies,
			});
		}),
	);

	const projectEvents = events.filter((event) => {
		return event.type === "createProject";
	});
	const buildEvents = events.filter((event) => {
		return event.type === "buildEntry";
	});
	const compileEvents = events.filter((event) => {
		return event.type === "compileArduinoSketch";
	});
	const temporaryDirectories = new Set(
		projectEvents.map((event) => {
			return event.temporaryDirectory;
		}),
	);
	const outputDirectories = new Set(
		compileEvents.map((event) => {
			return event.outputDirectory;
		}),
	);

	return [
		expectEqual(
			"entry pipeline generates one project per entry",
			projectEvents.length,
			jobs.length,
		),
		expectEqual(
			"entry pipeline keeps a unique temporary project per entry",
			temporaryDirectories.size,
			jobs.length,
		),
		expectEqual(
			"entry pipeline compiles a distinct build directory per entry",
			outputDirectories.size,
			jobs.length,
		),
		expectEqual(
			"entry pipeline compiles the freshly generated build",
			buildEvents.every((buildEvent) => {
				const expectedOutputDirectory = join(
					buildEvent.projectDirectory,
					BUILD_DIRECTORY_NAME,
					buildEvent.platformName,
				);
				return compileEvents.some((compileEvent) => {
					return compileEvent.outputDirectory === expectedOutputDirectory;
				});
			}),
			true,
		),
		expectEqual(
			"entry pipeline copies the entry sources into each project",
			events
				.filter((event) => {
					return event.type === "copyEntryFiles";
				})
				.every((event) => {
					return event.sourceDirectory === FAKE_SOURCE_DIRECTORY;
				}),
			true,
		),
	];
};

const checkEntryGenerationFailureFailsTheJob = async () => {
	const dependencies = {
		createProject: async (temporaryDirectory, platformName) => {
			return join(temporaryDirectory, platformName);
		},
		copyEntryFiles: () => {},
		buildEntry: () => {
			throw new Error("build failed for entry");
		},
		compileArduinoSketch: async () => {},
		compileStm32Project: async () => {},
		verifyCompileArtifacts: () => {},
	};
	const captureFailure = async () => {
		try {
			await runEntryCompileJob({
				job: createFakeEntryJob("broken.test.e95"),
				context: {},
				dependencies,
			});
			return null;
		} catch (error) {
			return error.message;
		}
	};

	return [
		expectEqual(
			"entry generation failure fails the job instead of skipping it",
			await captureFailure(),
			"build failed for entry",
		),
	];
};

const createFakeStm32EntryJob = (entryFile) => {
	return {
		key: entryFile,
		label: `${CORE_CATEGORY_NAME}/stm32-bluepill/${entryFile}`,
		platformName: "stm32-bluepill",
		sourceDirectory: FAKE_SOURCE_DIRECTORY,
		entryFile,
	};
};

const checkStm32EntryForwardsCompileBudget = async () => {
	let receivedCompileJobs = null;

	await runEntryCompileJob({
		job: createFakeStm32EntryJob("blink.test.e95"),
		context: { maximumCompileJobs: 3 },
		dependencies: {
			createProject: async (temporaryDirectory, platformName) => {
				return join(temporaryDirectory, platformName);
			},
			copyEntryFiles: () => {},
			buildEntry: () => {},
			compileStm32Project: async ({ maximumCompileJobs }) => {
				receivedCompileJobs = maximumCompileJobs;
				return { sizes: null };
			},
			verifyCompileArtifacts: () => {},
		},
	});

	return [
		expectEqual(
			"stm32 entry forwards the compile job budget to the strategy",
			receivedCompileJobs,
			3,
		),
	];
};

const checkSkippedPlatformExitsZero = async () => {
	const result = await withAsyncTemporaryDirectory(
		"embedito95-compile-skipped-",
		async (directory) => {
			return await runTestCompile({
				environment: {},
				dependencies: {
					availableParallelism: availableParallelismFour,
					probePlatform: ({ platformName }) => {
						return `${platformName} toolchain missing`;
					},
					collectPlatformJobs: collectSingleFakeJob,
					runEntryCompileJob: runFakeCompileJob,
					compileSizesSnapshotPath: join(directory, "compile-sizes.json"),
					progressStream: NON_INTERACTIVE_PROGRESS_STREAM,
					writeOutput: writeNothing,
					writeError: writeNothing,
				},
			});
		},
	);

	return [
		expectEqual("skipped platforms exit with code zero", result.exitCode, 0),
		expectEqual(
			"every platform is reported as skipped",
			result.reports.every((report) => {
				return report.results.every((jobResult) => {
					return jobResult.status === "skipped";
				});
			}),
			true,
		),
	];
};

const SAMPLE_SIZES = {
	flash: 7680,
	ram: 2008,
	flashMax: 65536,
	ramMax: 20480,
};
const SAMPLE_DURATION_MILLISECONDS = 1400;
const ARDUINO_SIZE_OUTPUT = JSON.stringify({
	builder_result: {
		executable_sections_size: [
			{
				name: "text",
				size: SAMPLE_SIZES.flash,
				max_size: SAMPLE_SIZES.flashMax,
			},
			{ name: "data", size: SAMPLE_SIZES.ram, max_size: SAMPLE_SIZES.ramMax },
		],
	},
});
const ARM_SIZE_OUTPUT = [
	"   text\t   data\t    bss\t    dec\t    hex\tfilename",
	"   7680\t   2008\t    168\t   9856\t   2680\tfake.elf",
].join("\n");

const checkCompileSizeParsing = () => {
	const parsedArduino = parseArduinoCompileSizes({
		output: ARDUINO_SIZE_OUTPUT,
	});
	const parsedArduinoFallback = parseArduinoCompileSizes({
		output: JSON.stringify({
			builder_result: {
				executable_sections_size: [
					{ name: "text", size: SAMPLE_SIZES.flash },
					{ name: "data", size: SAMPLE_SIZES.ram },
				],
			},
		}),
		flashMax: SAMPLE_SIZES.flashMax,
		ramMax: SAMPLE_SIZES.ramMax,
	});
	const parsedArm = parseArmCompileSizes({
		output: ARM_SIZE_OUTPUT,
		flashMax: SAMPLE_SIZES.flashMax,
		ramMax: SAMPLE_SIZES.ramMax,
	});

	return [
		expectEqual(
			"arduino sizes parse text as flash and data as ram",
			parsedArduino?.flash,
			SAMPLE_SIZES.flash,
		),
		expectEqual(
			"arduino sizes parse ram usage",
			parsedArduino?.ram,
			SAMPLE_SIZES.ram,
		),
		expectEqual(
			"arduino sizes parse flash maximum",
			parsedArduino?.flashMax,
			SAMPLE_SIZES.flashMax,
		),
		expectEqual(
			"arduino sizes fall back to platform maximums",
			parsedArduinoFallback?.flashMax,
			SAMPLE_SIZES.flashMax,
		),
		expectEqual(
			"arduino sizes reject missing sections",
			parseArduinoCompileSizes({ output: '{"builder_result":{}}' }),
			null,
		),
		expectEqual(
			"arduino sizes reject invalid JSON",
			parseArduinoCompileSizes({ output: "not json" }),
			null,
		),
		expectEqual(
			"arm sizes add text and data for flash",
			parsedArm?.flash,
			SAMPLE_SIZES.flash + SAMPLE_SIZES.ram,
		),
		expectEqual(
			"arm sizes add data and bss for ram",
			parsedArm?.ram,
			SAMPLE_SIZES.ram + 168,
		),
		expectEqual(
			"arm sizes reject unrelated output",
			parseArmCompileSizes({ output: "no size table" }),
			null,
		),
	];
};

const checkCompileSizeFormatting = () => {
	return [
		expectEqual(
			"test name strips the entry suffix and capitalizes",
			formatTestName("blink.test.e95"),
			"Blink",
		),
		expectEqual(
			"test line reports name, duration and sizes",
			formatCompiledTestLine({
				name: "Blink",
				durationMilliseconds: SAMPLE_DURATION_MILLISECONDS,
				sizes: SAMPLE_SIZES,
			}),
			`${GREEN_CHECK} Blink — 1.4s — Flash 7680/65536 (11.7%) | RAM 2008/20480 (9.8%)`,
		),
		expectEqual(
			"test line shows unknown sizes instead of failing",
			formatCompiledTestLine({
				name: "Blink",
				durationMilliseconds: SAMPLE_DURATION_MILLISECONDS,
				sizes: null,
			}),
			`${GREEN_CHECK} Blink — 1.4s — Flash ? | RAM ?`,
		),
	];
};

const createCompiledResult = ({ label, durationMilliseconds, sizes }) => {
	return {
		status: "compiled",
		label,
		durationMilliseconds,
		value: { sizes },
	};
};

const checkPlatformReportHierarchy = () => {
	const report = {
		platformName: "arduino-nano",
		skipReason: null,
		results: [
			createCompiledResult({
				label: "libraries/arduino-nano/servo.test.e95",
				durationMilliseconds: 1100,
				sizes: SAMPLE_SIZES,
			}),
			createCompiledResult({
				label: "examples/arduino-nano/button.test.e95",
				durationMilliseconds: 3700,
				sizes: null,
			}),
			createCompiledResult({
				label: "examples/arduino-nano/blink.test.e95",
				durationMilliseconds: 2400,
				sizes: SAMPLE_SIZES,
			}),
			createCompiledResult({
				label: "core/arduino-nano/gpio.test.e95",
				durationMilliseconds: 900,
				sizes: SAMPLE_SIZES,
			}),
		],
	};

	return [
		expectEqual(
			"platform report nests categories as examples, libraries and core and sorts tests by name",
			formatPlatformReport({ report }),
			[
				"arduino-nano",
				"  examples",
				`    ${GREEN_CHECK} Blink — 2.4s — Flash 7680/65536 (11.7%) | RAM 2008/20480 (9.8%)`,
				`    ${GREEN_CHECK} Button — 3.7s — Flash ? | RAM ?`,
				"  libraries",
				`    ${GREEN_CHECK} Servo — 1.1s — Flash 7680/65536 (11.7%) | RAM 2008/20480 (9.8%)`,
				"  core",
				`    ${GREEN_CHECK} Gpio — 0.9s — Flash 7680/65536 (11.7%) | RAM 2008/20480 (9.8%)`,
				"",
			].join("\n"),
		),
	];
};

const checkPlatformReportFailure = () => {
	const report = {
		platformName: "arduino-nano",
		skipReason: null,
		results: [
			{
				status: "failed",
				label: "examples/arduino-nano/broken.test.e95",
				durationMilliseconds: 500,
				error: new Error("first diagnostic line\nsecond diagnostic line"),
			},
		],
	};

	return [
		expectEqual(
			"failed test prints the red cross, duration and indented diagnostic",
			formatPlatformReport({ report }),
			[
				"arduino-nano",
				"  examples",
				`    ${RED_CROSS} Broken — 0.5s`,
				"      first diagnostic line",
				"      second diagnostic line",
				"",
			].join("\n"),
		),
	];
};

const checkPlatformReportSkip = () => {
	const report = {
		platformName: "stm32-bluepill",
		skipReason: "arm-none-eabi-g++ not found",
		results: [
			{
				status: "skipped",
				label: "examples/stm32-bluepill/blink.test.e95",
				reason: "arm-none-eabi-g++ not found",
			},
		],
	};

	return [
		expectEqual(
			"skipped platform prints a single skip line",
			formatPlatformReport({ report }),
			`${SKIP_MARK} stm32-bluepill skipped: arm-none-eabi-g++ not found\n`,
		),
	];
};

const checkCompileSummaryOrdering = () => {
	const passingReports = [
		{
			platformName: "arduino-nano",
			skipReason: null,
			results: [
				createCompiledResult({
					label: "examples/arduino-nano/blink.test.e95",
					durationMilliseconds: 1000,
					sizes: SAMPLE_SIZES,
				}),
			],
		},
		{
			platformName: "stm32-bluepill",
			skipReason: null,
			results: [
				createCompiledResult({
					label: "examples/stm32-bluepill/blink.test.e95",
					durationMilliseconds: 1000,
					sizes: SAMPLE_SIZES,
				}),
			],
		},
	];
	const mixedReports = [
		...passingReports,
		{
			platformName: "extra-platform",
			skipReason: null,
			results: [
				{
					status: "failed",
					label: "examples/extra-platform/broken.test.e95",
					durationMilliseconds: 500,
					error: new Error("diagnostic"),
				},
			],
		},
		{
			platformName: "skipped-platform",
			skipReason: "toolchain missing",
			results: [],
		},
	];
	const allPassingSummary = formatCompileSummary({
		reports: passingReports,
		durationMilliseconds: 8200,
		snapshotResult: { status: COMPILE_SIZES_SNAPSHOT_STATUS.match },
	});
	const mixedSummary = formatCompileSummary({
		reports: mixedReports,
		durationMilliseconds: 8200,
		snapshotResult: { status: COMPILE_SIZES_SNAPSHOT_STATUS.mismatch },
	});

	return [
		expectEqual(
			"all-passing summary reports suites, tests, time and snapshot",
			allPassingSummary,
			[
				"Test Suites: 2 passed, 2 total",
				"Tests:       2 passed, 2 total",
				"Time:        8.2s",
				"Snapshot:    1 matched",
			].join("\n"),
		),
		expectEqual(
			"mixed summary reports failed and skipped suites and snapshot status",
			mixedSummary,
			[
				"Test Suites: 2 passed, 1 failed, 1 skipped, 4 total",
				"Tests:       2 passed, 1 failed, 3 total",
				"Time:        8.2s",
				"Snapshot:    1 failed",
			].join("\n"),
		),
	];
};

const checkStm32CompileOutputIsSilenced = async () => {
	const capturedLines = [];
	const originalConsoleLog = console.log;
	const capturingConsoleLog = (...argumentsList) => {
		capturedLines.push(argumentsList.join(" "));
	};

	try {
		console.log = capturingConsoleLog;
		const result = await runCompileStrategySilently({
			compileStrategy: async ({ log }) => {
				log("✔ Compiled   Flash: 1 / 2 (50%)");
				return { sizes: SAMPLE_SIZES };
			},
			options: {},
		});
		const consoleLogRestored = console.log === capturingConsoleLog;

		return [
			expectEqual(
				"stm32 strategy output is silenced during the compile",
				capturedLines.length,
				0,
			),
			expectEqual(
				"stm32 strategy result is preserved",
				result.sizes.flash,
				SAMPLE_SIZES.flash,
			),
			expectEqual(
				"stm32 strategy keeps console.log untouched",
				consoleLogRestored,
				true,
			),
		];
	} finally {
		console.log = originalConsoleLog;
	}
};

const createSnapshotReport = ({ platformName, status, sizes }) => {
	return {
		platformName,
		skipReason: null,
		results: [
			{
				status,
				label: `${EXAMPLES_DIRECTORY_NAME}/${platformName}/blink.test.e95`,
				value: { sizes },
			},
		],
	};
};

const checkCompileSizesSnapshot = () => {
	const actualSnapshot = buildCompileSizesSnapshot({
		reports: [
			createSnapshotReport({
				platformName: "arduino-nano",
				status: "compiled",
				sizes: SAMPLE_SIZES,
			}),
			{
				platformName: "stm32-bluepill",
				skipReason: "toolchain missing",
				results: [],
			},
		],
	});
	const expectedSnapshot = {
		"arduino-nano": {
			"examples/arduino-nano/blink.test.e95": SAMPLE_SIZES,
		},
	};
	const mismatchMessages = compareCompileSizesSnapshot({
		expected: expectedSnapshot,
		actual: {
			"arduino-nano": {
				"examples/arduino-nano/blink.test.e95": {
					...SAMPLE_SIZES,
					flash: SAMPLE_SIZES.flash + 1,
				},
			},
		},
	});

	return [
		expectEqual(
			"snapshot keeps platforms in execution order",
			Object.keys(actualSnapshot).join(","),
			"arduino-nano",
		),
		expectEqual(
			"snapshot stores the measured sizes",
			serializeCompileSizesSnapshot(actualSnapshot),
			`${JSON.stringify(expectedSnapshot, null, "\t")}\n`,
		),
		expectEqual(
			"snapshot comparison matches equal sizes",
			compareCompileSizesSnapshot({
				expected: expectedSnapshot,
				actual: actualSnapshot,
			}).length,
			0,
		),
		expectEqual(
			"snapshot comparison reports the changed entry",
			mismatchMessages[0]?.includes("blink.test.e95"),
			true,
		),
		expectEqual(
			"snapshot comparison reports expected and actual values",
			mismatchMessages[0]?.includes(`${SAMPLE_SIZES.flash + 1}`),
			true,
		),
		expectEqual(
			"snapshot comparison reports missing entries",
			compareCompileSizesSnapshot({
				expected: {},
				actual: actualSnapshot,
			})[0]?.includes("missing"),
			true,
		),
	];
};

const checkCompileSizesSnapshotLifecycle = async () => {
	return withAsyncTemporaryDirectory(
		"embedito95-compile-sizes-",
		(directory) => {
			const snapshotPath = join(directory, "compile-sizes.json");
			const snapshot = {
				"arduino-nano": {
					"examples/arduino-nano/blink.test.e95": SAMPLE_SIZES,
				},
			};
			const firstRun = processCompileSizesSnapshot({
				snapshotPath,
				snapshot,
				updateSnapshots: false,
			});
			const secondRun = processCompileSizesSnapshot({
				snapshotPath,
				snapshot,
				updateSnapshots: false,
			});
			const changedSnapshot = {
				"arduino-nano": {
					"examples/arduino-nano/blink.test.e95": {
						...SAMPLE_SIZES,
						ram: SAMPLE_SIZES.ram + 16,
					},
				},
			};
			const mismatchRun = processCompileSizesSnapshot({
				snapshotPath,
				snapshot: changedSnapshot,
				updateSnapshots: false,
			});
			const updateRun = processCompileSizesSnapshot({
				snapshotPath,
				snapshot: changedSnapshot,
				updateSnapshots: true,
			});
			const afterUpdateRun = processCompileSizesSnapshot({
				snapshotPath,
				snapshot: changedSnapshot,
				updateSnapshots: false,
			});

			return [
				expectEqual(
					"first run creates the size snapshot",
					firstRun.status,
					COMPILE_SIZES_SNAPSHOT_STATUS.created,
				),
				expectEqual(
					"second run matches the size snapshot",
					secondRun.status,
					COMPILE_SIZES_SNAPSHOT_STATUS.match,
				),
				expectEqual(
					"changed sizes fail the snapshot comparison",
					mismatchRun.status,
					COMPILE_SIZES_SNAPSHOT_STATUS.mismatch,
				),
				expectEqual(
					"snapshot update rewrites the file",
					updateRun.status,
					COMPILE_SIZES_SNAPSHOT_STATUS.updated,
				),
				expectEqual(
					"updated snapshot matches on the next run",
					afterUpdateRun.status,
					COMPILE_SIZES_SNAPSHOT_STATUS.match,
				),
			];
		},
	);
};

const collectSingleSizeJob = ({ platformName }) => {
	if (platformName !== "arduino-nano") {
		return [];
	}
	return [collectSingleFakeJob({ platformName })[0]];
};

const runSizedCompileJob = async () => {
	return { sizes: SAMPLE_SIZES };
};

const checkEntryReportIncludesDurationAndSizes = async () => {
	return withAsyncTemporaryDirectory(
		"embedito95-compile-report-",
		async (directory) => {
			const output = [];
			const result = await runTestCompile({
				environment: {},
				dependencies: {
					availableParallelism: availableParallelismFour,
					probePlatform: noSkipReason,
					collectPlatformJobs: collectSingleSizeJob,
					runEntryCompileJob: runSizedCompileJob,
					compileSizesSnapshotPath: join(directory, "compile-sizes.json"),
					progressStream: NON_INTERACTIVE_PROGRESS_STREAM,
					writeOutput: (text) => {
						output.push(text);
					},
					writeError: writeNothing,
				},
			});
			const reportText = output.join("");
			const compiledResults = result.reports.flatMap((report) => {
				return report.results;
			});

			return [
				expectEqual("size report exits successfully", result.exitCode, 0),
				expectEqual(
					"size report prints one line per compiled entry",
					reportText.includes(
						formatCompiledTestLine({
							name: formatTestName(compiledResults[0].label),
							durationMilliseconds: compiledResults[0].durationMilliseconds,
							sizes: SAMPLE_SIZES,
						}),
					),
					true,
				),
				expectEqual(
					"size report includes flash and ram figures",
					reportText.includes(
						"Flash 7680/65536 (11.7%) | RAM 2008/20480 (9.8%)",
					),
					true,
				),
			];
		},
	);
};

const checkSnapshotMismatchFailsRun = async () => {
	return withAsyncTemporaryDirectory(
		"embedito95-compile-sizes-fail-",
		async (directory) => {
			const snapshotPath = join(directory, "compile-sizes.json");
			writeFileSync(
				snapshotPath,
				serializeCompileSizesSnapshot({
					"arduino-nano": {
						"fake-arduino-nano": {
							...SAMPLE_SIZES,
							flash: 1,
						},
					},
				}),
			);
			const errors = [];
			const result = await runTestCompile({
				environment: {},
				dependencies: {
					availableParallelism: availableParallelismFour,
					probePlatform: noSkipReason,
					collectPlatformJobs: collectSingleSizeJob,
					runEntryCompileJob: runSizedCompileJob,
					compileSizesSnapshotPath: snapshotPath,
					progressStream: NON_INTERACTIVE_PROGRESS_STREAM,
					writeOutput: writeNothing,
					writeError: (text) => {
						errors.push(text);
					},
				},
			});

			return [
				expectEqual(
					"size snapshot mismatch fails the command",
					result.exitCode,
					1,
				),
				expectEqual(
					"size snapshot mismatch prints the entry",
					errors.join("").includes("fake-arduino-nano"),
					true,
				),
			];
		},
	);
};

const createRecordingProgressStream = ({ isTTY }) => {
	const writes = [];
	const write = (text) => {
		writes.push(text);
	};
	return { isTTY, writes, write };
};

const tickInterval = ({ interval, remainingTicks }) => {
	if (remainingTicks === 0) {
		return;
	}
	interval.callback(...interval.callbackArguments);
	tickInterval({ interval, remainingTicks: remainingTicks - 1 });
};

const createFakeTimers = () => {
	const scheduledIntervals = [];
	const clearedHandles = [];
	const setIntervalFake = (callback, delay, ...callbackArguments) => {
		scheduledIntervals.push({ callback, delay, callbackArguments });
		return scheduledIntervals.length;
	};
	const clearIntervalFake = (handle) => {
		clearedHandles.push(handle);
	};
	const tick = (count) => {
		const latestInterval = scheduledIntervals[scheduledIntervals.length - 1];
		tickInterval({ interval: latestInterval, remainingTicks: count });
	};
	return {
		timers: { setInterval: setIntervalFake, clearInterval: clearIntervalFake },
		scheduledIntervals,
		clearedHandles,
		tick,
	};
};

const checkCompileProgressTTYDetection = () => {
	return [
		expectEqual(
			"progress enables on a TTY without the opt-out",
			isCompileProgressEnabled({ stream: { isTTY: true }, environment: {} }),
			true,
		),
		expectEqual(
			"progress disables when stdout is not a TTY",
			isCompileProgressEnabled({ stream: { isTTY: false }, environment: {} }),
			false,
		),
		expectEqual(
			"progress disables when TTY support is unknown",
			isCompileProgressEnabled({ stream: {}, environment: {} }),
			false,
		),
		expectEqual(
			"progress disables with E95_NO_SPINNER",
			isCompileProgressEnabled({
				stream: { isTTY: true },
				environment: { [NO_SPINNER_ENVIRONMENT_KEY]: "1" },
			}),
			false,
		),
		expectEqual(
			"progress disables even with an empty E95_NO_SPINNER value",
			isCompileProgressEnabled({
				stream: { isTTY: true },
				environment: { [NO_SPINNER_ENVIRONMENT_KEY]: "" },
			}),
			false,
		),
	];
};

const checkCompileProgressFrameCycling = () => {
	const stream = createRecordingProgressStream({ isTTY: true });
	const fakeTimers = createFakeTimers();
	const progress = createCompileProgress({
		stream,
		environment: {},
		timers: fakeTimers.timers,
	});
	const label = "examples/arduino-nano/blink.test.e95";
	const name = "Blink";
	beginCompileProgressSection({
		progress,
		entries: [{ label, name }],
	});
	startCompileProgress({ progress, label });
	const tickCount = SPINNER_FRAMES.length * 2;
	fakeTimers.tick(tickCount);
	const expectedFrames = [SPINNER_FRAMES[0]];
	for (const frameIndex of Array.from({ length: tickCount }).keys()) {
		expectedFrames.push(
			SPINNER_FRAMES[(frameIndex + 1) % SPINNER_FRAMES.length],
		);
	}

	return [
		expectEqual(
			"progress draws one line per start and timer tick",
			stream.writes.length,
			expectedFrames.length,
		),
		expectEqual(
			"progress cycles the spinner frames in order",
			stream.writes.every((write, writeIndex) => {
				return write.endsWith(
					`${formatActiveProgressLine({
						frame: expectedFrames[writeIndex],
						name,
					})}\n`,
				);
			}),
			true,
		),
		expectEqual(
			"progress renders every line with the clear-line sequence",
			stream.writes.every((text) => {
				return text.includes(CLEAR_LINE_SEQUENCE);
			}),
			true,
		),
		expectEqual(
			"progress only moves the cursor up once the block exists",
			stream.writes[0].startsWith(CLEAR_LINE_SEQUENCE),
			true,
		),
		expectEqual(
			"progress redraws the block by moving the cursor up",
			stream.writes.slice(1).every((text) => {
				return text.startsWith("\u001b[1A");
			}),
			true,
		),
		expectEqual(
			"progress schedules a single spinner interval",
			fakeTimers.scheduledIntervals.length,
			1,
		),
		expectEqual(
			"progress uses the documented frame delay",
			fakeTimers.scheduledIntervals[0].delay,
			SPINNER_INTERVAL_MILLISECONDS,
		),
	];
};

const checkCompileProgressDisabledOutput = () => {
	const scenarios = [
		{
			label: "progress stays silent without a TTY",
			isTTY: false,
			environment: {},
		},
		{
			label: "progress stays silent with E95_NO_SPINNER",
			isTTY: true,
			environment: { [NO_SPINNER_ENVIRONMENT_KEY]: "1" },
		},
	];

	return scenarios.flatMap(({ label, isTTY, environment }) => {
		const stream = createRecordingProgressStream({ isTTY });
		const fakeTimers = createFakeTimers();
		const progress = createCompileProgress({
			stream,
			environment,
			timers: fakeTimers.timers,
		});
		const jobLabel = "examples/arduino-nano/blink.test.e95";
		beginCompileProgressSection({
			progress,
			entries: [{ label: jobLabel, name: "Blink" }],
		});
		startCompileProgress({ progress, label: jobLabel });
		finishCompileProgress({
			progress,
			label: jobLabel,
			text: `${GREEN_CHECK} Blink — 1.0s`,
		});
		commitCompileProgressSection(progress);

		return [
			expectEqual(`${label} (no writes)`, stream.writes.join(""), ""),
			expectEqual(
				`${label} (no interval)`,
				fakeTimers.scheduledIntervals.length,
				0,
			),
		];
	});
};

const lastProgressWrite = (stream) => {
	return stream.writes[stream.writes.length - 1] ?? "";
};

const checkCompileProgressParallelLines = () => {
	const stream = createRecordingProgressStream({ isTTY: true });
	const fakeTimers = createFakeTimers();
	const progress = createCompileProgress({
		stream,
		environment: {},
		timers: fakeTimers.timers,
	});
	const arrayLabel = "core/arduino-nano/array.test.e95";
	const blinkLabel = "core/arduino-nano/blink.test.e95";
	const clockLabel = "core/arduino-nano/clock.test.e95";
	beginCompileProgressSection({
		progress,
		entries: [
			{ label: arrayLabel, name: "Array" },
			{ label: blinkLabel, name: "Blink" },
			{ label: clockLabel, name: "Clock" },
		],
	});
	startCompileProgress({ progress, label: arrayLabel });
	startCompileProgress({ progress, label: clockLabel });
	const renderedBlock = lastProgressWrite(stream);

	return [
		expectEqual(
			"progress keeps a single interval for parallel jobs",
			fakeTimers.scheduledIntervals.length,
			1,
		),
		expectEqual(
			"progress shows one active line per running job",
			[
				formatActiveProgressLine({
					frame: SPINNER_FRAMES[1],
					name: "Array",
				}),
				formatActiveProgressLine({
					frame: SPINNER_FRAMES[1],
					name: "Clock",
				}),
			].every((line) => {
				return renderedBlock.includes(line);
			}),
			true,
		),
		expectEqual(
			"progress renders two terminal lines at once",
			renderedBlock.split(CLEAR_LINE_SEQUENCE).length - 1,
			2,
		),
		expectEqual(
			"progress hides the pending job until it starts",
			renderedBlock.includes("Blink"),
			false,
		),
		expectEqual(
			"progress leaves the middle job pending",
			progress.lines.find((line) => {
				return line.label === blinkLabel;
			}).status,
			"pending",
		),
	];
};

const checkCompileProgressTransitionsToFinalLine = () => {
	const stream = createRecordingProgressStream({ isTTY: true });
	const fakeTimers = createFakeTimers();
	const progress = createCompileProgress({
		stream,
		environment: {},
		timers: fakeTimers.timers,
	});
	const arrayLabel = "core/arduino-nano/array.test.e95";
	const blinkLabel = "core/arduino-nano/blink.test.e95";
	const finalLine = `${GREEN_CHECK} Array — 1.2s — Flash 10/20 (50.0%) | RAM 1/2 (50.0%)`;
	beginCompileProgressSection({
		progress,
		entries: [
			{ label: arrayLabel, name: "Array" },
			{ label: blinkLabel, name: "Blink" },
		],
	});
	startCompileProgress({ progress, label: arrayLabel });
	startCompileProgress({ progress, label: blinkLabel });
	finishCompileProgress({
		progress,
		label: arrayLabel,
		text: finalLine,
	});
	const renderedBlock = lastProgressWrite(stream);

	return [
		expectEqual(
			"progress replaces the active line with its final line",
			renderedBlock.includes(finalLine),
			true,
		),
		expectEqual(
			"progress stops spinning the finished job",
			renderedBlock.includes(
				formatActiveProgressLine({
					frame: SPINNER_FRAMES[0],
					name: "Array",
				}),
			),
			false,
		),
		expectEqual(
			"progress keeps the other job spinning",
			renderedBlock.includes(
				formatActiveProgressLine({
					frame: SPINNER_FRAMES[2],
					name: "Blink",
				}),
			),
			true,
		),
		expectEqual(
			"progress shows the finished line above the active one",
			renderedBlock.indexOf(finalLine) < renderedBlock.indexOf("Blink"),
			true,
		),
	];
};

const checkCompileProgressKeepsAlphabeticalSlots = () => {
	const stream = createRecordingProgressStream({ isTTY: true });
	const fakeTimers = createFakeTimers();
	const progress = createCompileProgress({
		stream,
		environment: {},
		timers: fakeTimers.timers,
	});
	const arrayLabel = "core/arduino-nano/array.test.e95";
	const clockLabel = "core/arduino-nano/clock.test.e95";
	beginCompileProgressSection({
		progress,
		entries: [
			{ label: arrayLabel, name: "Array" },
			{ label: clockLabel, name: "Clock" },
		],
	});
	startCompileProgress({ progress, label: clockLabel });
	startCompileProgress({ progress, label: arrayLabel });
	const renderedBlock = lastProgressWrite(stream);

	return [
		expectEqual(
			"progress assigns slots in alphabetical order regardless of start order",
			renderedBlock.indexOf("Array") < renderedBlock.indexOf("Clock"),
			true,
		),
	];
};

const checkCompileProgressCommitLeavesBlockAndStops = () => {
	const stream = createRecordingProgressStream({ isTTY: true });
	const fakeTimers = createFakeTimers();
	const progress = createCompileProgress({
		stream,
		environment: {},
		timers: fakeTimers.timers,
	});
	const arrayLabel = "core/arduino-nano/array.test.e95";
	const finalLine = `${GREEN_CHECK} Array — 1.2s`;
	beginCompileProgressSection({
		progress,
		entries: [{ label: arrayLabel, name: "Array" }],
	});
	startCompileProgress({ progress, label: arrayLabel });
	finishCompileProgress({
		progress,
		label: arrayLabel,
		text: finalLine,
	});
	const writeCountBeforeCommit = stream.writes.length;
	commitCompileProgressSection(progress);

	return [
		expectEqual(
			"progress commit keeps the finished block visible",
			lastProgressWrite(stream).includes(finalLine),
			true,
		),
		expectEqual(
			"progress commit redraws the final block once",
			stream.writes.length,
			writeCountBeforeCommit + 1,
		),
		expectEqual(
			"progress commit stops the spinner interval",
			fakeTimers.clearedHandles.length,
			1,
		),
		expectEqual(
			"progress commit forgets the section lines",
			progress.lines.length,
			0,
		),
		expectEqual(
			"progress commit resets the rendered line count",
			progress.renderedLineCount,
			0,
		),
	];
};

const ORDERED_JOB_ENTRY_FILES = [
	"clock.test.e95",
	"array.test.e95",
	"blink.test.e95",
];

const collectAlphabeticalOrderJobs = ({ platformName }) => {
	if (platformName !== "arduino-nano") {
		return [];
	}

	return ORDERED_JOB_ENTRY_FILES.map((entryFile) => {
		return {
			key: entryFile,
			label: `${CORE_CATEGORY_NAME}/${platformName}/${entryFile}`,
			platformName,
			entryFile,
			skipReason: null,
		};
	});
};

const runImmediateSizedJob = async () => {
	return { sizes: null };
};

const checkInteractiveCompileOrdersLinesAlphabetically = async () => {
	return withAsyncTemporaryDirectory(
		"embedito95-compile-interactive-",
		async (directory) => {
			const stream = createRecordingProgressStream({ isTTY: true });
			const result = await runTestCompile({
				environment: {},
				dependencies: {
					availableParallelism: availableParallelismFour,
					probePlatform: noSkipReason,
					collectPlatformJobs: collectAlphabeticalOrderJobs,
					runEntryCompileJob: runImmediateSizedJob,
					compileSizesSnapshotPath: join(directory, "compile-sizes.json"),
					progressStream: stream,
					writeOutput: writeNothing,
					writeError: writeNothing,
				},
			});
			const finalBlock = lastProgressWrite(stream);

			return [
				expectEqual(
					"interactive compile exits successfully",
					result.exitCode,
					0,
				),
				expectEqual(
					"interactive compile sorts the finished lines alphabetically",
					finalBlock.indexOf("Array") < finalBlock.indexOf("Blink") &&
						finalBlock.indexOf("Blink") < finalBlock.indexOf("Clock"),
					true,
				),
				expectEqual(
					"interactive compile finishes every line with a green check",
					finalBlock.split(GREEN_CHECK).length - 1,
					ORDERED_JOB_ENTRY_FILES.length,
				),
			];
		},
	);
};

const checkNonInteractiveCompileWritesNoAnsi = async () => {
	return withAsyncTemporaryDirectory(
		"embedito95-compile-non-interactive-",
		async (directory) => {
			const stream = createRecordingProgressStream({ isTTY: false });
			const output = [];
			const result = await runTestCompile({
				environment: {},
				dependencies: {
					availableParallelism: availableParallelismFour,
					probePlatform: noSkipReason,
					collectPlatformJobs: collectAlphabeticalOrderJobs,
					runEntryCompileJob: runImmediateSizedJob,
					compileSizesSnapshotPath: join(directory, "compile-sizes.json"),
					progressStream: stream,
					writeOutput: (text) => {
						output.push(text);
					},
					writeError: writeNothing,
				},
			});
			const reportText = output.join("");

			return [
				expectEqual(
					"non-interactive compile exits successfully",
					result.exitCode,
					0,
				),
				expectEqual(
					"non-interactive compile never writes spinner frames",
					stream.writes.length,
					0,
				),
				expectEqual(
					"non-interactive compile never writes spinner cursor sequences",
					reportText.includes("\u001b[1A") ||
						reportText.includes(CLEAR_LINE_SEQUENCE),
					false,
				),
				expectEqual(
					"non-interactive compile keeps the grouped report",
					reportText.includes("  core\n"),
					true,
				),
			];
		},
	);
};

const checkBuildEntryRunsAsynchronously = async () => {
	const events = [];
	const runProcess = async () => {
		await setTimeout(5);
		events.push("process-finished");
	};
	const buildPromise = buildEntry(
		"/fake-project",
		"arduino-nano",
		"blink.test.e95",
		runProcess,
	);
	events.push("call-returned");
	await buildPromise;
	const failingRunProcess = async () => {
		const error = new Error("spawn failed");
		error.stdout = "stdout text";
		error.stderr = "stderr text";
		throw error;
	};
	const captureFailure = async () => {
		try {
			await buildEntry(
				"/fake-project",
				"arduino-nano",
				"blink.test.e95",
				failingRunProcess,
			);
			return null;
		} catch (error) {
			return error.message;
		}
	};
	const failureMessage = await captureFailure();

	return [
		expectEqual(
			"buildEntry returns a promise instead of blocking",
			buildPromise instanceof Promise,
			true,
		),
		expectEqual(
			"buildEntry returns before the CLI process finishes",
			events.join(","),
			"call-returned,process-finished",
		),
		expectEqual(
			"buildEntry reports the failing platform and entry",
			failureMessage?.includes("Build failed for arduino-nano/blink.test.e95"),
			true,
		),
		expectEqual(
			"buildEntry forwards the CLI stderr",
			failureMessage?.includes("stderr text"),
			true,
		),
	];
};

export const runTestCompileChecks = async () => {
	const results = [
		...checkCompileProgressTTYDetection(),
		...checkCompileProgressFrameCycling(),
		...checkCompileProgressDisabledOutput(),
		...checkCompileProgressParallelLines(),
		...checkCompileProgressTransitionsToFinalLine(),
		...checkCompileProgressKeepsAlphabeticalSlots(),
		...checkCompileProgressCommitLeavesBlockAndStops(),
		...(await checkInteractiveCompileOrdersLinesAlphabetically()),
		...(await checkNonInteractiveCompileWritesNoAnsi()),
		...(await checkBuildEntryRunsAsynchronously()),
		...checkCompileConcurrencyResolution(),
		...checkStm32CompileBudgetResolution(),
		...checkStm32CompileJobCountOption(),
		...checkCompileFastParsing(),
		...checkCompileSnapshotUpdateParsing(),
		...(await checkPoolLimitsAndRunsEachJobOnce()),
		...(await checkPoolSerializesDuplicateKeys()),
		...(await checkOrchestrationUsesBoundedConcurrency()),
		...(await checkStm32OrchestrationRunsProjectsInParallel()),
		...checkSkipResolution(),
		...checkArtifactVerification(),
		...(await checkBrokenCppFixtureFails()),
		...(await checkSuccessfulHermeticCompile()),
		...checkCompileEntryCategories(),
		...checkCollectPlatformJobsUsesGeneratedEntries(),
		...checkPlatformTestExclusionsSkipUnsupportedEntries(),
		...(await checkCompileScopeDefaultsToFull()),
		...(await checkSerialStrategyDeclaresTimeDependency()),
		...checkStm32SerialCoversPlainIntLiterals(),
		...(await checkEntryPipelineGeneratesOwnProjectPerEntry()),
		...(await checkEntryGenerationFailureFailsTheJob()),
		...(await checkStm32EntryForwardsCompileBudget()),
		...(await checkSkippedPlatformExitsZero()),
		...checkCompileSizeParsing(),
		...checkCompileSizeFormatting(),
		...checkPlatformReportHierarchy(),
		...checkPlatformReportFailure(),
		...checkPlatformReportSkip(),
		...checkCompileSummaryOrdering(),
		...(await checkStm32CompileOutputIsSilenced()),
		...checkCompileSizesSnapshot(),
		...(await checkCompileSizesSnapshotLifecycle()),
		...(await checkEntryReportIncludesDurationAndSizes()),
		...(await checkSnapshotMismatchFailsRun()),
	];

	reportUnitChecks(TEST_COMPILE_UNIT_CHECKS_GROUP, results);
	return results;
};

const hasMismatch = (results) => {
	return results.some((result) => {
		return result.status === SNAPSHOT_STATUS.mismatch;
	});
};

if (isMainModule(import.meta.url)) {
	const results = await runTestCompileChecks();
	process.exitCode = hasMismatch(results) ? 1 : 0;
}
