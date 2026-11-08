import { spawn } from "node:child_process";
import { closeSync, openSync, writeSync } from "node:fs";
import { platform } from "node:os";
import { stdin, stdout } from "node:process";
import {
	green,
	red,
	setRawMode,
	writeErrorLine,
	writeLine,
} from "../../console.js";
import {
	ARROW_DOWN_SEQUENCE,
	ARROW_UP_SEQUENCE,
	CLEAR_KEY,
	COPIED_MESSAGE,
	COPY_MESSAGE_DURATION_MS,
	CTRL_C,
	DD_COMMAND,
	DEFAULT_COLUMNS,
	DEFAULT_ROWS,
	ESCAPE,
	KILL_SIGNAL,
	MOUSE_COORDINATE_MIN,
	MOUSE_LEFT_BUTTON,
	MOUSE_MOTION_FLAG,
	MOUSE_WHEEL_DOWN,
	MOUSE_WHEEL_DOWN_LEGACY,
	MOUSE_WHEEL_UP,
	MOUSE_WHEEL_UP_LEGACY,
	SETTLING_DURATION_MS,
	SGR_MOUSE_PREFIX,
	SGR_MOUSE_REGEX,
	SGR_PRESS_SUFFIX,
	SGR_RELEASE_SUFFIX,
	TIME_KEY,
} from "../../constants.js";
import { configurePort, flushInputBuffer, setBaudRate } from "./serial-port.js";
import {
	enterWindowMode,
	leaveWindowMode,
	renderWindow,
} from "./serial-window.js";
import {
	appendSerialData,
	clearSelection,
	clearWindowBuffer,
	createWindowBuffer,
	finishSelection,
	scrollWindow,
	setMessage,
	setSelectionAnchor,
	toggleTime,
	updateSelection,
} from "./serial-window-state.js";

const finishSession = (session) => {
	if (!session.running) {
		return;
	}
	session.running = false;
	stdin.removeAllListeners("data");
	setRawMode(false);
	leaveWindowMode();
	session.reader.kill(KILL_SIGNAL);
	try {
		closeSync(session.fileDescriptor);
	} catch {}
	session.resolve();
};

const redrawWindow = (windowBuffer) => {
	stdout.write(
		renderWindow(
			windowBuffer,
			stdout.columns ?? DEFAULT_COLUMNS,
			stdout.rows ?? DEFAULT_ROWS,
		),
	);
};

const scrollByDirection = (windowBuffer, direction) => {
	const contentHeight = Math.max(0, (stdout.rows ?? DEFAULT_ROWS) - 2);
	scrollWindow(windowBuffer, direction, contentHeight);
	redrawWindow(windowBuffer);
};

const parseSgrMouseEvent = (input) => {
	if (!input.startsWith(SGR_MOUSE_PREFIX)) {
		return null;
	}
	const body = input.slice(SGR_MOUSE_PREFIX.length);
	const match = body.match(SGR_MOUSE_REGEX);
	if (!match) {
		return null;
	}
	const [buttonText, rowText, columnText] = match[0].slice(1, -1).split(";");
	const button = Number(buttonText);
	const row = Number(rowText);
	const column = Number(columnText);
	const suffix = match[0].slice(-1);
	return { button, row, column, suffix };
};

const isWheelEvent = (event) => {
	return (
		event.button === MOUSE_WHEEL_UP ||
		event.button === MOUSE_WHEEL_DOWN ||
		event.button === MOUSE_WHEEL_UP_LEGACY ||
		event.button === MOUSE_WHEEL_DOWN_LEGACY
	);
};

const wheelDirection = (event) => {
	if (
		event.button === MOUSE_WHEEL_UP ||
		event.button === MOUSE_WHEEL_UP_LEGACY
	) {
		return 1;
	}
	return -1;
};

const isSelectionEvent = (event) => {
	return (event.button & ~MOUSE_MOTION_FLAG) === MOUSE_LEFT_BUTTON;
};

const clipboardCommandFor = (osPlatform) => {
	return osPlatform === "darwin" ? "pbcopy" : "xclip";
};

const clipboardArgsFor = (osPlatform) => {
	return osPlatform === "darwin" ? [] : ["-selection", "clipboard"];
};

const clipboardText = (text) => {
	const child = spawn(
		clipboardCommandFor(platform()),
		clipboardArgsFor(platform()),
		{
			stdio: ["pipe", "ignore", "ignore"],
		},
	);
	child.on("error", () => {});
	child.stdin.write(text);
	child.stdin.end();
};

const contentCoordinates = (row, column) => {
	return {
		row: row - MOUSE_COORDINATE_MIN,
		column: column - MOUSE_COORDINATE_MIN,
	};
};

const handleMouseEvent = (windowBuffer, event) => {
	const contentHeight = Math.max(0, (stdout.rows ?? DEFAULT_ROWS) - 2);
	if (isWheelEvent(event)) {
		scrollByDirection(windowBuffer, wheelDirection(event));
		return;
	}
	if (!isSelectionEvent(event)) {
		return;
	}

	const { row, column } = contentCoordinates(event.row, event.column);
	if (row < 0 || row >= contentHeight) {
		return;
	}

	if (event.suffix === SGR_PRESS_SUFFIX && event.button === MOUSE_LEFT_BUTTON) {
		setSelectionAnchor(windowBuffer, row, column, contentHeight);
		redrawWindow(windowBuffer);
		return;
	}
	if (event.suffix === SGR_PRESS_SUFFIX && event.button & MOUSE_MOTION_FLAG) {
		updateSelection(windowBuffer, row, column, contentHeight);
		redrawWindow(windowBuffer);
		return;
	}
	if (event.suffix === SGR_RELEASE_SUFFIX) {
		const text = finishSelection(windowBuffer);
		redrawWindow(windowBuffer);
		if (text) {
			clipboardText(text);
			setMessage(windowBuffer, COPIED_MESSAGE);
			redrawWindow(windowBuffer);
			setTimeout(() => {
				setMessage(windowBuffer, "");
				clearSelection(windowBuffer);
				redrawWindow(windowBuffer);
			}, COPY_MESSAGE_DURATION_MS);
		}
		return;
	}
};

const handleInput = (windowBuffer, fileDescriptor, session, chunk) => {
	const input = chunk.toString();
	const mouseEvent = parseSgrMouseEvent(input);
	if (mouseEvent) {
		handleMouseEvent(windowBuffer, mouseEvent);
		return;
	}
	if (input.includes(ARROW_UP_SEQUENCE)) {
		scrollByDirection(windowBuffer, 1);
		return;
	}
	if (input.includes(ARROW_DOWN_SEQUENCE)) {
		scrollByDirection(windowBuffer, -1);
		return;
	}
	if (
		input === CTRL_C ||
		(chunk.length === 1 && chunk[0] === ESCAPE.charCodeAt(0))
	) {
		finishSession(session);
		return;
	}
	if (input.toLowerCase() === CLEAR_KEY) {
		clearWindowBuffer(windowBuffer);
		redrawWindow(windowBuffer);
		return;
	}
	if (input.toLowerCase() === TIME_KEY) {
		toggleTime(windowBuffer);
		redrawWindow(windowBuffer);
		return;
	}
	try {
		writeSync(fileDescriptor, chunk);
	} catch {}
};

const handleSerialData = (windowBuffer, session, chunk) => {
	const elapsed = Date.now() - session.openedAt;
	if (elapsed >= SETTLING_DURATION_MS) {
		appendSerialData(windowBuffer, chunk);
		redrawWindow(windowBuffer);
	}
};

const openPort = (port, baudRate) => {
	const fileDescriptor = openSync(port, "r+");
	try {
		configurePort(port);
		setBaudRate(fileDescriptor, port, baudRate);
		flushInputBuffer(fileDescriptor);
	} catch (error) {
		try {
			closeSync(fileDescriptor);
		} catch {}
		throw error;
	}
	return fileDescriptor;
};

const openPortOrReject = (port, baudRate, reject) => {
	try {
		return openPort(port, baudRate);
	} catch (error) {
		reject(error);
		return null;
	}
};

const wireSessionEvents = (session, buffer, fileDescriptor) => {
	session.reader.on("error", (error) => {
		finishSession(session);
		writeErrorLine(`${red("✖")} Monitor error: ${error.message}`);
		process.exit(1);
	});

	session.reader.on("close", () => {
		finishSession(session);
	});

	setRawMode(true);
	stdin.on("data", (chunk) => {
		handleInput(buffer, fileDescriptor, session, chunk);
	});

	session.reader.stdout.on("data", (chunk) => {
		handleSerialData(buffer, session, chunk);
	});

	process.once("SIGINT", () => {
		finishSession(session);
	});
	process.once("SIGTERM", () => {
		finishSession(session);
	});
};

const startMonitorSession = ({ port, baudRate, resolve, reject }) => {
	const fileDescriptor = openPortOrReject(port, baudRate, reject);
	if (fileDescriptor === null) {
		return;
	}

	const reader = spawn(DD_COMMAND, ["bs=1"], {
		stdio: [fileDescriptor, "pipe", "ignore"],
	});

	const buffer = createWindowBuffer();

	writeLine(`${green("✔")} Connected to ${port} @ ${baudRate} baud.`);
	enterWindowMode();
	redrawWindow(buffer);

	const session = {
		fileDescriptor,
		reader,
		resolve,
		running: true,
		openedAt: Date.now(),
	};

	wireSessionEvents(session, buffer, fileDescriptor);
};

export const openSerialMonitor = ({ port, baudRate }) => {
	return new Promise((resolve, reject) => {
		if (platform() === "win32") {
			reject(new Error("Serial monitor is not supported on Windows yet"));
			return;
		}
		startMonitorSession({ port, baudRate, resolve, reject });
	});
};
