// Opt-in scheduler bench (`pnpm run test:bench`). It is NOT part of `test`,
// `test:run`, `test:full` or the snapshot suite: it measures the generated
// async event loop with host instrumentation that never reaches production
// codegen or the snapshots.
//
// Usage:
//   node codegen-bench/run.js [--label baseline] [--passes 20000] [--json out.json]
//   node codegen-bench/run.js --avr [--label baseline] [--json out.json]
//   node codegen-bench/run.js --compare before.json after.json
//
// Host mode runs the scenario with `fade`, `blink` and extra coroutines doing
// real child awaits (scalar and object payloads) and reports per-pass time,
// slot visits/dispatches per pass, allocations/frees and wake latency (passes
// late). Time is measured in nanoseconds and printed in microseconds; each run
// discards a warm-up window and is repeated so median/p95 come from a real
// sample set. `--passes N` means N complete passes (no off-by-one). The host
// clock is simulated (one pass = one millisecond) so the wake latency is
// deterministic and comparable. `--avr` instead compiles the same scenario with `arduino-cli`
// for `arduino:avr:nano` and reports flash/RAM (compile only: it does not
// execute on hardware).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UTF8 } from "embedito95-core";
import { compileArduinoSketch } from "../compile-check-compilers.js";
import { ARDUINO_CLI_COMMAND } from "../constants.js";
import { withTemporaryDirectoryAsync } from "../runner-harness.js";
import {
	collectHostFixture,
	compileHostBench,
	instrumentHostFixture,
	prepareBenchProject,
} from "./bench-build.js";
import {
	buildBenchDriverSource,
	MAXIMUM_PASS_SAMPLES,
} from "./driver-source.js";
import {
	buildAvrBenchMetrics,
	buildHostBenchMetrics,
	formatBenchReport,
	formatComparison,
	validateComparableResults,
	validatePassCount,
} from "./metrics.js";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SCENARIO_FILE_NAME = "fade-blink.e95";
const SCENARIO_NAME = "fade-blink";
const PLATFORM_NAME = "arduino-nano";
const DEFAULT_LABEL = "baseline";
const DEFAULT_PASSES = 20000;
const MINIMUM_PASSES = 10;
// Steady-state settings: each repetition is a fresh process, and its first
// passes are discarded as warm-up. The metrics aggregate the measured samples.
const DEFAULT_WARM_UP_PASSES = 2000;
const DEFAULT_REPETITIONS = 5;
const TEMP_DIRECTORY_PREFIX = "embedito95-bench-";
const DRIVER_FILE_NAME = "bench.driver.cpp";
const BINARY_FILE_NAME = "bench.bin";
const AVR_PROJECT_DIRECTORY_NAME = "avr-project";
const AVR_ARTIFACTS_DIRECTORY_NAME = "avr-artifacts";

const HELP_TEXT = `Embedito95 async scheduler bench (opt-in)

Usage:
  node codegen-bench/run.js [--label <name>] [--passes <n>] [--json <path>]
  node codegen-bench/run.js --avr [--label <name>] [--json <path>]
  node codegen-bench/run.js --compare <before.json> <after.json>

Options:
  --label <name>      Label stored with the results (default: ${DEFAULT_LABEL}).
  --passes <n>        Complete event-loop passes per repetition (default: ${DEFAULT_PASSES}; max: ${MAXIMUM_PASS_SAMPLES}; one pass is one simulated ms).
                      Each run discards ${DEFAULT_WARM_UP_PASSES} warm-up passes and is repeated ${DEFAULT_REPETITIONS} times.
  --json <path>       Write the result as JSON for a later --compare.
  --avr               Compile for arduino:avr:nano and report flash/RAM (no execution).
  --compare <a> <b>   Print the metric diff between two result JSON files.
  --help              Show this help.

Host mode is the default. The bench is never part of pnpm test/test:run/test:full.`;

const parseInteger = (text, fallback) => {
	const parsed = Number(text);
	return Number.isInteger(parsed) ? parsed : fallback;
};

const readComparisonArguments = (argumentsList, startIndex) => {
	const leftPath = argumentsList[startIndex + 1];
	const rightPath = argumentsList[startIndex + 2];
	if (!leftPath || !rightPath) {
		throw new Error("--compare needs two JSON paths");
	}
	return { leftPath, rightPath, nextIndex: startIndex + 2 };
};

const parseArguments = (argumentsList) => {
	const options = {
		label: DEFAULT_LABEL,
		durationPasses: DEFAULT_PASSES,
		jsonPath: null,
		compare: null,
		avr: false,
		help: false,
	};
	let index = 0;
	while (index < argumentsList.length) {
		const argument = argumentsList[index];
		if (argument === "--label") {
			options.label = argumentsList[index + 1] ?? options.label;
			index += 2;
		} else if (argument === "--passes") {
			options.durationPasses = parseInteger(
				argumentsList[index + 1],
				options.durationPasses,
			);
			index += 2;
		} else if (argument === "--json") {
			options.jsonPath = argumentsList[index + 1] ?? null;
			index += 2;
		} else if (argument === "--avr") {
			options.avr = true;
			index += 1;
		} else if (argument === "--compare") {
			const comparison = readComparisonArguments(argumentsList, index);
			options.compare = comparison;
			index = comparison.nextIndex + 1;
		} else if (argument === "--help") {
			options.help = true;
			index += 1;
		} else {
			throw new Error(`unknown argument "${argument}" (try --help)`);
		}
	}
	if (options.durationPasses < MINIMUM_PASSES) {
		throw new Error(`--passes must be at least ${MINIMUM_PASSES}`);
	}
	validatePassCount(options.durationPasses);
	return options;
};

const readJsonResult = (filePath) => {
	return JSON.parse(readFileSync(filePath, UTF8));
};

const writeJsonResult = (filePath, result) => {
	mkdirSync(dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(result, null, "\t")}\n`, UTF8);
};

const runHostBenchmark = async ({ label, durationPasses }) => {
	const warmUpPasses = Math.min(
		DEFAULT_WARM_UP_PASSES,
		Math.floor(durationPasses / 4),
	);
	return await withTemporaryDirectoryAsync(
		TEMP_DIRECTORY_PREFIX,
		async (temporaryDirectory) => {
			const { projectDirectory, buildDirectory } = await prepareBenchProject({
				temporaryDirectory,
				scenarioPath: join(MODULE_DIRECTORY, SCENARIO_FILE_NAME),
			});
			const fixture = collectHostFixture(projectDirectory, buildDirectory);
			instrumentHostFixture(fixture);
			const driverPath = join(temporaryDirectory, DRIVER_FILE_NAME);
			const binaryPath = join(temporaryDirectory, BINARY_FILE_NAME);
			writeFileSync(
				driverPath,
				buildBenchDriverSource({ durationPasses, warmUpPasses }),
				UTF8,
			);
			compileHostBench({ fixture, driverPath, binary: binaryPath });
			const outputs = [];
			for (let repetition = 0; repetition < DEFAULT_REPETITIONS; repetition++) {
				outputs.push(
					execFileSync(binaryPath, [], {
						encoding: UTF8,
						stdio: ["ignore", "pipe", "pipe"],
					}),
				);
			}
			return buildHostBenchMetrics({
				label,
				scenario: SCENARIO_NAME,
				durationPasses,
				warmUpPasses,
				repetitions: DEFAULT_REPETITIONS,
				outputs,
			});
		},
	);
};

const readToolchainVersion = () => {
	try {
		return execFileSync(ARDUINO_CLI_COMMAND, ["version"], {
			encoding: UTF8,
			stdio: ["ignore", "pipe", "pipe"],
		})
			.split("\n")[0]
			.trim();
	} catch {
		return "arduino-cli (version unavailable)";
	}
};

const runAvrBenchmark = async ({ label }) => {
	return await withTemporaryDirectoryAsync(
		TEMP_DIRECTORY_PREFIX,
		async (temporaryDirectory) => {
			const { buildDirectory } = await prepareBenchProject({
				temporaryDirectory,
				scenarioPath: join(MODULE_DIRECTORY, SCENARIO_FILE_NAME),
				directoryName: AVR_PROJECT_DIRECTORY_NAME,
			});
			const sizes = await compileArduinoSketch({
				outputDirectory: buildDirectory,
				artifactsDirectory: join(
					temporaryDirectory,
					AVR_ARTIFACTS_DIRECTORY_NAME,
				),
				platformName: PLATFORM_NAME,
			});
			if (!sizes) {
				throw new Error("arduino-cli did not report flash/RAM sizes");
			}
			return buildAvrBenchMetrics({
				label,
				platform: PLATFORM_NAME,
				fqbn: "arduino:avr:nano",
				toolchain: readToolchainVersion(),
				sizes,
			});
		},
	);
};

const runComparison = ({ leftPath, rightPath }) => {
	const leftResult = readJsonResult(leftPath);
	const rightResult = readJsonResult(rightPath);
	validateComparableResults(leftResult, rightResult);
	console.log(formatComparison(leftResult, rightResult));
};

const emitResult = (result, jsonPath) => {
	console.log(formatBenchReport(result));
	if (jsonPath) {
		writeJsonResult(jsonPath, result);
		console.log(`\nresult written to ${jsonPath}`);
	}
};

const main = async () => {
	const options = parseArguments(process.argv.slice(2));
	if (options.help) {
		console.log(HELP_TEXT);
		return;
	}
	if (options.compare) {
		runComparison(options.compare);
		return;
	}
	const result = options.avr
		? await runAvrBenchmark(options)
		: await runHostBenchmark(options);
	emitResult(result, options.jsonPath);
};

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
