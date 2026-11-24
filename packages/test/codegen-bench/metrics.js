// Pure helpers for the bench: parse the driver's `bench <key> <value>` lines
// into the metrics object, render it for a human, and diff two JSON results.
// Keeping them side-effect free lets the unit checks cover the format and the
// comparison without running the (opt-in) bench.
//
// The driver reports raw nanoseconds and one sample per measured pass. This
// module converts to microseconds only when building/printing the report and
// computes median/p95 from the full sample set and the latency histogram.
import { MAXIMUM_PASS_SAMPLES } from "./driver-source.js";

const BENCH_PREFIX = "bench ";
const PASS_SAMPLE_KEY = "pass_sample_nanoseconds";
const LATENCY_HISTOGRAM_KEY = "latency_histogram";
const CLOCK_KEY = "clock";
const CLOCK_RESOLUTION_KEY = "clock_resolution_nanoseconds";
const NANOSECONDS_PER_MICROSECOND = 1000;
const PERCENT_MAXIMUM = 100;
const PERCENT_MEDIAN = 50;
const PERCENT_P95 = 95;
const COMPILER_FLAGS = "-std=c++17 -O2";

const SUM_VALUE_KEYS = [
	"passes",
	"wall_nanoseconds",
	"visit_count",
	"dispatch_count",
	"compaction_count",
	"compaction_visit_count",
	"allocation_count",
	"free_count",
	"wake_count",
];
const MAXIMUM_VALUE_KEYS = ["visit_maximum", "dispatch_maximum"];

// `--passes` is capped to the number of samples the driver can record, so the
// reported summary always represents every measured pass instead of silently
// truncating a larger run.
export const validatePassCount = (passes) => {
	if (passes > MAXIMUM_PASS_SAMPLES) {
		throw new Error(
			`passes must be at most ${MAXIMUM_PASS_SAMPLES} (the driver records at most ${MAXIMUM_PASS_SAMPLES} pass samples)`,
		);
	}
};

const toNumber = (text) => {
	const parsed = Number(text);
	return Number.isFinite(parsed) ? parsed : null;
};

const parseBenchLine = (line, parsedOutput) => {
	if (!line.startsWith(BENCH_PREFIX)) {
		return null;
	}
	const [key, ...rest] = line.slice(BENCH_PREFIX.length).trim().split(/\s+/);
	if (key === PASS_SAMPLE_KEY) {
		const sample = toNumber(rest[0]);
		if (sample !== null) {
			parsedOutput.passSamples.push(sample);
		}
		return null;
	}
	if (key === LATENCY_HISTOGRAM_KEY) {
		const latency = toNumber(rest[0]);
		const count = toNumber(rest[1]);
		if (latency !== null && count !== null) {
			parsedOutput.latencyHistogram.push({ latency, count });
		}
		return null;
	}
	if (key === CLOCK_KEY) {
		if (rest[0]) {
			parsedOutput.clock = rest[0];
		}
		return null;
	}
	const parsed = toNumber(rest[0]);
	if (parsed === null) {
		return null;
	}
	return [key, parsed];
};

export const parseBenchOutput = (output) => {
	const parsedOutput = {
		values: {},
		passSamples: [],
		latencyHistogram: [],
		clock: null,
	};
	for (const line of output.split("\n")) {
		const entry = parseBenchLine(line.trim(), parsedOutput);
		if (entry) {
			parsedOutput.values[entry[0]] = entry[1];
		}
	}
	return parsedOutput;
};

const calculateMean = (total, count) => {
	return count > 0 ? total / count : 0;
};

const readValue = (values, key) => {
	return values[key] ?? 0;
};

// Nearest-rank percentile over an ascending array.
const selectPercentile = (sorted, percent) => {
	if (sorted.length === 0) {
		return 0;
	}
	const rank = Math.ceil((percent / PERCENT_MAXIMUM) * sorted.length);
	return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
};

// Nearest-rank percentile over a histogram without expanding it.
const selectHistogramPercentile = (histogram, total, percent) => {
	if (total === 0) {
		return 0;
	}
	const target = Math.ceil((percent / PERCENT_MAXIMUM) * total);
	let cumulative = 0;
	for (const entry of histogram) {
		cumulative += entry.count;
		if (cumulative >= target) {
			return entry.latency;
		}
	}
	return histogram[histogram.length - 1].latency;
};

const aggregateValues = (parsedOutputs) => {
	const values = {};
	for (const parsed of parsedOutputs) {
		for (const key of SUM_VALUE_KEYS) {
			values[key] = (values[key] ?? 0) + readValue(parsed.values, key);
		}
		for (const key of MAXIMUM_VALUE_KEYS) {
			values[key] = Math.max(values[key] ?? 0, readValue(parsed.values, key));
		}
	}
	// Live blocks are aggregated over the same scope as `allocation_count` and
	// `free_count`: the sum of every repetition's final net-live delta. This
	// keeps `allocations - frees == liveBlocks` across repetitions instead of
	// mixing a summed alloc/free with the last repetition's live count.
	values.live_blocks = parsedOutputs.reduce((sum, parsed) => {
		return sum + readValue(parsed.values, "live_blocks");
	}, 0);
	return values;
};

const mergeLatencyHistogram = (parsedOutputs) => {
	const counts = new Map();
	for (const parsed of parsedOutputs) {
		for (const { latency, count } of parsed.latencyHistogram) {
			counts.set(latency, (counts.get(latency) ?? 0) + count);
		}
	}
	return [...counts.entries()]
		.map(([latency, count]) => {
			return { latency, count };
		})
		.sort((left, right) => {
			return left.latency - right.latency;
		});
};

const normalizeOutputs = ({ output, outputs }) => {
	if (Array.isArray(outputs)) {
		return outputs;
	}
	return [output];
};

const summarizeSamples = (samples) => {
	const sorted = [...samples].sort((left, right) => {
		return left - right;
	});
	const total = samples.reduce((sum, value) => {
		return sum + value;
	}, 0);
	return {
		total,
		mean: calculateMean(total, samples.length),
		minimum: sorted[0] ?? 0,
		maximum: sorted[sorted.length - 1] ?? 0,
		median: selectPercentile(sorted, PERCENT_MEDIAN),
		p95: selectPercentile(sorted, PERCENT_P95),
	};
};

const buildPassTime = (passSamples) => {
	const nanoseconds = summarizeSamples(passSamples);
	const microseconds = summarizeSamples(
		passSamples.map((value) => {
			return value / NANOSECONDS_PER_MICROSECOND;
		}),
	);
	return { nanoseconds, microseconds };
};

const buildWakeLatency = (histogram) => {
	const total = histogram.reduce((sum, entry) => {
		return sum + entry.count;
	}, 0);
	const weightedTotal = histogram.reduce((sum, entry) => {
		return sum + entry.latency * entry.count;
	}, 0);
	const latencies = histogram.map((entry) => {
		return entry.latency;
	});
	return {
		count: total,
		mean: calculateMean(weightedTotal, total),
		minimum: latencies[0] ?? 0,
		maximum: latencies[latencies.length - 1] ?? 0,
		median: selectHistogramPercentile(histogram, total, PERCENT_MEDIAN),
		p95: selectHistogramPercentile(histogram, total, PERCENT_P95),
		histogram,
	};
};

export const buildHostBenchMetrics = ({
	label,
	scenario,
	durationPasses,
	warmUpPasses = 0,
	repetitions = 1,
	output,
	outputs,
}) => {
	const parsedOutputs = normalizeOutputs({ output, outputs }).map((text) => {
		return parseBenchOutput(text);
	});
	const values = aggregateValues(parsedOutputs);
	const passSamples = parsedOutputs.flatMap((parsed) => {
		return parsed.passSamples;
	});
	const visitCount = readValue(values, "visit_count");
	const dispatchCount = readValue(values, "dispatch_count");
	const measuredPasses = passSamples.length;
	const passTime = buildPassTime(passSamples);
	const allocations = readValue(values, "allocation_count");
	const frees = readValue(values, "free_count");
	const liveBlocks = readValue(values, "live_blocks");
	const allocationBalance = allocations - frees - liveBlocks;
	const clockSource = parsedOutputs[0]?.clock ?? null;
	const clockResolutionNanoseconds = readValue(
		parsedOutputs[0]?.values ?? {},
		CLOCK_RESOLUTION_KEY,
	);
	// A median of 0 ns means the clock is too coarse to resolve the operand,
	// so the sample set cannot support a conclusion (even when p95 is 0 too).
	const passTimeResolved = passTime.nanoseconds.median !== 0;
	const conclusiveReason = passTimeResolved
		? null
		: "median pass time is 0 ns: the clock resolution is coarser than the measured pass";
	return {
		label,
		mode: "host",
		scenario,
		durationPasses,
		clock: {
			source: clockSource,
			resolutionNanoseconds: clockResolutionNanoseconds,
		},
		conclusive: passTimeResolved,
		conclusiveReason,
		configuration: {
			compilerFlags: COMPILER_FLAGS,
			warmUpPasses,
			repetitions,
		},
		metrics: {
			passes: readValue(values, "passes"),
			measuredPasses,
			wallTimeNanoseconds: readValue(values, "wall_nanoseconds"),
			wallTimeMicroseconds:
				readValue(values, "wall_nanoseconds") / NANOSECONDS_PER_MICROSECOND,
			passTimeNanoseconds: passTime.nanoseconds,
			passTimeMicroseconds: passTime.microseconds,
			visits: {
				total: visitCount,
				perPassMean: calculateMean(visitCount, measuredPasses),
				perPassMaximum: readValue(values, "visit_maximum"),
			},
			dispatches: {
				total: dispatchCount,
				perPassMean: calculateMean(dispatchCount, measuredPasses),
				perPassMaximum: readValue(values, "dispatch_maximum"),
			},
			compactions: {
				count: readValue(values, "compaction_count"),
				visits: readValue(values, "compaction_visit_count"),
			},
			allocations: {
				allocations,
				frees,
				liveBlocks,
				balance: allocationBalance,
				balanced: allocationBalance === 0,
			},
			wakeLatencyPasses: buildWakeLatency(mergeLatencyHistogram(parsedOutputs)),
		},
	};
};

export const buildAvrBenchMetrics = ({
	label,
	platform,
	fqbn,
	toolchain,
	sizes,
}) => {
	return {
		label,
		mode: "avr",
		platform,
		fqbn,
		toolchain,
		executed: false,
		configuration: {
			compilerFlags: "",
		},
		sizes: {
			flash: { used: sizes.flash, maximum: sizes.flashMax },
			ram: { used: sizes.ram, maximum: sizes.ramMax },
		},
		note: "Compiled only: the scheduler was not executed on hardware.",
	};
};

const formatMicroseconds = (value) => {
	return `${value.toFixed(3)} µs`;
};

const formatCount = (value) => {
	return value.toFixed(2);
};

const formatHistogram = (histogram) => {
	if (histogram.length === 0) {
		return ["  (no wake-ups)"];
	}
	return histogram.map((entry) => {
		return `  ${entry.latency} pass(es) late: ${entry.count}`;
	});
};

export const formatHostReport = (result) => {
	const { metrics } = result;
	const passSeconds =
		metrics.passTimeMicroseconds.total / (NANOSECONDS_PER_MICROSECOND * 1000);
	const clock = result.clock ?? {};
	const clockSource = clock.source ?? "unknown";
	const clockResolution = clock.resolutionNanoseconds ?? 0;
	const conclusive = result.conclusive !== false;
	const allocationBalance = metrics.allocations.balance ?? 0;
	const lines = [
		`=== bench ${result.scenario} (${result.label}) ===`,
		`mode: host   passes measured: ${result.durationPasses}   repetitions: ${result.configuration.repetitions}   warm-up passes: ${result.configuration.warmUpPasses}`,
		`compiler flags: ${result.configuration.compilerFlags}`,
		`clock: ${clockSource} (resolution ${clockResolution} ns)   conclusive: ${conclusive ? "yes" : "NO"}`,
		...(conclusive ? [] : [`warning: ${result.conclusiveReason}`]),
		`passes: ${metrics.passes} (recorded samples: ${metrics.measuredPasses})`,
		`pass time: median ${metrics.passTimeNanoseconds.median} ns (${formatMicroseconds(metrics.passTimeMicroseconds.median)}), p95 ${metrics.passTimeNanoseconds.p95} ns (${formatMicroseconds(metrics.passTimeMicroseconds.p95)}), mean ${metrics.passTimeNanoseconds.mean.toFixed(1)} ns (${formatMicroseconds(metrics.passTimeMicroseconds.mean)}), min ${metrics.passTimeNanoseconds.minimum} ns, max ${metrics.passTimeNanoseconds.maximum} ns (total ${passSeconds.toFixed(3)} s)`,
		`visits: ${metrics.visits.total}   per pass: mean ${formatCount(metrics.visits.perPassMean)}, max ${metrics.visits.perPassMaximum}`,
		`dispatches: ${metrics.dispatches.total}   per pass: mean ${formatCount(metrics.dispatches.perPassMean)}, max ${metrics.dispatches.perPassMaximum}`,
		`compactions: ${metrics.compactions.count}   slot visits: ${metrics.compactions.visits}`,
		`allocations: ${metrics.allocations.allocations} alloc, ${metrics.allocations.frees} free, ${metrics.allocations.liveBlocks} live (alloc - free - live = ${allocationBalance})`,
		`wake latency: ${metrics.wakeLatencyPasses.count} wake-up(s), mean ${metrics.wakeLatencyPasses.mean.toFixed(2)} pass(es) late, median ${metrics.wakeLatencyPasses.median}, p95 ${metrics.wakeLatencyPasses.p95}, max ${metrics.wakeLatencyPasses.maximum}`,
		"wake latency histogram:",
		...formatHistogram(metrics.wakeLatencyPasses.histogram),
	];
	return lines.join("\n");
};

const percentOf = (value, maximum) => {
	return maximum > 0 ? (value / maximum) * PERCENT_MAXIMUM : 0;
};

export const formatAvrReport = (result) => {
	const flashPercent = percentOf(
		result.sizes.flash.used,
		result.sizes.flash.maximum,
	);
	const ramPercent = percentOf(result.sizes.ram.used, result.sizes.ram.maximum);
	const lines = [
		`=== bench (${result.label}) ===`,
		`mode: avr   board: ${result.fqbn}   platform: ${result.platform}`,
		`toolchain: ${result.toolchain}`,
		`flash: ${result.sizes.flash.used} / ${result.sizes.flash.maximum} bytes (${flashPercent.toFixed(1)}%)`,
		`ram: ${result.sizes.ram.used} / ${result.sizes.ram.maximum} bytes (${ramPercent.toFixed(1)}%)`,
		"runtime: compiled only (no hardware execution)",
	];
	return lines.join("\n");
};

export const formatBenchReport = (result) => {
	return result.mode === "avr"
		? formatAvrReport(result)
		: formatHostReport(result);
};

const flattenObject = (value, prefix, entries) => {
	for (const [key, child] of Object.entries(value)) {
		const path = prefix.length > 0 ? `${prefix}.${key}` : key;
		if (typeof child === "number") {
			entries.push({ metric: path, value: child });
		} else if (
			child !== null &&
			typeof child === "object" &&
			!Array.isArray(child)
		) {
			flattenObject(child, path, entries);
		}
	}
};

export const flattenMetrics = (result) => {
	const entries = [];
	flattenObject(result.metrics ?? result.sizes ?? {}, "", entries);
	return entries;
};

const toMetricMap = (result) => {
	const map = new Map();
	for (const entry of flattenMetrics(result)) {
		map.set(entry.metric, entry.value);
	}
	return map;
};

const calculateDeltaPercent = (left, right) => {
	if (left === 0) {
		return null;
	}
	return ((right - left) / Math.abs(left)) * PERCENT_MAXIMUM;
};

export const compareMetricResults = (leftResult, rightResult) => {
	const left = toMetricMap(leftResult);
	const right = toMetricMap(rightResult);
	const metricNames = [...new Set([...left.keys(), ...right.keys()])].sort();
	return metricNames
		.filter((metricName) => {
			return left.has(metricName) && right.has(metricName);
		})
		.map((metricName) => {
			const leftValue = left.get(metricName);
			const rightValue = right.get(metricName);
			return {
				metric: metricName,
				left: leftValue,
				right: rightValue,
				delta: rightValue - leftValue,
				deltaPercent: calculateDeltaPercent(leftValue, rightValue),
			};
		});
};

// `--compare` only makes sense between runs of the same mode, scenario and
// configuration; diffing e.g. 20000 passes against 5000 would report fake
// improvements. Fail with a concrete message instead of comparing.
const requireEqualField = (description, leftValue, rightValue) => {
	if (leftValue !== rightValue) {
		throw new Error(
			`cannot compare benches with different ${description}: ${JSON.stringify(leftValue)} vs ${JSON.stringify(rightValue)}`,
		);
	}
};

export const validateComparableResults = (leftResult, rightResult) => {
	requireEqualField("mode", leftResult.mode, rightResult.mode);
	if (leftResult.mode === "host") {
		requireEqualField("scenario", leftResult.scenario, rightResult.scenario);
		requireEqualField(
			"durationPasses",
			leftResult.durationPasses,
			rightResult.durationPasses,
		);
		const leftConfiguration = leftResult.configuration ?? {};
		const rightConfiguration = rightResult.configuration ?? {};
		requireEqualField(
			"warmUpPasses",
			leftConfiguration.warmUpPasses,
			rightConfiguration.warmUpPasses,
		);
		requireEqualField(
			"repetitions",
			leftConfiguration.repetitions,
			rightConfiguration.repetitions,
		);
		requireEqualField(
			"compilerFlags",
			leftConfiguration.compilerFlags,
			rightConfiguration.compilerFlags,
		);
		return;
	}
	requireEqualField("platform", leftResult.platform, rightResult.platform);
	requireEqualField("fqbn", leftResult.fqbn, rightResult.fqbn);
};

const padColumn = (value, width) => {
	return `${value}`.padStart(width);
};

const formatNumber = (value) => {
	return Number.isInteger(value) ? `${value}` : value.toFixed(2);
};

const formatDeltaPercent = (deltaPercent) => {
	return deltaPercent === null ? "n/a" : `${deltaPercent.toFixed(1)}%`;
};

export const formatComparison = (leftResult, rightResult) => {
	const rows = compareMetricResults(leftResult, rightResult);
	const header = [
		padColumn("metric", 40),
		padColumn(leftResult.label, 16),
		padColumn(rightResult.label, 16),
		padColumn("delta", 16),
		padColumn("delta %", 10),
	].join("  ");
	const body = rows.map((row) => {
		return [
			padColumn(row.metric, 40),
			padColumn(formatNumber(row.left), 16),
			padColumn(formatNumber(row.right), 16),
			padColumn(formatNumber(row.delta), 16),
			padColumn(formatDeltaPercent(row.deltaPercent), 10),
		].join("  ");
	});
	if (body.length === 0) {
		body.push("(no shared metrics between the two results)");
	}
	return [header, "-".repeat(header.length), ...body].join("\n");
};
