// Regression for CLI tool failures losing their real diagnostic. Some tools
// (`arduino-cli compile --json`) write the error text to stdout and exit
// non-zero, so the old `runTool` message only showed `exit code 1`. The failure
// must carry the actual output for both streams, keep the successful return
// value unchanged, and trim very long output.
import { shared } from "embedito95-core";
import { NODE_EXECUTABLE } from "./constants.js";
import { expectEqual } from "./reporting.js";

const FAILURE_LINE = "error: the real cause";
const FALLBACK_LINE = "plain fallback detail";
const MULTILINE_FAILURE_SOURCE = [
	`process.stderr.write("starting\\n${FAILURE_LINE}\\n done\\n")`,
	"process.exit(1)",
].join(";");
const STDOUT_JSON_FAILURE_SOURCE = [
	`process.stdout.write(JSON.stringify([{ text: "${FAILURE_LINE}" }]))`,
	"process.exit(2)",
].join(";");
const NO_ERROR_MARKER_FAILURE_SOURCE = [
	`process.stdout.write("${FALLBACK_LINE}")`,
	"process.exit(3)",
].join(";");
const SUCCESS_SOURCE = 'process.stdout.write("tool output")';
const LONG_OUTPUT_MAX_LINES = 30;

const runFailingTool = async (source) => {
	try {
		await shared.runTool(NODE_EXECUTABLE, ["-e", source]);
		return null;
	} catch (error) {
		return error.message;
	}
};

const checkStderrFailure = async () => {
	const message = await runFailingTool(MULTILINE_FAILURE_SOURCE);
	return [
		expectEqual(
			"failure message includes the real stderr cause",
			Boolean(message?.includes(FAILURE_LINE)),
			true,
		),
		expectEqual(
			"failure message includes the executed command",
			Boolean(message?.includes(NODE_EXECUTABLE)),
			true,
		),
		expectEqual(
			"failure message keeps the exit code",
			Boolean(message?.includes("exit code 1")),
			true,
		),
		expectEqual(
			"failure message is not only the exit code",
			message !== `"${NODE_EXECUTABLE}" failed with exit code 1`,
			true,
		),
	];
};

const checkStdoutJsonFailure = async () => {
	const message = await runFailingTool(STDOUT_JSON_FAILURE_SOURCE);
	return [
		expectEqual(
			"failure message falls back to stdout like --json",
			Boolean(message?.includes(FAILURE_LINE)),
			true,
		),
		expectEqual(
			"stdout failure message keeps its exit code",
			Boolean(message?.includes("exit code 2")),
			true,
		),
	];
};

const checkFallbackWithoutErrorMarker = async () => {
	const message = await runFailingTool(NO_ERROR_MARKER_FAILURE_SOURCE);
	return [
		expectEqual(
			"failure without an error marker keeps the last output lines",
			Boolean(message?.includes(FALLBACK_LINE)),
			true,
		),
	];
};

const buildLongOutput = () => {
	const lines = [];
	for (let index = 0; index < LONG_OUTPUT_MAX_LINES + 10; index += 1) {
		lines.push(`line ${index} error: cause ${index}`);
	}
	return lines.join("\n");
};

const checkFormatToolFailureTrimsLongOutput = () => {
	const message = shared.formatToolFailure({
		command: "tool",
		args: ["--flag"],
		code: 1,
		stdout: buildLongOutput(),
	});
	const lines = message.split("\n");
	return [
		expectEqual(
			"formatted failure includes command args",
			Boolean(message.includes('"tool --flag"')),
			true,
		),
		expectEqual(
			"formatted failure caps the number of lines",
			lines.length <= LONG_OUTPUT_MAX_LINES + 2,
			true,
		),
		expectEqual(
			"formatted failure reports truncation",
			Boolean(message.includes("more error line(s)")),
			true,
		),
	];
};

const checkSuccessfulCommandReturnsStdout = async () => {
	const output = await shared.runTool(NODE_EXECUTABLE, ["-e", SUCCESS_SOURCE], {
		capture: true,
	});
	return [
		expectEqual(
			"successful command returns its stdout unchanged",
			output,
			"tool output",
		),
	];
};

export const runToolingChecks = async () => {
	const results = [
		...(await checkStderrFailure()),
		...(await checkStdoutJsonFailure()),
		...(await checkFallbackWithoutErrorMarker()),
		...checkFormatToolFailureTrimsLongOutput(),
		...(await checkSuccessfulCommandReturnsStdout()),
	];
	return results;
};
