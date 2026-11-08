// Bounded-concurrency scheduler for the STM32 translation-unit compiles
// (TICKET-85). `compile` receives `shared` by parameter, so this module only
// needs Node builtins: the caller injects the actual per-file work, which keeps
// the scheduler testable without the ARM toolchain.
import { availableParallelism } from "node:os";
import {
	DEFAULT_MAXIMUM_COMPILE_JOBS,
	MINIMUM_COMPILE_JOBS,
	STM32_COMPILE_JOBS_ENVIRONMENT_KEY,
} from "./constants.js";

const DEFAULT_ENVIRONMENT = process.env;

const clampCompileJobCount = (parallelism) => {
	return Math.max(
		MINIMUM_COMPILE_JOBS,
		Math.min(parallelism, DEFAULT_MAXIMUM_COMPILE_JOBS),
	);
};

const resolveDefaultCompileJobCount = ({ maximumCompileJobs, parallelism }) => {
	return maximumCompileJobs === undefined
		? clampCompileJobCount(parallelism)
		: clampCompileJobCount(maximumCompileJobs);
};

// Invalid values fall back to the caller default instead of hanging or
// crashing: `0`, negatives, fractions and non-numeric text are all rejected.
// An explicit `maximumCompileJobs` is only a default: the environment variable
// always wins so callers can still tune the translation-unit budget per run.
export const resolveCompileJobCount = ({
	environment = DEFAULT_ENVIRONMENT,
	parallelism = availableParallelism(),
	maximumCompileJobs,
} = {}) => {
	const configuredValue = environment[STM32_COMPILE_JOBS_ENVIRONMENT_KEY];

	if (configuredValue === undefined) {
		return resolveDefaultCompileJobCount({ maximumCompileJobs, parallelism });
	}

	const parsedValue = Number(configuredValue);

	if (!Number.isInteger(parsedValue) || parsedValue < MINIMUM_COMPILE_JOBS) {
		return resolveDefaultCompileJobCount({ maximumCompileJobs, parallelism });
	}

	return parsedValue;
};

const runCompileWorker = async ({ state, jobs, runCompileJob, context }) => {
	while (state.failure === null && state.nextIndex < jobs.length) {
		const job = jobs[state.nextIndex];
		state.nextIndex += 1;

		try {
			await runCompileJob({ job, context });
		} catch (error) {
			// First failure wins; workers already in flight finish and the
			// others stop pulling new jobs.
			state.failure ??= error;
		}
	}
};

const createCompileWorkers = ({
	workerCount,
	state,
	jobs,
	runCompileJob,
	context,
}) => {
	const workers = [];
	for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
		workers.push(runCompileWorker({ state, jobs, runCompileJob, context }));
	}
	return workers;
};

// Runs every job at most once with at most `maximumJobs` in flight. Jobs are
// consumed in array order, so callers can keep a deterministic result order
// independently of completion order. All workers settle before the first
// failure is rethrown, so no compilation is orphaned and nothing rejects
// outside this function.
export const runCompileJobs = async ({
	jobs,
	maximumJobs,
	runCompileJob,
	context,
}) => {
	const state = { nextIndex: 0, failure: null };
	const workerCount = Math.min(
		Math.max(maximumJobs, MINIMUM_COMPILE_JOBS),
		jobs.length,
	);
	const workers = createCompileWorkers({
		workerCount,
		state,
		jobs,
		runCompileJob,
		context,
	});

	await Promise.all(workers);

	if (state.failure !== null) {
		throw state.failure;
	}
};
