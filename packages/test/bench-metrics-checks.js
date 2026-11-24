// Unit checks for the opt-in scheduler bench helpers. They pin the metrics
// format, the JSON comparison validation and the test-only source
// instrumentation without running the bench (it stays out of `pnpm test`,
// `test:run` and `test:full`).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, parse, shared, tokenize } from "embedito95-core";
import {
	buildBenchDriverSource,
	MAXIMUM_PASS_SAMPLES,
} from "./codegen-bench/driver-source.js";
import {
	instrumentSchedulerSource,
	instrumentSleepChecks,
	PASS_HOOK_CALL,
} from "./codegen-bench/instrumentation.js";
import {
	buildHostBenchMetrics,
	compareMetricResults,
	formatComparison,
	parseBenchOutput,
	validateComparableResults,
	validatePassCount,
} from "./codegen-bench/metrics.js";
import { expectEqual } from "./reporting.js";

const SCHEDULER_SOURCE = `void _asyncEventLoop(core_object::Object<_AsyncHandlers> handlers) {
	i32 subsetOffset = 0;
	while (true) {
		i32 index = subsetOffset;
		const u16 limit = TASK_QUEUE.length();
		while (index < (i32)(limit)) {
			core_object::Object<_AsyncTaskItem> item = TASK_QUEUE[index];
			if ((item->status == _AsyncTaskStatus::RUNNING)) {
				switch (item->type) {
					default:
						break;
				}
			}
			index = index + (i32)(2);
		}
		index = limit;
		const u16 catchUpLimit = TASK_QUEUE.length();
		while (index < (i32)(catchUpLimit)) {
			core_object::Object<_AsyncTaskItem> item = TASK_QUEUE[index];
			if ((item->status == _AsyncTaskStatus::RUNNING)) {
				switch (item->type) {
					default:
						break;
				}
			}
			index = index + (i32)(1);
		}
		iterationsSinceCompact = iterationsSinceCompact + (i32)(1);
		if (iterationsSinceCompact >= (i32)(5)) {
			iterationsSinceCompact = 0;
			index = 0;
			u16 writeIndex = 0;
			while (index < (i32)(TASK_QUEUE.length())) {
				core_object::Object<_AsyncTaskItem> current = TASK_QUEUE[index];
				TASK_QUEUE[writeIndex] = current;
				writeIndex += 1;
				index = index + (i32)(1);
			}
			TASK_QUEUE.truncate(writeIndex);
		}
		if (TASK_QUEUE.length() <= (u16)(2)) {
			u16 idleIndex = 0;
			u8 idleConsumedCount = 0;
			while (idleIndex < TASK_QUEUE.length()) {
				if ((TASK_QUEUE[idleIndex].status == _AsyncTaskStatus::CONSUMED)) {
					idleConsumedCount += 1;
				}
				idleIndex += 1;
			}
			if (idleConsumedCount == TASK_QUEUE.length()) {
				return;
			}
		}
	}
}`;

const BENCH_OUTPUT = [
	"bench passes 100",
	"bench warmup_passes 4",
	"bench clock CLOCK_UPTIME_RAW",
	"bench clock_resolution_nanoseconds 1",
	"bench wall_nanoseconds 5000000",
	"bench visit_count 300",
	"bench visit_maximum 4",
	"bench dispatch_count 120",
	"bench dispatch_maximum 2",
	"bench compaction_count 20",
	"bench compaction_visit_count 80",
	"bench allocation_count 9",
	"bench free_count 6",
	"bench live_blocks 3",
	"bench wake_count 2",
	"bench pass_sample_nanoseconds 20000",
	"bench pass_sample_nanoseconds 40000",
	"bench latency_histogram 1 1",
	"bench latency_histogram 2 1",
].join("\n");

const IDLE_SCAN_ONLY_SOURCE = `void _asyncEventLoop(core_object::Object<_AsyncHandlers> handlers) {
	while (true) {
		if (TASK_QUEUE.length() <= (u16)(2)) {
			u16 idleIndex = 0;
			while (idleIndex < TASK_QUEUE.length()) {
				if ((TASK_QUEUE[idleIndex].status == _AsyncTaskStatus::CONSUMED)) {
				}
				idleIndex += 1;
			}
		}
	}
}`;

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));

const countOccurrences = (source, snippet) => {
	return source.split(snippet).length - 1;
};

// The bench only measures the scheduler if the workload really yields to child
// tasks. Build the same intermediate `codegen-bench/run.js` builds and pin
// that the scalar and object child returns became real child tasks instead of
// being inlined like `sleep`.
const checkWorkloadIntermediate = () => {
	const source = readFileSync(
		join(MODULE_DIRECTORY, "codegen-bench", "fade-blink.e95"),
		"utf8",
	);
	const { tokens } = tokenize(source);
	const { ast, comments } = parse(tokens, source);
	const { variableTypes } = check(ast, {
		isLibrary: false,
		comments,
		source,
		wordSize: 16,
	});
	const { main } = shared.buildAsyncIntermediate(
		source,
		[],
		{},
		variableTypes,
		null,
	);
	const intermediate = main ?? "";
	return [
		expectEqual(
			"the bench workload spawns a scalar-returning child task",
			intermediate.includes("_readLevelAsyncAdd(") &&
				intermediate.includes(
					"_readLevelAsyncAdd((task.step % 200) as u8, true)",
				),
			true,
		),
		expectEqual(
			"the bench workload spawns an object-returning child task",
			intermediate.includes("_readSampleAsyncAdd(") &&
				intermediate.includes("as _ReadSampleAsyncTask") &&
				intermediate.includes(
					"_readSampleAsyncAdd((task.step % 250) as u8, true)",
				),
			true,
		),
		expectEqual(
			"the bench workload consumes child slots",
			intermediate.includes(
				"task.childReadLevel.status = _AsyncTaskStatus.CONSUMED",
			) &&
				intermediate.includes(
					"task.childReadSample.status = _AsyncTaskStatus.CONSUMED",
				),
			true,
		),
	];
};

const checkInstrumentation = () => {
	const instrumented = instrumentSchedulerSource(SCHEDULER_SOURCE);
	const idleScanOnly = instrumentSchedulerSource(IDLE_SCAN_ONLY_SOURCE);
	const wrapperIndex = instrumented.indexOf("while (true) {");
	const passIndex = instrumented.indexOf(PASS_HOOK_CALL);
	return [
		expectEqual(
			"bench injects one pass hook",
			countOccurrences(instrumented, PASS_HOOK_CALL),
			1,
		),
		expectEqual(
			"bench injects the pass hook inside the pass wrapper",
			passIndex > wrapperIndex,
			true,
		),
		expectEqual(
			"bench injects a visit hook per dispatch loop",
			countOccurrences(instrumented, "e95_bench_visit();"),
			2,
		),
		expectEqual(
			"bench injects a dispatch hook per dispatch loop",
			countOccurrences(instrumented, "e95_bench_dispatch();"),
			2,
		),
		expectEqual(
			"bench injects one compaction counter",
			countOccurrences(instrumented, "e95_bench_compaction();"),
			1,
		),
		expectEqual(
			"bench injects one compaction visit counter",
			countOccurrences(instrumented, "e95_bench_compact_visit();"),
			1,
		),
		expectEqual(
			"bench does not count the idle-exit queue scan as a compaction",
			countOccurrences(idleScanOnly, "e95_bench_compaction();") +
				countOccurrences(idleScanOnly, "e95_bench_compact_visit();"),
			0,
		),
		expectEqual(
			"bench leaves a module without the event loop alone",
			instrumentSchedulerSource("void handler() {}"),
			null,
		),
	];
};

const checkSleepInstrumentation = () => {
	const source =
		"if (!(core_time::hasElapsed(task->start, task->milliseconds))) {} " +
		"if (!(core_time::hasElapsedMicros(task->start, task->microseconds))) {}";
	const instrumented = instrumentSleepChecks(source);
	return [
		expectEqual(
			"bench replaces the millisecond sleep check",
			instrumented.includes(
				"e95_bench_has_elapsed(task->start, task->milliseconds)",
			),
			true,
		),
		expectEqual(
			"bench leaves the microsecond sleep check untouched",
			instrumented.includes(
				"core_time::hasElapsedMicros(task->start, task->microseconds)",
			),
			true,
		),
	];
};

const checkDriverSource = () => {
	const driver = buildBenchDriverSource({
		durationPasses: 20000,
		warmUpPasses: 500,
	});
	return [
		expectEqual(
			"bench driver measures nanoseconds",
			driver.includes("bench_elapsed_nanoseconds") &&
				driver.includes("bench pass_sample_nanoseconds"),
			true,
		),
		expectEqual(
			"bench driver warms up before recording",
			driver.includes("bench_warmup_passes = 500LL") &&
				driver.includes("bench_pass_count > bench_warmup_passes"),
			true,
		),
		expectEqual(
			"bench driver emits a latency histogram",
			driver.includes("bench latency_histogram"),
			true,
		),
		expectEqual(
			"bench driver uses a high-resolution clock with a documented name",
			driver.includes("clock_gettime_nsec_np(CLOCK_UPTIME_RAW)") &&
				driver.includes("bench clock %s") &&
				driver.includes("bench clock_resolution_nanoseconds"),
			true,
		),
		expectEqual(
			"bench driver stops after exactly durationPasses passes",
			driver.includes("bench_pass_count >= bench_pass_limit"),
			true,
		),
		expectEqual(
			"bench driver counts a successful realloc as free + alloc",
			driver.includes("bench_free_count++;\n\t\t\tbench_live_blocks--;") &&
				driver.includes("else if (pointer && size == 0) {"),
			true,
		),
	];
};

const checkParsing = () => {
	const parsed = parseBenchOutput(BENCH_OUTPUT);
	const metrics = buildHostBenchMetrics({
		label: "baseline",
		scenario: "fade-blink",
		durationPasses: 100,
		warmUpPasses: 4,
		repetitions: 5,
		output: BENCH_OUTPUT,
	});
	return [
		expectEqual("bench parses pass count", parsed.values.passes, 100),
		expectEqual("bench parses pass samples", parsed.passSamples.length, 2),
		expectEqual(
			"bench parses the latency histogram",
			parsed.latencyHistogram.length,
			2,
		),
		expectEqual(
			"bench derives the visit total",
			metrics.metrics.visits.total,
			300,
		),
		expectEqual(
			"bench derives the per-pass visit mean",
			metrics.metrics.visits.perPassMean,
			150,
		),
		expectEqual(
			"bench converts nanoseconds to microseconds",
			metrics.metrics.passTimeMicroseconds.median,
			20,
		),
		expectEqual(
			"bench derives the pass p95",
			metrics.metrics.passTimeMicroseconds.p95,
			40,
		),
		expectEqual(
			"bench derives the wake latency mean",
			metrics.metrics.wakeLatencyPasses.mean,
			1.5,
		),
		expectEqual(
			"bench derives the wake latency median from the histogram",
			metrics.metrics.wakeLatencyPasses.median,
			1,
		),
		expectEqual(
			"bench derives the wake latency p95 from the histogram",
			metrics.metrics.wakeLatencyPasses.p95,
			2,
		),
		expectEqual(
			"bench derives net live blocks",
			metrics.metrics.allocations.liveBlocks,
			3,
		),
		expectEqual(
			"bench keeps alloc - free == live for the baseline",
			metrics.metrics.allocations.balance,
			0,
		),
		expectEqual(
			"bench reports the clock source",
			metrics.clock.source,
			"CLOCK_UPTIME_RAW",
		),
		expectEqual(
			"bench reports the clock resolution",
			metrics.clock.resolutionNanoseconds,
			1,
		),
		expectEqual(
			"bench marks a resolved sample set conclusive",
			metrics.conclusive,
			true,
		),
		expectEqual("bench carries the label", metrics.label, "baseline"),
		expectEqual(
			"bench records the configuration",
			metrics.configuration.compilerFlags,
			"-std=c++17 -O2",
		),
	];
};

// Repetitions must be aggregated with the same scope: alloc/free sums and the
// sum of each repetition's final net-live delta, so `alloc - free == live`
// holds across the whole run. Any median of 0 ns is non-conclusive, including
// the fully degenerate set (median 0 ns, p95 0 ns) where the clock cannot
// resolve the pass at all.
const checkRepetitionScope = () => {
	const metrics = buildHostBenchMetrics({
		label: "baseline",
		scenario: "fade-blink",
		durationPasses: 100,
		warmUpPasses: 4,
		repetitions: 2,
		outputs: [BENCH_OUTPUT, BENCH_OUTPUT],
	});
	const unresolvedMetrics = buildHostBenchMetrics({
		label: "baseline",
		scenario: "fade-blink",
		durationPasses: 100,
		warmUpPasses: 4,
		repetitions: 1,
		output: [
			"bench clock CLOCK_UPTIME_RAW",
			"bench clock_resolution_nanoseconds 1000",
			"bench allocation_count 1",
			"bench free_count 1",
			"bench live_blocks 0",
			"bench pass_sample_nanoseconds 0",
			"bench pass_sample_nanoseconds 0",
			"bench pass_sample_nanoseconds 1000",
		].join("\n"),
	});
	const unresolvableMetrics = buildHostBenchMetrics({
		label: "baseline",
		scenario: "fade-blink",
		durationPasses: 100,
		warmUpPasses: 4,
		repetitions: 1,
		output: [
			"bench clock CLOCK_UPTIME_RAW",
			"bench clock_resolution_nanoseconds 1000",
			"bench allocation_count 1",
			"bench free_count 1",
			"bench live_blocks 0",
			"bench pass_sample_nanoseconds 0",
			"bench pass_sample_nanoseconds 0",
			"bench pass_sample_nanoseconds 0",
		].join("\n"),
	});
	const tooManyPasses = captureError(() => {
		validatePassCount(MAXIMUM_PASS_SAMPLES + 1);
	});
	return [
		expectEqual(
			"bench sums allocations across repetitions",
			metrics.metrics.allocations.allocations,
			18,
		),
		expectEqual(
			"bench sums frees across repetitions",
			metrics.metrics.allocations.frees,
			12,
		),
		expectEqual(
			"bench sums final live blocks across repetitions",
			metrics.metrics.allocations.liveBlocks,
			6,
		),
		expectEqual(
			"bench keeps alloc - free == live across repetitions",
			metrics.metrics.allocations.balance,
			0,
		),
		expectEqual(
			"bench marks a degenerate median non-conclusive",
			unresolvedMetrics.conclusive,
			false,
		),
		expectEqual(
			"bench explains why a run is non-conclusive",
			typeof unresolvedMetrics.conclusiveReason === "string" &&
				unresolvedMetrics.conclusiveReason.includes("0 ns"),
			true,
		),
		expectEqual(
			"bench marks a zero median and zero p95 non-conclusive",
			unresolvableMetrics.conclusive,
			false,
		),
		expectEqual(
			"bench explains a fully unresolved sample set",
			typeof unresolvableMetrics.conclusiveReason === "string" &&
				unresolvableMetrics.conclusiveReason.includes("0 ns"),
			true,
		),
		expectEqual(
			"bench accepts the maximum representable pass count",
			captureError(() => {
				validatePassCount(MAXIMUM_PASS_SAMPLES);
			}),
			null,
		),
		expectEqual(
			"bench rejects a pass count above the sample buffer with a clear error",
			tooManyPasses !== null && tooManyPasses.includes("at most"),
			true,
		),
	];
};

const buildComparisonInput = (label, visits, durationPasses = 100) => {
	return {
		label,
		mode: "host",
		scenario: "fade-blink",
		durationPasses,
		configuration: {
			compilerFlags: "-std=c++17 -O2",
			warmUpPasses: 4,
			repetitions: 5,
		},
		metrics: {
			passes: 100,
			visits: { total: visits, perPassMean: 2, perPassMaximum: 4 },
		},
	};
};

const captureError = (callback) => {
	try {
		callback();
		return null;
	} catch (error) {
		return error.message;
	}
};

const checkComparison = () => {
	const before = buildComparisonInput("baseline", 100);
	const after = buildComparisonInput("optimized", 60);
	const rows = compareMetricResults(before, after);
	const visitRow = rows.find((row) => {
		return row.metric === "visits.total";
	});
	const table = formatComparison(before, after);
	const differingPasses = captureError(() => {
		validateComparableResults(
			before,
			buildComparisonInput("optimized", 60, 5000),
		);
	});
	const differingMode = captureError(() => {
		validateComparableResults(before, {
			...buildComparisonInput("optimized", 60),
			mode: "avr",
		});
	});
	return [
		expectEqual("bench compares matching metrics", rows.length, 4),
		expectEqual("bench computes the delta", visitRow.delta, -40),
		expectEqual("bench computes the delta percent", visitRow.deltaPercent, -40),
		expectEqual(
			"bench renders both labels in the comparison",
			table.includes("baseline") && table.includes("optimized"),
			true,
		),
		expectEqual(
			"bench accepts comparable results",
			captureError(() => {
				validateComparableResults(before, after);
			}),
			null,
		),
		expectEqual(
			"bench rejects a different pass count",
			differingPasses !== null && differingPasses.includes("durationPasses"),
			true,
		),
		expectEqual(
			"bench rejects a different mode",
			differingMode !== null && differingMode.includes("mode"),
			true,
		),
	];
};

export const runBenchMetricsChecks = () => {
	return [
		...checkInstrumentation(),
		...checkSleepInstrumentation(),
		...checkDriverSource(),
		...checkWorkloadIntermediate(),
		...checkParsing(),
		...checkRepetitionScope(),
		...checkComparison(),
	];
};
