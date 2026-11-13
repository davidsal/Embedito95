import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolveExecutablePath } from "./artifacts.js";

const INHERITED_STDIO = "inherit";
const DETACHED_CHILD = false;
const FORCED_TERMINATION_SIGNAL = "SIGKILL";
const FORCED_TERMINATION_TIMEOUT_MILLISECONDS = 2000;
const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];
const CHILD_EXIT_EVENT = "exit";
const CHILD_ERROR_EVENT = "error";
const PROCESS_EXIT_EVENT = "exit";

export const buildExecutableNotFoundMessage = ({ executablePath }) => {
	return `Executable not found at "${executablePath}". Run 'compile' first`;
};

const isChildAlive = ({ child }) => {
	return child.exitCode === null && child.signalCode === null;
};

const killChild = ({ child, signal }) => {
	if (!isChildAlive({ child })) {
		return;
	}

	try {
		child.kill(signal);
	} catch {
		// The child may exit between the liveness check and the signal delivery.
	}
};

const createExecutionContext = ({
	child,
	resolve,
	reject,
	forcedTerminationTimeoutMilliseconds,
}) => {
	return {
		child,
		resolve,
		reject,
		forcedTerminationTimeoutMilliseconds,
		settled: false,
		forwardedSignal: null,
		forcedTerminationTimer: null,
		signalListeners: new Map(),
		processExitListener: null,
		childExitListener: null,
		childErrorListener: null,
	};
};

const clearForcedTerminationTimer = ({ context }) => {
	if (context.forcedTerminationTimer === null) {
		return;
	}

	clearTimeout(context.forcedTerminationTimer);
	context.forcedTerminationTimer = null;
};

const forceChildTermination = ({ context }) => {
	context.forcedTerminationTimer = null;
	killChild({ child: context.child, signal: FORCED_TERMINATION_SIGNAL });
};

const scheduleForcedTermination = ({ context }) => {
	if (context.forcedTerminationTimer !== null) {
		return;
	}

	context.forcedTerminationTimer = setTimeout(
		forceChildTermination,
		context.forcedTerminationTimeoutMilliseconds,
		{ context },
	);
};

const forwardSignalToChild = ({ context, signal }) => {
	if (context.settled) {
		return;
	}

	if (!isChildAlive({ child: context.child })) {
		return;
	}

	if (context.forwardedSignal === null) {
		context.forwardedSignal = signal;
	}

	killChild({ child: context.child, signal });
	scheduleForcedTermination({ context });
};

const createSignalListener = ({ context, signal }) => {
	return () => {
		forwardSignalToChild({ context, signal });
	};
};

const killChildOnProcessExit = ({ context }) => {
	killChild({ child: context.child, signal: FORCED_TERMINATION_SIGNAL });
};

const createProcessExitListener = ({ context }) => {
	return () => {
		killChildOnProcessExit({ context });
	};
};

const attachExecutionListeners = ({ context }) => {
	for (const signal of FORWARDED_SIGNALS) {
		const listener = createSignalListener({ context, signal });
		context.signalListeners.set(signal, listener);
		process.on(signal, listener);
	}

	context.processExitListener = createProcessExitListener({ context });
	process.on(PROCESS_EXIT_EVENT, context.processExitListener);
};

const removeExecutionListeners = ({ context }) => {
	for (const [signal, listener] of context.signalListeners) {
		process.removeListener(signal, listener);
	}
	context.signalListeners.clear();

	if (context.processExitListener !== null) {
		process.removeListener(PROCESS_EXIT_EVENT, context.processExitListener);
		context.processExitListener = null;
	}

	if (context.childExitListener !== null) {
		context.child.removeListener(CHILD_EXIT_EVENT, context.childExitListener);
		context.childExitListener = null;
	}

	if (context.childErrorListener !== null) {
		context.child.removeListener(CHILD_ERROR_EVENT, context.childErrorListener);
		context.childErrorListener = null;
	}
};

const cleanupExecution = ({ context }) => {
	context.settled = true;
	clearForcedTerminationTimer({ context });
	removeExecutionListeners({ context });
};

const resolveExecutionSignal = ({ context, signal }) => {
	if (context.forwardedSignal !== null) {
		return context.forwardedSignal;
	}

	return signal ?? null;
};

const finishExecution = ({ context, exitCode, signal }) => {
	if (context.settled) {
		return;
	}

	cleanupExecution({ context });
	context.resolve({
		exitCode: exitCode ?? null,
		signal: resolveExecutionSignal({ context, signal }),
	});
};

const failExecution = ({ context, error }) => {
	if (context.settled) {
		return;
	}

	cleanupExecution({ context });
	context.reject(error);
};

const createChildExitListener = ({ context }) => {
	return (exitCode, signal) => {
		finishExecution({ context, exitCode, signal });
	};
};

const createChildErrorListener = ({ context }) => {
	return (error) => {
		failExecution({ context, error });
	};
};

const runExecutable = ({
	executablePath,
	spawn: runSpawn = spawn,
	forcedTerminationTimeoutMilliseconds = FORCED_TERMINATION_TIMEOUT_MILLISECONDS,
}) => {
	return new Promise((resolve, reject) => {
		const child = runSpawn(executablePath, [], {
			stdio: INHERITED_STDIO,
			detached: DETACHED_CHILD,
		});
		const context = createExecutionContext({
			child,
			resolve,
			reject,
			forcedTerminationTimeoutMilliseconds,
		});

		context.childExitListener = createChildExitListener({ context });
		context.childErrorListener = createChildErrorListener({ context });
		attachExecutionListeners({ context });
		child.on(CHILD_EXIT_EVENT, context.childExitListener);
		child.on(CHILD_ERROR_EVENT, context.childErrorListener);
	});
};

export const execute = ({
	outputDir,
	projectName,
	spawn: runSpawn = spawn,
	forcedTerminationTimeoutMilliseconds = FORCED_TERMINATION_TIMEOUT_MILLISECONDS,
}) => {
	const executablePath = resolveExecutablePath({ outputDir, projectName });

	if (!existsSync(executablePath)) {
		throw new Error(buildExecutableNotFoundMessage({ executablePath }));
	}

	return runExecutable({
		executablePath,
		spawn: runSpawn,
		forcedTerminationTimeoutMilliseconds,
	});
};
