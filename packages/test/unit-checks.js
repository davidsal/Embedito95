import {
	appendSerialData,
	clearSelection,
	createWindowBuffer,
	finishSelection,
	setSelectionAnchor,
	updateSelection,
} from "../cli/src/commands/monitor/serial-window-state.js";
import {
	MONITOR_STATE_CONTENT_HEIGHT,
	MONITOR_STATE_WINDOW_CAPACITY,
} from "./constants.js";
import { expectEqual } from "./reporting.js";

const checkPartialChunks = () => {
	const checks = [];

	const partialBuffer = createWindowBuffer();
	appendSerialData(partialBuffer, "incomplete");
	checks.push(
		expectEqual(
			"append keeps incomplete chunk in partial",
			partialBuffer.partial,
			"incomplete",
		),
	);
	checks.push(
		expectEqual(
			"append does not add a line for incomplete chunk",
			partialBuffer.lines.length,
			0,
		),
	);

	const chunkBuffer = createWindowBuffer();
	appendSerialData(chunkBuffer, "par");
	appendSerialData(chunkBuffer, "tial\n");
	checks.push(
		expectEqual(
			"append joins partial chunk across writes",
			chunkBuffer.lines.join("|"),
			"partial",
		),
	);

	const completeLineBuffer = createWindowBuffer();
	appendSerialData(completeLineBuffer, "first\nsecond\n");
	checks.push(
		expectEqual(
			"append splits complete lines",
			completeLineBuffer.lines.join("|"),
			"first|second",
		),
	);
	checks.push(
		expectEqual(
			"append clears partial after newline",
			completeLineBuffer.partial,
			"",
		),
	);

	const carriageReturnBuffer = createWindowBuffer();
	appendSerialData(carriageReturnBuffer, "windows\r\n");
	checks.push(
		expectEqual(
			"append strips trailing carriage return",
			carriageReturnBuffer.lines[0],
			"windows",
		),
	);

	return checks;
};

const checkLineTrim = () => {
	const checks = [];

	const wrapBuffer = createWindowBuffer(MONITOR_STATE_WINDOW_CAPACITY);
	appendSerialData(wrapBuffer, "one\ntwo\nthree\nfour\n");
	checks.push(
		expectEqual(
			"append trims lines to max capacity",
			wrapBuffer.lines.join("|"),
			"two|three|four",
		),
	);
	checks.push(
		expectEqual(
			"append trims line times with lines",
			wrapBuffer.lineTimes.length,
			MONITOR_STATE_WINDOW_CAPACITY,
		),
	);

	return checks;
};

const checkSelectionRanges = () => {
	const checks = [];

	const singleColumnBuffer = createWindowBuffer();
	appendSerialData(singleColumnBuffer, "abcdef\n");
	setSelectionAnchor(singleColumnBuffer, 0, 2, MONITOR_STATE_CONTENT_HEIGHT);
	updateSelection(singleColumnBuffer, 0, 2, MONITOR_STATE_CONTENT_HEIGHT);
	checks.push(
		expectEqual(
			"selection of a single column",
			finishSelection(singleColumnBuffer),
			"c",
		),
	);

	const forwardBuffer = createWindowBuffer();
	appendSerialData(forwardBuffer, "abcdefgh\n");
	setSelectionAnchor(forwardBuffer, 0, 2, MONITOR_STATE_CONTENT_HEIGHT);
	updateSelection(forwardBuffer, 0, 5, MONITOR_STATE_CONTENT_HEIGHT);
	checks.push(
		expectEqual(
			"forward selection extracts inclusive range",
			finishSelection(forwardBuffer),
			"cdef",
		),
	);
	checks.push(
		expectEqual(
			"finish selection deactivates the selection",
			forwardBuffer.selection.active,
			false,
		),
	);

	const backwardBuffer = createWindowBuffer();
	appendSerialData(backwardBuffer, "abcdefgh\n");
	setSelectionAnchor(backwardBuffer, 0, 5, MONITOR_STATE_CONTENT_HEIGHT);
	updateSelection(backwardBuffer, 0, 2, MONITOR_STATE_CONTENT_HEIGHT);
	checks.push(
		expectEqual(
			"backward selection extracts the same inclusive range",
			finishSelection(backwardBuffer),
			"cdef",
		),
	);

	const multiLineBuffer = createWindowBuffer();
	appendSerialData(multiLineBuffer, "abcdef\nghijkl\nmnopqr\n");
	setSelectionAnchor(multiLineBuffer, 0, 3, MONITOR_STATE_CONTENT_HEIGHT);
	updateSelection(multiLineBuffer, 2, 1, MONITOR_STATE_CONTENT_HEIGHT);
	checks.push(
		expectEqual(
			"multi line selection spans complete middle lines",
			finishSelection(multiLineBuffer),
			"def\nghijkl\nmn",
		),
	);

	return checks;
};

const checkSelectionLifecycle = () => {
	const checks = [];

	const clearBuffer = createWindowBuffer();
	appendSerialData(clearBuffer, "abcdef\n");
	setSelectionAnchor(clearBuffer, 0, 1, MONITOR_STATE_CONTENT_HEIGHT);
	updateSelection(clearBuffer, 0, 4, MONITOR_STATE_CONTENT_HEIGHT);
	clearSelection(clearBuffer);
	checks.push(
		expectEqual(
			"clear selection deactivates the selection",
			clearBuffer.selection.active,
			false,
		),
	);
	checks.push(
		expectEqual(
			"finish after clear returns empty text",
			finishSelection(clearBuffer),
			"",
		),
	);

	const inactiveBuffer = createWindowBuffer();
	appendSerialData(inactiveBuffer, "abcdef\n");
	updateSelection(inactiveBuffer, 0, 4, MONITOR_STATE_CONTENT_HEIGHT);
	checks.push(
		expectEqual(
			"update without an anchor keeps selection inactive",
			inactiveBuffer.selection.active,
			false,
		),
	);
	checks.push(
		expectEqual(
			"finish without an anchor returns empty text",
			finishSelection(inactiveBuffer),
			"",
		),
	);

	const appendSelectionBuffer = createWindowBuffer();
	appendSerialData(appendSelectionBuffer, "abcdef\n");
	setSelectionAnchor(appendSelectionBuffer, 0, 1, MONITOR_STATE_CONTENT_HEIGHT);
	appendSerialData(appendSelectionBuffer, "next\n");
	checks.push(
		expectEqual(
			"appending complete lines deactivates the selection",
			appendSelectionBuffer.selection.active,
			false,
		),
	);

	return checks;
};

export const runMonitorStateChecks = () => {
	return [
		...checkPartialChunks(),
		...checkLineTrim(),
		...checkSelectionRanges(),
		...checkSelectionLifecycle(),
	];
};
