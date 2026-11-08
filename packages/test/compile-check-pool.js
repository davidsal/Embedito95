// Bounded work pool for `test:compile`. It never runs more jobs than the
// concurrency budget and never runs two jobs that share a key at the same time
// (the anti-duplicate guard for a project directory).
import { setTimeout } from "node:timers/promises";
import {
	finishCompileProgress,
	startCompileProgress,
} from "./compile-check-progress.js";
import {
	COMPILE_RESULT_STATUS,
	MINIMUM_COMPILE_CONCURRENCY,
} from "./constants.js";

const POOL_LOCK_WAIT_MILLISECONDS = 5;

const resolveResultLine = ({ context, job, result }) => {
	if (!context.formatResultLine) {
		return undefined;
	}

	return context.formatResultLine({
		result,
		entryFile: job.entryFile ?? job.label,
	});
};

const finishJobProgress = ({ context, job, result }) => {
	finishCompileProgress({
		progress: context.progress,
		label: job.label,
		text: resolveResultLine({ context, job, result }),
	});
};

export const runJobSafely = async ({ job, runEntryCompileJob, context }) => {
	const startedAt = Date.now();
	startCompileProgress({ progress: context.progress, label: job.label });

	try {
		const value = await runEntryCompileJob({ job, context });
		const result = {
			status: COMPILE_RESULT_STATUS.compiled,
			label: job.label,
			value,
			durationMilliseconds: Date.now() - startedAt,
		};
		finishJobProgress({ context, job, result });
		return result;
	} catch (error) {
		const result = {
			status: COMPILE_RESULT_STATUS.failed,
			label: job.label,
			error,
			durationMilliseconds: Date.now() - startedAt,
		};
		finishJobProgress({ context, job, result });
		return result;
	}
};

const claimPoolJob = (state) => {
	const pendingIndex = state.pending.findIndex((item) => {
		return !state.inFlightKeys.has(item.key);
	});

	if (pendingIndex === -1) {
		return null;
	}

	const [item] = state.pending.splice(pendingIndex, 1);
	state.inFlightKeys.add(item.key);
	return item;
};

const runPoolWorker = async (state) => {
	while (state.pending.length > 0) {
		const item = claimPoolJob(state);

		if (!item) {
			await setTimeout(POOL_LOCK_WAIT_MILLISECONDS);
			continue;
		}

		try {
			state.results[item.index] = await runJobSafely({
				job: item.job,
				runEntryCompileJob: state.runJob,
				context: state.context,
			});
		} finally {
			state.inFlightKeys.delete(item.key);
		}
	}
};

const createPoolWorkers = ({ state, remainingWorkerCount, workers = [] }) => {
	if (remainingWorkerCount === 0) {
		return workers;
	}

	workers.push(runPoolWorker(state));
	return createPoolWorkers({
		state,
		remainingWorkerCount: remainingWorkerCount - 1,
		workers,
	});
};

// Runs every job at most once with at most `maximumConcurrency` in flight and
// never two jobs that share a key at the same time. A key may repeat (e.g. two
// requests for the same project directory); the second waits for the first.
export const runCompilePool = async ({
	jobs,
	maximumConcurrency,
	runJob,
	context,
}) => {
	if (jobs.length === 0) {
		return [];
	}

	const state = {
		pending: jobs.map((job, index) => {
			return { job, index, key: job.key ?? job.label };
		}),
		results: [],
		inFlightKeys: new Set(),
		runJob,
		context,
	};
	const workerCount = Math.min(
		Math.max(maximumConcurrency, MINIMUM_COMPILE_CONCURRENCY),
		jobs.length,
	);

	await Promise.all(
		createPoolWorkers({ state, remainingWorkerCount: workerCount }),
	);

	return state.results;
};
