// Interactive progress for `test:compile`. It keeps one block with a line per
// test of the category being compiled: active lines show a spinner and finished
// lines are replaced in place by their final formatted line. The block is only
// written to an interactive terminal (TTY); piped/CI output never gets spinner
// frames or ANSI escape sequences and keeps the deterministic grouped report.
import { clearInterval, setInterval } from "node:timers";
import {
	COMPILE_TEST_INDENTATION,
	NO_SPINNER_ENVIRONMENT_KEY,
} from "./constants.js";

export const SPINNER_FRAMES = [
	"⠋",
	"⠙",
	"⠹",
	"⠸",
	"⠼",
	"⠴",
	"⠦",
	"⠧",
	"⠇",
	"⠏",
];
export const SPINNER_INTERVAL_MILLISECONDS = 80;
export const CLEAR_LINE_SEQUENCE = "\r\u001b[2K";
export const COMPILE_PROGRESS_LINE_STATUS = {
	pending: "pending",
	active: "active",
	finished: "finished",
};

const FRAME_SEPARATOR = " ";
const INITIAL_FRAME_INDEX = 0;
const EMPTY_LINE_COUNT = 0;
const DEFAULT_TIMERS = { setInterval, clearInterval };

export const isCompileProgressEnabled = ({ stream, environment }) => {
	return (
		Boolean(stream.isTTY) &&
		environment[NO_SPINNER_ENVIRONMENT_KEY] === undefined
	);
};

export const formatCursorUpSequence = (lineCount) => {
	return `\u001b[${lineCount}A`;
};

export const formatActiveProgressLine = ({ frame, name }) => {
	return `${COMPILE_TEST_INDENTATION}${frame}${FRAME_SEPARATOR}${name}`;
};

export const createCompileProgress = ({
	stream = process.stdout,
	environment = process.env,
	timers = DEFAULT_TIMERS,
} = {}) => {
	return {
		enabled: isCompileProgressEnabled({ stream, environment }),
		stream,
		timers,
		frameIndex: INITIAL_FRAME_INDEX,
		lines: [],
		renderedLineCount: EMPTY_LINE_COUNT,
		intervalHandle: null,
	};
};

const writeProgressText = ({ progress, text }) => {
	progress.stream.write(text);
};

const resolveNextFrame = (progress) => {
	const frame = SPINNER_FRAMES[progress.frameIndex % SPINNER_FRAMES.length];
	progress.frameIndex = (progress.frameIndex + 1) % SPINNER_FRAMES.length;
	return frame;
};

const createProgressLine = ({ label, name }) => {
	return {
		label,
		name: name ?? label,
		status: COMPILE_PROGRESS_LINE_STATUS.pending,
		text: null,
	};
};

const findProgressLine = ({ progress, label }) => {
	return progress.lines.find((line) => {
		return line.label === label;
	});
};

const isVisibleProgressLine = (line) => {
	return line.status !== COMPILE_PROGRESS_LINE_STATUS.pending;
};

const formatFinishedProgressLine = (line) => {
	return line.text ?? line.name;
};

const resolveTerminalLines = ({ line, frame }) => {
	if (line.status === COMPILE_PROGRESS_LINE_STATUS.active) {
		return [formatActiveProgressLine({ frame, name: line.name })];
	}

	return formatFinishedProgressLine(line).split("\n");
};

const collectVisibleTerminalLines = ({ progress, frame }) => {
	return progress.lines.filter(isVisibleProgressLine).flatMap((line) => {
		return resolveTerminalLines({ line, frame });
	});
};

const resolveCursorUpText = (progress) => {
	if (progress.renderedLineCount === EMPTY_LINE_COUNT) {
		return "";
	}

	return formatCursorUpSequence(progress.renderedLineCount);
};

const renderProgressBlock = (progress) => {
	if (!progress.enabled) {
		return;
	}

	const frame = resolveNextFrame(progress);
	const terminalLines = collectVisibleTerminalLines({ progress, frame });

	if (terminalLines.length === EMPTY_LINE_COUNT) {
		return;
	}

	const renderedLines = terminalLines
		.map((terminalLine) => {
			return `${CLEAR_LINE_SEQUENCE}${terminalLine}\n`;
		})
		.join("");
	const cursorUpText = resolveCursorUpText(progress);
	progress.renderedLineCount = terminalLines.length;
	writeProgressText({
		progress,
		text: `${cursorUpText}${renderedLines}`,
	});
};

const clearProgressInterval = (progress) => {
	if (progress.intervalHandle === null) {
		return;
	}

	progress.timers.clearInterval(progress.intervalHandle);
	progress.intervalHandle = null;
};

const ensureProgressInterval = (progress) => {
	if (progress.intervalHandle !== null) {
		return;
	}

	progress.intervalHandle = progress.timers.setInterval(
		renderProgressBlock,
		SPINNER_INTERVAL_MILLISECONDS,
		progress,
	);
};

export const beginCompileProgressSection = ({ progress, entries }) => {
	if (!progress?.enabled) {
		return;
	}

	progress.lines = entries.map(createProgressLine);
	progress.renderedLineCount = EMPTY_LINE_COUNT;
};

export const startCompileProgress = ({ progress, label }) => {
	if (!progress?.enabled) {
		return;
	}

	const line = findProgressLine({ progress, label });

	if (line) {
		line.status = COMPILE_PROGRESS_LINE_STATUS.active;
	} else {
		progress.lines.push(
			createProgressLine({
				label,
				name: label,
			}),
		);
	}

	renderProgressBlock(progress);
	ensureProgressInterval(progress);
};

export const finishCompileProgress = ({ progress, label, text }) => {
	if (!progress?.enabled) {
		return;
	}

	const line = findProgressLine({ progress, label });

	if (!line) {
		return;
	}

	line.status = COMPILE_PROGRESS_LINE_STATUS.finished;
	line.text = text ?? line.name;
	renderProgressBlock(progress);
};

export const commitCompileProgressSection = (progress) => {
	if (!progress?.enabled) {
		return;
	}

	clearProgressInterval(progress);
	renderProgressBlock(progress);
	progress.lines = [];
	progress.renderedLineCount = EMPTY_LINE_COUNT;
};

export const stopCompileProgress = (progress) => {
	if (!progress?.enabled) {
		return;
	}

	clearProgressInterval(progress);
	progress.lines = [];
	progress.renderedLineCount = EMPTY_LINE_COUNT;
};
