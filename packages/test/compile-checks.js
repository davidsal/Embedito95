// Opt-in real compilation of generated projects (`pnpm run test:compile`).
// This module is intentionally independent from `pnpm test`: it only runs when
// the caller asks for it, it never compiles inside the snapshot suite and it
// skips (instead of failing) platforms whose toolchains are not installed.
import { mkdtempSync, rmSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { LIBRARIES_DIRECTORY_NAME } from "embedito95-core";
import {
	collectPlatformJobs,
	runEntryCompileJob,
} from "./compile-check-jobs.js";
import { runCompilePool, runJobSafely } from "./compile-check-pool.js";
import { resolvePlatformSkip } from "./compile-check-probes.js";
import {
	beginCompileProgressSection,
	commitCompileProgressSection,
	createCompileProgress,
	finishCompileProgress,
	stopCompileProgress,
} from "./compile-check-progress.js";
import {
	buildCompileSizesSnapshot,
	formatCompiledTestLine,
	processCompileSizesSnapshot,
} from "./compile-check-sizes.js";
import {
	COMPILE_CATEGORY_INDENTATION,
	COMPILE_CONCURRENCY_ENVIRONMENT_KEY,
	COMPILE_DIAGNOSTIC_INDENTATION,
	COMPILE_FAST_ENABLED_VALUE,
	COMPILE_FAST_ENVIRONMENT_KEY,
	COMPILE_PLATFORM_KIND,
	COMPILE_PLATFORM_KIND_BY_PLATFORM,
	COMPILE_PLATFORM_ORDER,
	COMPILE_RESULT_STATUS,
	COMPILE_SIZES_SNAPSHOT_FILE,
	COMPILE_SIZES_SNAPSHOT_STATUS,
	COMPILE_TEMP_DIRECTORY_PREFIX,
	COMPILE_TEST_INDENTATION,
	COMPILE_UPDATE_SNAPSHOTS_ENABLED_VALUE,
	COMPILE_UPDATE_SNAPSHOTS_ENVIRONMENT_KEY,
	CORE_CATEGORY_NAME,
	DEFAULT_MAXIMUM_COMPILE_CONCURRENCY,
	EXAMPLES_DIRECTORY_NAME,
	MINIMUM_COMPILE_CONCURRENCY,
	RED_CROSS,
	SKIP_MARK,
	STM32_MAXIMUM_PROJECT_CONCURRENCY,
	STM32_TOTAL_COMPILE_JOB_BUDGET,
	TEST_ENTRY_SUFFIX_PATTERN,
} from "./constants.js";

const ARDUINO_BUILD_CACHE_DIRECTORY_NAME = "arduino-core-cache";
const MILLISECONDS_PER_SECOND = 1000;

const clampCompileConcurrency = ({ concurrency, parallelism }) => {
	const maximum = Math.min(parallelism, DEFAULT_MAXIMUM_COMPILE_CONCURRENCY);
	return Math.max(MINIMUM_COMPILE_CONCURRENCY, Math.min(concurrency, maximum));
};

export const resolveCompileConcurrency = ({
	environment = process.env,
	parallelism = availableParallelism(),
} = {}) => {
	const machineDefault = Math.max(
		MINIMUM_COMPILE_CONCURRENCY,
		Math.min(parallelism, DEFAULT_MAXIMUM_COMPILE_CONCURRENCY),
	);
	const configuredValue = environment[COMPILE_CONCURRENCY_ENVIRONMENT_KEY];

	if (configuredValue === undefined) {
		return machineDefault;
	}

	const parsedValue = Number(configuredValue);

	if (
		!Number.isInteger(parsedValue) ||
		parsedValue < MINIMUM_COMPILE_CONCURRENCY
	) {
		return machineDefault;
	}

	return clampCompileConcurrency({
		concurrency: parsedValue,
		parallelism: DEFAULT_MAXIMUM_COMPILE_CONCURRENCY,
	});
};

export const parseCompileFast = ({ environment = process.env } = {}) => {
	return (
		environment[COMPILE_FAST_ENVIRONMENT_KEY] === COMPILE_FAST_ENABLED_VALUE
	);
};

export const parseCompileSnapshotUpdate = ({
	environment = process.env,
} = {}) => {
	return (
		environment[COMPILE_UPDATE_SNAPSHOTS_ENVIRONMENT_KEY] ===
		COMPILE_UPDATE_SNAPSHOTS_ENABLED_VALUE
	);
};

export const resolveStm32ProjectConcurrency = ({ maximumConcurrency }) => {
	return Math.max(
		MINIMUM_COMPILE_CONCURRENCY,
		Math.min(maximumConcurrency, STM32_MAXIMUM_PROJECT_CONCURRENCY),
	);
};

export const resolveStm32CompileJobCount = ({ maximumConcurrency }) => {
	const projectConcurrency = resolveStm32ProjectConcurrency({
		maximumConcurrency,
	});
	return Math.max(
		MINIMUM_COMPILE_CONCURRENCY,
		Math.floor(STM32_TOTAL_COMPILE_JOB_BUDGET / projectConcurrency),
	);
};

const writeOutputToStdout = (text) => {
	process.stdout.write(text);
};

const writeOutputToStderr = (text) => {
	process.stderr.write(text);
};

const DEFAULT_DEPENDENCIES = {
	availableParallelism,
	probePlatform: resolvePlatformSkip,
	collectPlatformJobs,
	runEntryCompileJob,
	compileSizesSnapshotPath: COMPILE_SIZES_SNAPSHOT_FILE,
	writeOutput: writeOutputToStdout,
	writeError: writeOutputToStderr,
	progressStream: process.stdout,
};

const createSkippedResults = ({ jobs, reason }) => {
	return jobs.map((job) => {
		return {
			status: COMPILE_RESULT_STATUS.skipped,
			label: job.label,
			reason: job.skipReason ?? reason,
		};
	});
};

const splitRunnableJobs = (jobs) => {
	return {
		skippedJobs: jobs.filter((job) => {
			return Boolean(job.skipReason);
		}),
		runnableJobs: jobs.filter((job) => {
			return !job.skipReason;
		}),
	};
};

const resolveJobTestName = (job) => {
	if (job.entryFile === undefined) {
		return job.label;
	}

	return formatTestName(job.entryFile);
};

const resolveJobCategory = (job) => {
	return parseEntryLabel(job.label).category;
};

const compareJobEntries = (firstJob, secondJob) => {
	return compareText(
		resolveJobTestName(firstJob),
		resolveJobTestName(secondJob),
	);
};

const groupJobsByCategory = (jobs) => {
	const groups = new Map();

	for (const job of jobs) {
		const category = resolveJobCategory(job);
		const categoryKey = category ?? NO_CATEGORY_KEY;
		const group = groups.get(categoryKey) ?? { category, jobs: [] };
		group.jobs.push(job);
		groups.set(categoryKey, group);
	}

	return [...groups.values()]
		.sort(compareCategoryGroups)
		.map(({ category, jobs: categoryJobs }) => {
			return {
				category,
				jobs: [...categoryJobs].sort(compareJobEntries),
			};
		});
};

const createCategoryEntries = (categoryJobs) => {
	return categoryJobs.map((job) => {
		return { label: job.label, name: resolveJobTestName(job) };
	});
};

const formatCompileResultLine = ({ result, entryFile }) => {
	return formatTestLine({
		result,
		entryFile,
		indentation: TEST_INDENTATION,
	}).trimEnd();
};

const printCategoryHeader = ({ category, dependencies }) => {
	if (category === null) {
		return;
	}

	dependencies.writeOutput(`${CATEGORY_INDENTATION}${category}\n`);
};

const printInteractivePlatformHeader = ({
	platformName,
	progress,
	dependencies,
}) => {
	if (!progress.enabled) {
		return;
	}

	dependencies.writeOutput(`${platformName}\n`);
};

const finishSkippedJobProgress = ({ progress, result }) => {
	finishCompileProgress({
		progress,
		label: result.label,
		text: formatCompileResultLine({
			result,
			entryFile: parseEntryLabel(result.label).entryFile,
		}),
	});
};

const runCategoryCompile = async ({
	categoryGroup,
	maximumConcurrency,
	kind,
	context,
	dependencies,
	warmupJob,
}) => {
	const { skippedJobs, runnableJobs } = splitRunnableJobs(categoryGroup.jobs);
	const progress = context.progress;
	const skippedResults = createSkippedResults({
		jobs: skippedJobs,
		reason: "skipped",
	});

	if (progress.enabled) {
		printCategoryHeader({
			category: categoryGroup.category,
			dependencies,
		});
		beginCompileProgressSection({
			progress,
			entries: createCategoryEntries(categoryGroup.jobs),
		});

		for (const skippedResult of skippedResults) {
			finishSkippedJobProgress({ progress, result: skippedResult });
		}
	}

	const remainingRunnableJobs = warmupJob
		? runnableJobs.filter((job) => {
				return job !== warmupJob;
			})
		: runnableJobs;
	const warmupResults = warmupJob
		? [
				await runJobSafely({
					job: warmupJob,
					runEntryCompileJob: dependencies.runEntryCompileJob,
					context,
				}),
			]
		: [];
	const poolResults = await runCompilePool({
		jobs: remainingRunnableJobs,
		maximumConcurrency:
			kind === COMPILE_PLATFORM_KIND.stm32
				? resolveStm32ProjectConcurrency({ maximumConcurrency })
				: maximumConcurrency,
		runJob: dependencies.runEntryCompileJob,
		context,
	});

	if (progress.enabled) {
		commitCompileProgressSection(progress);
	}

	return [...skippedResults, ...warmupResults, ...poolResults];
};

const findWarmupJob = ({ kind, categoryGroups }) => {
	if (kind !== COMPILE_PLATFORM_KIND.arduino) {
		return null;
	}

	const firstRunnableJob = categoryGroups
		.flatMap((categoryGroup) => {
			return categoryGroup.jobs;
		})
		.find((job) => {
			return !job.skipReason;
		});

	return firstRunnableJob ?? null;
};

const runPlatformCompile = async ({
	platformName,
	jobs,
	maximumConcurrency,
	progress,
	dependencies,
}) => {
	const startedAt = Date.now();
	const kind = COMPILE_PLATFORM_KIND_BY_PLATFORM[platformName];
	const platformTempDirectory = mkdtempSync(
		join(tmpdir(), COMPILE_TEMP_DIRECTORY_PREFIX),
	);
	const context = {
		platformName,
		progress,
		buildCacheDirectory: join(
			platformTempDirectory,
			ARDUINO_BUILD_CACHE_DIRECTORY_NAME,
		),
		maximumCompileJobs:
			kind === COMPILE_PLATFORM_KIND.stm32
				? resolveStm32CompileJobCount({ maximumConcurrency })
				: undefined,
		formatResultLine: formatCompileResultLine,
	};
	const categoryGroups = groupJobsByCategory(jobs);
	const warmupJob = findWarmupJob({ kind, categoryGroups });
	const results = [];

	try {
		printInteractivePlatformHeader({
			platformName,
			progress,
			dependencies,
		});

		for (const categoryGroup of categoryGroups) {
			results.push(
				...(await runCategoryCompile({
					categoryGroup,
					maximumConcurrency,
					kind,
					context,
					dependencies,
					warmupJob: categoryGroup.jobs.includes(warmupJob) ? warmupJob : null,
				})),
			);
		}

		return {
			platformName,
			skipReason: null,
			results,
			durationMilliseconds: Date.now() - startedAt,
		};
	} finally {
		rmSync(platformTempDirectory, { recursive: true, force: true });
	}
};

const NO_CATEGORY_KEY = "";
const CATEGORY_ORDER = [
	EXAMPLES_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	CORE_CATEGORY_NAME,
];
const CATEGORY_INDENTATION = COMPILE_CATEGORY_INDENTATION;
const TEST_INDENTATION = COMPILE_TEST_INDENTATION;
const DIAGNOSTIC_INDENTATION = COMPILE_DIAGNOSTIC_INDENTATION;
const SUMMARY_LABEL_WIDTH = 13;
const SUMMARY_SNAPSHOT_FILE_COUNT = 1;
const TEST_SUITES_SUMMARY_LABEL = "Test Suites:";
const TESTS_SUMMARY_LABEL = "Tests:";
const TIME_SUMMARY_LABEL = "Time:";
const SNAPSHOT_SUMMARY_LABEL = "Snapshot:";
const UNKNOWN_SKIP_REASON = "skipped";
const SNAPSHOT_SUMMARY_BY_STATUS = {
	[COMPILE_SIZES_SNAPSHOT_STATUS.match]: "matched",
	[COMPILE_SIZES_SNAPSHOT_STATUS.created]: "created",
	[COMPILE_SIZES_SNAPSHOT_STATUS.updated]: "updated",
	[COMPILE_SIZES_SNAPSHOT_STATUS.mismatch]: "failed",
};

const countResults = (results) => {
	return results.reduce(
		(counts, result) => {
			counts[result.status] += 1;
			return counts;
		},
		{
			[COMPILE_RESULT_STATUS.compiled]: 0,
			[COMPILE_RESULT_STATUS.failed]: 0,
			[COMPILE_RESULT_STATUS.skipped]: 0,
		},
	);
};

const parseEntryLabel = (label) => {
	const [category, , entryFile] = label.split("/");

	if (entryFile === undefined) {
		return { category: null, entryFile: label };
	}

	return { category, entryFile };
};

export const formatTestName = (entryFile) => {
	const baseName = entryFile.replace(TEST_ENTRY_SUFFIX_PATTERN, "");
	return `${baseName.charAt(0).toUpperCase()}${baseName.slice(1)}`;
};

const compareText = (firstText, secondText) => {
	if (firstText < secondText) {
		return -1;
	}
	if (firstText > secondText) {
		return 1;
	}
	return 0;
};

const resolveCategoryRank = (category) => {
	const categoryIndex = CATEGORY_ORDER.indexOf(category);
	return categoryIndex === -1 ? CATEGORY_ORDER.length : categoryIndex;
};

const compareCategoryGroups = (firstGroup, secondGroup) => {
	const rankDifference =
		resolveCategoryRank(firstGroup.category) -
		resolveCategoryRank(secondGroup.category);

	if (rankDifference !== 0) {
		return rankDifference;
	}

	return compareText(firstGroup.category ?? "", secondGroup.category ?? "");
};

const compareTestEntries = (firstEntry, secondEntry) => {
	return compareText(
		formatTestName(firstEntry.entryFile),
		formatTestName(secondEntry.entryFile),
	);
};

const groupResultsByCategory = (results) => {
	const groups = new Map();

	for (const result of results) {
		const { category, entryFile } = parseEntryLabel(result.label);
		const categoryKey = category ?? NO_CATEGORY_KEY;
		const group = groups.get(categoryKey) ?? { category, entries: [] };
		group.entries.push({ result, entryFile });
		groups.set(categoryKey, group);
	}

	return [...groups.values()]
		.sort(compareCategoryGroups)
		.map(({ category, entries }) => {
			return { category, entries: [...entries].sort(compareTestEntries) };
		});
};

const formatSeconds = (durationMilliseconds) => {
	return `${(durationMilliseconds / MILLISECONDS_PER_SECOND).toFixed(1)}s`;
};

const formatFailure = ({ result, indentation }) => {
	const message =
		result.error instanceof Error ? result.error.message : String(result.error);
	return message
		.split("\n")
		.map((line) => {
			return `${indentation}${line}`;
		})
		.join("\n");
};

const resolveResultSizes = (result) => {
	return result.value?.sizes ?? result.sizes;
};

const formatTestLine = ({ result, entryFile, indentation }) => {
	const name = formatTestName(entryFile);

	if (result.status === COMPILE_RESULT_STATUS.compiled) {
		return `${indentation}${formatCompiledTestLine({
			name,
			durationMilliseconds: result.durationMilliseconds,
			sizes: resolveResultSizes(result),
		})}\n`;
	}

	if (result.status === COMPILE_RESULT_STATUS.skipped) {
		return `${indentation}${SKIP_MARK} ${name} skipped: ${result.reason ?? UNKNOWN_SKIP_REASON}\n`;
	}

	return `${indentation}${RED_CROSS} ${name} — ${formatSeconds(result.durationMilliseconds)}\n${formatFailure(
		{
			result,
			indentation: DIAGNOSTIC_INDENTATION,
		},
	)}\n`;
};

const formatCategoryGroup = ({ category, entries }) => {
	const header =
		category === null ? "" : `${CATEGORY_INDENTATION}${category}\n`;
	const testLines = entries
		.map(({ result, entryFile }) => {
			return formatTestLine({
				result,
				entryFile,
				indentation: TEST_INDENTATION,
			});
		})
		.join("");
	return `${header}${testLines}`;
};

export const formatPlatformReport = ({ report }) => {
	if (report.skipReason) {
		return `${SKIP_MARK} ${report.platformName} skipped: ${report.skipReason}\n`;
	}

	const categoryGroups = groupResultsByCategory(report.results);
	return `${report.platformName}\n${categoryGroups.map(formatCategoryGroup).join("")}`;
};

const printPlatformReport = ({ report, dependencies }) => {
	dependencies.writeOutput(formatPlatformReport({ report }));
};

const hasFailedResult = (report) => {
	return report.results.some((result) => {
		return result.status === COMPILE_RESULT_STATUS.failed;
	});
};

const formatSuiteSummary = ({ reports }) => {
	const failedSuites = reports.filter(hasFailedResult).length;
	const skippedSuites = reports.filter((report) => {
		return Boolean(report.skipReason);
	}).length;
	const passedSuites = reports.length - failedSuites - skippedSuites;
	const parts = [];

	if (passedSuites > 0 || reports.length === 0) {
		parts.push(`${passedSuites} passed`);
	}
	if (failedSuites > 0) {
		parts.push(`${failedSuites} failed`);
	}
	if (skippedSuites > 0) {
		parts.push(`${skippedSuites} skipped`);
	}
	parts.push(`${reports.length} total`);

	return parts.join(", ");
};

const formatTestSummary = ({ reports }) => {
	const counts = countResults(
		reports
			.filter((report) => {
				return !report.skipReason;
			})
			.flatMap((report) => {
				return report.results;
			}),
	);
	const totalTests =
		counts[COMPILE_RESULT_STATUS.compiled] +
		counts[COMPILE_RESULT_STATUS.failed] +
		counts[COMPILE_RESULT_STATUS.skipped];
	const parts = [];

	if (counts[COMPILE_RESULT_STATUS.compiled] > 0 || totalTests === 0) {
		parts.push(`${counts[COMPILE_RESULT_STATUS.compiled]} passed`);
	}
	if (counts[COMPILE_RESULT_STATUS.failed] > 0) {
		parts.push(`${counts[COMPILE_RESULT_STATUS.failed]} failed`);
	}
	if (counts[COMPILE_RESULT_STATUS.skipped] > 0) {
		parts.push(`${counts[COMPILE_RESULT_STATUS.skipped]} skipped`);
	}
	parts.push(`${totalTests} total`);

	return parts.join(", ");
};

const formatSummaryLine = ({ label, value }) => {
	return `${label.padEnd(SUMMARY_LABEL_WIDTH)}${value}`;
};

export const formatCompileSummary = ({
	reports,
	durationMilliseconds,
	snapshotResult,
}) => {
	const snapshotWord =
		SNAPSHOT_SUMMARY_BY_STATUS[snapshotResult.status] ??
		SNAPSHOT_SUMMARY_BY_STATUS[COMPILE_SIZES_SNAPSHOT_STATUS.mismatch];

	return [
		formatSummaryLine({
			label: TEST_SUITES_SUMMARY_LABEL,
			value: formatSuiteSummary({ reports }),
		}),
		formatSummaryLine({
			label: TESTS_SUMMARY_LABEL,
			value: formatTestSummary({ reports }),
		}),
		formatSummaryLine({
			label: TIME_SUMMARY_LABEL,
			value: formatSeconds(durationMilliseconds),
		}),
		formatSummaryLine({
			label: SNAPSHOT_SUMMARY_LABEL,
			value: `${SUMMARY_SNAPSHOT_FILE_COUNT} ${snapshotWord}`,
		}),
	].join("\n");
};

const printCompileSizesSnapshotMismatch = ({ result, dependencies }) => {
	if (result.status !== COMPILE_SIZES_SNAPSHOT_STATUS.mismatch) {
		return;
	}

	dependencies.writeError(
		`${RED_CROSS} compile size snapshot mismatch: ${result.snapshotPath}\n${result.messages
			.map((message) => {
				return `${COMPILE_CATEGORY_INDENTATION}${message}`;
			})
			.join("\n")}\n`,
	);
};

const createSkippedPlatformReport = ({ platformName, skipReason, jobs }) => {
	return {
		platformName,
		skipReason,
		results: createSkippedResults({ jobs, reason: skipReason }),
		durationMilliseconds: 0,
	};
};

export const runTestCompile = async ({
	environment = process.env,
	dependencies = {},
} = {}) => {
	const resolvedDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
	const progress = createCompileProgress({
		stream: resolvedDependencies.progressStream,
		environment,
	});
	const maximumConcurrency = resolveCompileConcurrency({
		environment,
		parallelism: resolvedDependencies.availableParallelism(),
	});
	const compileFast = parseCompileFast({ environment });
	const compileAll = !compileFast;
	const reports = [];
	const startedAt = Date.now();

	for (const platformName of COMPILE_PLATFORM_ORDER) {
		const skipReason = resolvedDependencies.probePlatform({ platformName });
		const jobs = resolvedDependencies.collectPlatformJobs({
			platformName,
			compileAll,
		});

		if (skipReason) {
			const report = createSkippedPlatformReport({
				platformName,
				skipReason,
				jobs,
			});
			reports.push(report);
			printPlatformReport({ report, dependencies: resolvedDependencies });
			continue;
		}

		const report = await runPlatformCompile({
			platformName,
			jobs,
			maximumConcurrency,
			progress,
			dependencies: resolvedDependencies,
		});
		reports.push(report);

		if (!progress.enabled) {
			printPlatformReport({ report, dependencies: resolvedDependencies });
		}
	}

	stopCompileProgress(progress);

	const failedCount = reports.reduce((total, report) => {
		return total + countResults(report.results)[COMPILE_RESULT_STATUS.failed];
	}, 0);
	const compileSizesSnapshot = buildCompileSizesSnapshot({ reports });
	const snapshotResult = processCompileSizesSnapshot({
		snapshotPath: resolvedDependencies.compileSizesSnapshotPath,
		snapshot: compileSizesSnapshot,
		updateSnapshots: parseCompileSnapshotUpdate({ environment }),
	});

	printCompileSizesSnapshotMismatch({
		result: snapshotResult,
		dependencies: resolvedDependencies,
	});

	const durationMilliseconds = Date.now() - startedAt;
	resolvedDependencies.writeOutput(
		`${formatCompileSummary({
			reports,
			durationMilliseconds,
			snapshotResult,
		})}\n`,
	);

	const snapshotFailed =
		snapshotResult.status === COMPILE_SIZES_SNAPSHOT_STATUS.mismatch;

	return {
		exitCode: failedCount > 0 || snapshotFailed ? 1 : 0,
		reports,
		compileSizesSnapshot,
		snapshotResult,
		durationMilliseconds,
	};
};
