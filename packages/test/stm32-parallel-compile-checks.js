// Checks for the bounded-concurrency STM32 compile scheduler (TICKET-85).
// The scheduler is exercised with an injected `shared`, so neither the unit
// checks nor the hermetic compile need the real ARM toolchain. A last check
// measures the real `stm32-blue-pill` build when the toolchain, the firmware
// cache and 4+ cores are available, and skips otherwise.
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { shared, UTF8 } from "embedito95-core";
import { platform } from "../registry/src/platforms/stm32-bluepill.js";
import { compile } from "../registry/src/strategies/stm32-ll/compile.js";
import {
	resolveCompileJobCount,
	runCompileJobs,
} from "../registry/src/strategies/stm32-ll/compile-jobs.js";
import {
	ARTIFACTS_DIRECTORY_NAME,
	STM32_COMPILE_JOBS_ENVIRONMENT_KEY,
} from "../registry/src/strategies/stm32-ll/constants.js";
import {
	REGISTRY_STM32_PARALLEL_COMPILE_UNIT_CHECKS_GROUP,
	SNAPSHOT_STATUS,
} from "./constants.js";
import { expectEqual, reportUnitChecks } from "./reporting.js";
import { PACKAGE_DIRECTORY } from "./runner-harness.js";

const HARDWARE_PARALLELISM_THRESHOLD = 4;
const TIMING_SPEEDUP_THRESHOLD = 1.5;
const SCHEDULER_JOB_COUNT = 12;
const SCHEDULER_MAXIMUM_JOBS = 3;
const SCHEDULER_JOB_DURATION_MILLISECONDS = 25;
const FAILING_JOB_INDEX = 3;
const FAILED_COMPILATION_MESSAGE = "Compilation failed:\nfake compiler error";
const HERMETIC_JOB_COUNT = 6;
const HERMETIC_MAXIMUM_JOBS = 3;
const HERMETIC_JOB_SLEEP_SECONDS = "0.3";
const FAKE_COMPILER_NAME = "arm-none-eabi-g++";
const FAKE_BINARY_COPY_TOOL_NAME = "arm-none-eabi-objcopy";
const FAKE_SIZE_TOOL_NAME = "arm-none-eabi-size";
const STRIP_TOOL_NAME = "arm-none-eabi-strip";
const FILE_EXECUTABLE_MODE = 0o755;
const FAKE_COMPILER_LOG_FILE_NAME = "compiler.log";
const FAKE_LINK_LOG_FILE_NAME = "link.log";
const HERMETIC_PROJECT_NAME = "hermetic-project";
const HERMETIC_STANDARD_ERROR_MESSAGE = "fake compiler error";
const FAKE_COMPILER_FAILURE_MODE_SUCCESS = "success";
const FAKE_COMPILER_FAILURE_MODE_STANDARD_ERROR = "standardError";
const FAKE_COMPILER_FAILURE_MODE_SILENT = "silent";
const SOURCE_FILE_NAME_PREFIX = "unit_";
const SOURCE_FILE_EXTENSION = ".cpp";
const OBJECT_FILE_EXTENSION = ".o";
const SOURCE_FILE_CONTENT = "int unit() { return 0; }\n";
const TIMING_PROJECT_NAME = "stm32-blue-pill";
const TEMPORARY_DIRECTORY_PREFIX = "embedito95-stm32-parallel-";
const STM32_TESTER_BUILD_DIRECTORY = join(
	PACKAGE_DIRECTORY,
	"testers",
	"stm32-blue-pill",
	"build",
	"stm32-blue-pill",
);

const createIndexedJobs = (count) => {
	const jobs = [];
	for (let jobIndex = 0; jobIndex < count; jobIndex += 1) {
		jobs.push({ index: jobIndex });
	}
	return jobs;
};

const createSourceFileName = (index) => {
	return `${SOURCE_FILE_NAME_PREFIX}${index}${SOURCE_FILE_EXTENSION}`;
};

const createObjectFileName = (index) => {
	return `${SOURCE_FILE_NAME_PREFIX}${index}${OBJECT_FILE_EXTENSION}`;
};

const createShellScript = (content) => {
	return `#!/bin/sh\n${content}`;
};

const writeExecutableScript = ({ filePath, content }) => {
	writeFileSync(filePath, content);
	chmodSync(filePath, FILE_EXECUTABLE_MODE);
};

const createFakeCompilerCompileLines = ({ failureMode }) => {
	if (failureMode === FAKE_COMPILER_FAILURE_MODE_STANDARD_ERROR) {
		return [`  echo "${HERMETIC_STANDARD_ERROR_MESSAGE}" >&2`, "  exit 1"];
	}
	if (failureMode === FAKE_COMPILER_FAILURE_MODE_SILENT) {
		return ["  exit 1"];
	}
	return [
		`sleep ${HERMETIC_JOB_SLEEP_SECONDS}`,
		'  echo "end $$" >> "$logFile"',
	];
};

const createFakeCompilerScript = ({
	logPath,
	linkLogPath,
	failureMode = FAKE_COMPILER_FAILURE_MODE_SUCCESS,
}) => {
	return createShellScript(
		[
			`logFile="${logPath}"`,
			`linkLogFile="${linkLogPath}"`,
			'objectFile=""',
			'previousArgument=""',
			'isCompile=""',
			'for argument in "$@"; do',
			'  if [ "$previousArgument" = "-o" ]; then',
			'    objectFile="$argument"',
			"  fi",
			'  if [ "$argument" = "-c" ]; then',
			'    isCompile="1"',
			"  fi",
			'  previousArgument="$argument"',
			"done",
			'if [ -n "$isCompile" ]; then',
			'  echo "start $$" >> "$logFile"',
			...createFakeCompilerCompileLines({ failureMode }),
			"else",
			'  echo "$@" >> "$linkLogFile"',
			"fi",
			': > "$objectFile"',
			"exit 0",
		].join("\n"),
	);
};

const createFakeBinaryCopyScript = () => {
	return createShellScript(
		[
			'outputFile=""',
			'for argument in "$@"; do',
			'  outputFile="$argument"',
			"done",
			': > "$outputFile"',
			"exit 0",
		].join("\n"),
	);
};

const createFakeSizeScript = () => {
	return createShellScript("exit 0");
};

const createFakeShared = ({ toolchainDirectory, firmwareDirectory }) => {
	return {
		STM32_FW_CACHE: firmwareDirectory,
		ARM_COMPILER_EXECUTABLE: shared.ARM_COMPILER_EXECUTABLE,
		ARM_OBJCOPY_EXECUTABLE: shared.ARM_OBJCOPY_EXECUTABLE,
		ARM_SIZE_EXECUTABLE: shared.ARM_SIZE_EXECUTABLE,
		renderCyclesDefineArgument: shared.renderCyclesDefineArgument,
		findStm32FirmwareCache: () => {
			return firmwareDirectory;
		},
		findStm32Toolchain: () => {
			return toolchainDirectory;
		},
		runSpawnedProcess: shared.runSpawnedProcess,
	};
};

const runTrackedJob = async ({ job, context }) => {
	context.inFlight += 1;
	context.maximumInFlight = Math.max(context.maximumInFlight, context.inFlight);
	context.startedJobIndices.push(job.index);
	await setTimeout(context.jobDurationMilliseconds);
	context.inFlight -= 1;
};

const runFailingJob = async ({ job, context }) => {
	context.inFlight += 1;
	context.maximumInFlight = Math.max(context.maximumInFlight, context.inFlight);
	context.startedJobIndices.push(job.index);
	try {
		if (job.index === context.failingJobIndex) {
			throw new Error(context.failureMessage);
		}
		await setTimeout(context.jobDurationMilliseconds);
	} finally {
		context.inFlight -= 1;
		context.finishedJobIndices.push(job.index);
	}
};

const checkCompileJobCountResolution = () => {
	const cases = [
		{
			label: "compile jobs default follows available parallelism",
			environment: {},
			parallelism: 4,
			expected: 4,
		},
		{
			label: "compile jobs default is capped at 8",
			environment: {},
			parallelism: 32,
			expected: 8,
		},
		{
			label: "compile jobs default is at least 1",
			environment: {},
			parallelism: 0,
			expected: 1,
		},
		{
			label: "compile jobs accepts an explicit integer",
			environment: { [STM32_COMPILE_JOBS_ENVIRONMENT_KEY]: "3" },
			parallelism: 10,
			expected: 3,
		},
		{
			label: "compile jobs override is not capped",
			environment: { [STM32_COMPILE_JOBS_ENVIRONMENT_KEY]: "12" },
			parallelism: 4,
			expected: 12,
		},
		{
			label: "compile jobs rejects zero",
			environment: { [STM32_COMPILE_JOBS_ENVIRONMENT_KEY]: "0" },
			parallelism: 4,
			expected: 4,
		},
		{
			label: "compile jobs rejects negative values",
			environment: { [STM32_COMPILE_JOBS_ENVIRONMENT_KEY]: "-2" },
			parallelism: 4,
			expected: 4,
		},
		{
			label: "compile jobs rejects non numeric values",
			environment: { [STM32_COMPILE_JOBS_ENVIRONMENT_KEY]: "many" },
			parallelism: 4,
			expected: 4,
		},
		{
			label: "compile jobs rejects fractional values",
			environment: { [STM32_COMPILE_JOBS_ENVIRONMENT_KEY]: "2.5" },
			parallelism: 4,
			expected: 4,
		},
	];

	return cases.map(({ label, environment, parallelism, expected }) => {
		return expectEqual(
			label,
			resolveCompileJobCount({ environment, parallelism }),
			expected,
		);
	});
};

const checkSchedulerRespectsLimitAndRunsEachJobOnce = async () => {
	const jobs = createIndexedJobs(SCHEDULER_JOB_COUNT);
	const context = {
		inFlight: 0,
		maximumInFlight: 0,
		startedJobIndices: [],
		jobDurationMilliseconds: SCHEDULER_JOB_DURATION_MILLISECONDS,
	};

	await runCompileJobs({
		jobs,
		maximumJobs: SCHEDULER_MAXIMUM_JOBS,
		runCompileJob: runTrackedJob,
		context,
	});

	const compiledOnce =
		new Set(context.startedJobIndices).size === SCHEDULER_JOB_COUNT &&
		context.startedJobIndices.length === SCHEDULER_JOB_COUNT;

	return [
		expectEqual("scheduler runs every job exactly once", compiledOnce, true),
		expectEqual(
			"scheduler keeps more than one compilation in flight",
			context.maximumInFlight > 1,
			true,
		),
		expectEqual(
			"scheduler never exceeds the job limit",
			context.maximumInFlight <= SCHEDULER_MAXIMUM_JOBS,
			true,
		),
	];
};

const captureSchedulerFailureMessage = async ({ jobs, context }) => {
	try {
		await runCompileJobs({
			jobs,
			maximumJobs: SCHEDULER_MAXIMUM_JOBS,
			runCompileJob: runFailingJob,
			context,
		});
		return null;
	} catch (error) {
		return error.message;
	}
};

const checkSchedulerHandlesEmptyAndSingleJob = async () => {
	const emptyContext = {
		inFlight: 0,
		maximumInFlight: 0,
		startedJobIndices: [],
		jobDurationMilliseconds: SCHEDULER_JOB_DURATION_MILLISECONDS,
	};
	await runCompileJobs({
		jobs: [],
		maximumJobs: SCHEDULER_MAXIMUM_JOBS,
		runCompileJob: runTrackedJob,
		context: emptyContext,
	});

	const singleContext = {
		inFlight: 0,
		maximumInFlight: 0,
		startedJobIndices: [],
		jobDurationMilliseconds: SCHEDULER_JOB_DURATION_MILLISECONDS,
	};
	await runCompileJobs({
		jobs: createIndexedJobs(1),
		maximumJobs: SCHEDULER_MAXIMUM_JOBS,
		runCompileJob: runTrackedJob,
		context: singleContext,
	});

	return [
		expectEqual(
			"scheduler accepts an empty job list",
			emptyContext.startedJobIndices.length,
			0,
		),
		expectEqual(
			"scheduler compiles a single job once",
			singleContext.startedJobIndices.length,
			1,
		),
		expectEqual(
			"scheduler never exceeds the job count",
			singleContext.maximumInFlight,
			1,
		),
	];
};

const checkSchedulerFailsFast = async () => {
	const jobs = createIndexedJobs(SCHEDULER_JOB_COUNT);
	const context = {
		inFlight: 0,
		maximumInFlight: 0,
		startedJobIndices: [],
		finishedJobIndices: [],
		failingJobIndex: FAILING_JOB_INDEX,
		failureMessage: FAILED_COMPILATION_MESSAGE,
		jobDurationMilliseconds: SCHEDULER_JOB_DURATION_MILLISECONDS,
	};
	const thrownMessage = await captureSchedulerFailureMessage({ jobs, context });

	return [
		expectEqual(
			"scheduler rethrows the original compilation error message",
			thrownMessage,
			FAILED_COMPILATION_MESSAGE,
		),
		expectEqual(
			"scheduler stops launching jobs after the first failure",
			context.startedJobIndices.length < SCHEDULER_JOB_COUNT,
			true,
		),
		expectEqual(
			"scheduler waits for every in-flight job after the failure",
			context.inFlight,
			0,
		),
		expectEqual(
			"scheduler settles every started job before rejecting",
			context.finishedJobIndices.slice().sort().join(","),
			context.startedJobIndices.slice().sort().join(","),
		),
	];
};

const readMaximumConcurrency = (logPath) => {
	const activeProcessIds = new Set();
	const lines = readFileSync(logPath, UTF8).split("\n");

	return lines.reduce((maximum, line) => {
		const [eventName, processId] = line.split(" ");
		if (eventName === "start") {
			activeProcessIds.add(processId);
		}
		if (eventName === "end") {
			activeProcessIds.delete(processId);
		}
		return Math.max(maximum, activeProcessIds.size);
	}, 0);
};

const countCompilationStarts = (logPath) => {
	return readFileSync(logPath, UTF8)
		.split("\n")
		.filter((line) => {
			return line.startsWith("start ");
		}).length;
};

const readLinkedObjectPaths = (linkLogPath) => {
	return readFileSync(linkLogPath, UTF8)
		.split(" ")
		.filter((argument) => {
			return argument.endsWith(".o");
		});
};

const withRestoredVariable = async ({ name, value, callback }) => {
	const previousValue = process.env[name];
	process.env[name] = value;
	try {
		return await callback();
	} finally {
		if (previousValue === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = previousValue;
		}
	}
};

const createHermeticEnvironment = ({
	temporaryDirectory,
	jobCount,
	failureMode,
}) => {
	const toolchainDirectory = join(temporaryDirectory, "toolchain");
	const firmwareDirectory = join(temporaryDirectory, "firmware");
	const outputDirectory = join(temporaryDirectory, "project");
	const compilerLogPath = join(temporaryDirectory, FAKE_COMPILER_LOG_FILE_NAME);
	const linkLogPath = join(temporaryDirectory, FAKE_LINK_LOG_FILE_NAME);

	mkdirSync(toolchainDirectory, { recursive: true });
	mkdirSync(firmwareDirectory, { recursive: true });
	mkdirSync(outputDirectory, { recursive: true });

	writeExecutableScript({
		filePath: join(toolchainDirectory, FAKE_COMPILER_NAME),
		content: createFakeCompilerScript({
			logPath: compilerLogPath,
			linkLogPath,
			failureMode,
		}),
	});
	writeExecutableScript({
		filePath: join(toolchainDirectory, FAKE_BINARY_COPY_TOOL_NAME),
		content: createFakeBinaryCopyScript(),
	});
	writeExecutableScript({
		filePath: join(toolchainDirectory, FAKE_SIZE_TOOL_NAME),
		content: createFakeSizeScript(),
	});

	const jobs = createIndexedJobs(jobCount);
	for (const { index } of jobs) {
		writeFileSync(
			join(outputDirectory, createSourceFileName(index)),
			SOURCE_FILE_CONTENT,
		);
	}

	return {
		toolchainDirectory,
		firmwareDirectory,
		outputDirectory,
		compilerLogPath,
		linkLogPath,
		jobs,
	};
};

const runHermeticCompile = async ({
	outputDirectory,
	toolchainDirectory,
	firmwareDirectory,
}) => {
	await withRestoredVariable({
		name: STM32_COMPILE_JOBS_ENVIRONMENT_KEY,
		value: String(HERMETIC_MAXIMUM_JOBS),
		callback: () => {
			return compile({
				outputDir: outputDirectory,
				projectName: HERMETIC_PROJECT_NAME,
				shared: createFakeShared({ toolchainDirectory, firmwareDirectory }),
			});
		},
	});
};

const captureHermeticCompileFailure = async (environment) => {
	try {
		await runHermeticCompile(environment);
		return null;
	} catch (error) {
		return error.message;
	}
};

const runHermeticCompileScenario = async (temporaryDirectory) => {
	const environment = createHermeticEnvironment({
		temporaryDirectory,
		jobCount: HERMETIC_JOB_COUNT,
		failureMode: FAKE_COMPILER_FAILURE_MODE_SUCCESS,
	});
	const { outputDirectory, compilerLogPath, linkLogPath, jobs } = environment;

	await runHermeticCompile(environment);

	const artifactsDirectory = join(outputDirectory, ARTIFACTS_DIRECTORY_NAME);
	const objectFiles = jobs.map(({ index }) => {
		return join(artifactsDirectory, createObjectFileName(index));
	});
	const maximumConcurrency = readMaximumConcurrency(compilerLogPath);

	return [
		expectEqual(
			"hermetic compile runs more than one compilation at a time",
			maximumConcurrency > 1,
			true,
		),
		expectEqual(
			"hermetic compile never exceeds the configured limit",
			maximumConcurrency <= HERMETIC_MAXIMUM_JOBS,
			true,
		),
		expectEqual(
			"hermetic compile launches every source exactly once",
			countCompilationStarts(compilerLogPath),
			HERMETIC_JOB_COUNT,
		),
		expectEqual(
			"hermetic compile writes one object per source",
			objectFiles.every((objectFile) => {
				return existsSync(objectFile);
			}),
			true,
		),
		expectEqual(
			"hermetic compile links objects in source order",
			readLinkedObjectPaths(linkLogPath).join("\n"),
			objectFiles.join("\n"),
		),
		expectEqual(
			"hermetic compile writes the elf and the binary",
			existsSync(join(artifactsDirectory, `${HERMETIC_PROJECT_NAME}.elf`)) &&
				existsSync(join(artifactsDirectory, `${HERMETIC_PROJECT_NAME}.bin`)),
			true,
		),
	];
};

const runHermeticStandardErrorScenario = async (temporaryDirectory) => {
	const environment = createHermeticEnvironment({
		temporaryDirectory,
		jobCount: HERMETIC_JOB_COUNT,
		failureMode: FAKE_COMPILER_FAILURE_MODE_STANDARD_ERROR,
	});
	const failureMessage = await captureHermeticCompileFailure(environment);

	return [
		expectEqual(
			"hermetic compile reports the compiler standard error",
			failureMessage,
			FAILED_COMPILATION_MESSAGE,
		),
		expectEqual(
			"hermetic compile stops launching new compilations after the first failure",
			countCompilationStarts(environment.compilerLogPath),
			HERMETIC_MAXIMUM_JOBS,
		),
		expectEqual(
			"hermetic compile does not link after a compilation failure",
			existsSync(environment.linkLogPath),
			false,
		),
	];
};

const runHermeticSourceFallbackScenario = async (temporaryDirectory) => {
	const environment = createHermeticEnvironment({
		temporaryDirectory,
		jobCount: 1,
		failureMode: FAKE_COMPILER_FAILURE_MODE_SILENT,
	});
	const failureMessage = await captureHermeticCompileFailure(environment);
	const sourceFile = join(environment.outputDirectory, createSourceFileName(0));

	return [
		expectEqual(
			"hermetic compile falls back to the source file without compiler output",
			failureMessage,
			`Compilation failed for ${sourceFile}`,
		),
	];
};

const checkHermeticCompile = async () => {
	if (process.platform === "win32") {
		return [expectEqual("hermetic compile skipped on Windows", true, true)];
	}

	const temporaryDirectory = mkdtempSync(
		join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX),
	);
	try {
		return [
			...(await runHermeticCompileScenario(
				join(temporaryDirectory, "success"),
			)),
			...(await runHermeticStandardErrorScenario(
				join(temporaryDirectory, "standard-error"),
			)),
			...(await runHermeticSourceFallbackScenario(
				join(temporaryDirectory, "fallback"),
			)),
		];
	} catch (error) {
		return [
			expectEqual(
				"hermetic compile completes without an error",
				error.message,
				"no error",
			),
		];
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
};

const measureCompile = async ({ outputDirectory, jobs }) => {
	const start = performance.now();
	await withRestoredVariable({
		name: STM32_COMPILE_JOBS_ENVIRONMENT_KEY,
		value: String(jobs),
		callback: () => {
			return compile({
				outputDir: outputDirectory,
				projectName: TIMING_PROJECT_NAME,
				platform,
				shared,
			});
		},
	});
	return performance.now() - start;
};

const prepareCompileCopy = ({ temporaryDirectory, copyName }) => {
	const outputDirectory = join(temporaryDirectory, copyName);
	cpSync(STM32_TESTER_BUILD_DIRECTORY, outputDirectory, { recursive: true });
	return outputDirectory;
};

const readArtifactSignature = ({ outputDirectory, toolchainDirectory }) => {
	const artifactsDirectory = join(outputDirectory, ARTIFACTS_DIRECTORY_NAME);
	const elfPath = join(artifactsDirectory, `${TIMING_PROJECT_NAME}.elf`);
	// The linker embeds random temporary object names in `.strtab`, so even two
	// sequential builds differ byte for byte. Stripping the symbol tables keeps
	// the comparison focused on the emitted code and data.
	execFileSync(join(toolchainDirectory, STRIP_TOOL_NAME), [
		"--strip-all",
		elfPath,
	]);
	return [
		readFileSync(elfPath).toString("base64"),
		readFileSync(
			join(artifactsDirectory, `${TIMING_PROJECT_NAME}.bin`),
		).toString("base64"),
	].join(":");
};

const runTimingScenario = async (temporaryDirectory) => {
	const sequentialDirectory = prepareCompileCopy({
		temporaryDirectory,
		copyName: "sequential",
	});
	const parallelDirectory = prepareCompileCopy({
		temporaryDirectory,
		copyName: "parallel",
	});
	const sequentialMilliseconds = await measureCompile({
		outputDirectory: sequentialDirectory,
		jobs: 1,
	});
	const parallelMilliseconds = await measureCompile({
		outputDirectory: parallelDirectory,
		jobs: resolveCompileJobCount(),
	});
	const speedup = sequentialMilliseconds / parallelMilliseconds;
	const toolchainDirectory = shared.findStm32Toolchain();

	process.stdout.write(
		`  timing: sequential ${sequentialMilliseconds.toFixed(0)}ms, parallel ${parallelMilliseconds.toFixed(0)}ms, speedup ${speedup.toFixed(2)}x\n`,
	);

	return [
		expectEqual(
			"parallel STM32 compile is at least 1.5x faster than sequential",
			speedup >= TIMING_SPEEDUP_THRESHOLD,
			true,
		),
		expectEqual(
			"parallel STM32 compile produces the same elf and bin as sequential",
			readArtifactSignature({
				outputDirectory: parallelDirectory,
				toolchainDirectory,
			}),
			readArtifactSignature({
				outputDirectory: sequentialDirectory,
				toolchainDirectory,
			}),
		),
	];
};

const checkTimingImprovement = async () => {
	const hardwareParallelism = availableParallelism();
	const toolchainAvailable =
		shared.findStm32Toolchain() !== null &&
		shared.findStm32FirmwareCache() !== null;

	if (
		!toolchainAvailable ||
		hardwareParallelism < HARDWARE_PARALLELISM_THRESHOLD ||
		!existsSync(STM32_TESTER_BUILD_DIRECTORY)
	) {
		process.stdout.write(
			`  SKIP parallel compile timing: toolchain=${toolchainAvailable}, cores=${hardwareParallelism}, testerBuild=${existsSync(STM32_TESTER_BUILD_DIRECTORY)}\n`,
		);
		return [
			expectEqual(
				"parallel STM32 compile timing skipped without toolchain or 4+ cores",
				true,
				true,
			),
		];
	}

	const temporaryDirectory = mkdtempSync(
		join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX),
	);
	try {
		return await runTimingScenario(temporaryDirectory);
	} catch (error) {
		return [
			expectEqual(
				"parallel STM32 compile timing completes without an error",
				error.message,
				"no error",
			),
		];
	} finally {
		rmSync(temporaryDirectory, { recursive: true, force: true });
	}
};

export const runStm32ParallelCompileChecks = async () => {
	return [
		...checkCompileJobCountResolution(),
		...(await checkSchedulerRespectsLimitAndRunsEachJobOnce()),
		...(await checkSchedulerHandlesEmptyAndSingleJob()),
		...(await checkSchedulerFailsFast()),
		...(await checkHermeticCompile()),
		...(await checkTimingImprovement()),
	];
};

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
	const results = await runStm32ParallelCompileChecks();
	reportUnitChecks(REGISTRY_STM32_PARALLEL_COMPILE_UNIT_CHECKS_GROUP, results);
	const hasMismatch = results.some((result) => {
		return result.status === SNAPSHOT_STATUS.mismatch;
	});
	if (hasMismatch) {
		process.exitCode = 1;
	}
}
