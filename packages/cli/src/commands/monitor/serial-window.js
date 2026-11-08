import { stdout } from "node:process";
import {
	ANSI_CODE_PATTERN,
	CLEAR_SCREEN,
	CONTROL_CHARACTERS_PATTERN,
	CURSOR_HOME,
	CURSOR_TOP_LEFT,
	DISABLE_MOUSE_TRACKING,
	DISABLE_SGR_MOUSE,
	ENABLE_MOUSE_TRACKING,
	ENABLE_SGR_MOUSE,
	ENTER_ALTERNATE_SCREEN,
	HIDE_CURSOR,
	LEAVE_ALTERNATE_SCREEN,
	SHOW_CURSOR,
	STATUS_BAR_BINDINGS,
	STATUS_BAR_SEPARATOR,
	STYLE_CYAN,
	STYLE_DESCRIPTION,
	STYLE_KEY,
	STYLE_RESET,
	STYLE_SELECTED,
	TIME_LENGTH,
	TIME_SEPARATOR,
	TITLE_APP_NAME,
	TITLE_FEATURE_NAME,
} from "../../constants.js";
import {
	contentStartIndex,
	selectionColumnRange,
	selectionRowRange,
} from "./serial-window-state.js";

const visibleWidth = (text) => {
	const stripped = text.replace(ANSI_CODE_PATTERN, "");
	return stripped.length;
};

const sanitizeLine = (line) => {
	return line.replace(CONTROL_CHARACTERS_PATTERN, "");
};

const padTimePart = (value) => {
	return String(value).padStart(2, "0");
};

const formatTime = (timestamp) => {
	const date = new Date(timestamp);
	const hours = padTimePart(date.getHours());
	const minutes = padTimePart(date.getMinutes());
	const seconds = padTimePart(date.getSeconds());
	return `${hours}${TIME_SEPARATOR}${minutes}${TIME_SEPARATOR}${seconds}`;
};

const truncateToWidth = (line, columns) => {
	if (visibleWidth(line) <= columns) {
		return line;
	}

	let result = "";
	let width = 0;
	let lastIndex = 0;
	for (const match of line.matchAll(ANSI_CODE_PATTERN)) {
		const plainPart = line.slice(lastIndex, match.index);
		const available = columns - width;
		if (plainPart.length > available) {
			result += plainPart.slice(0, available);
			result += STYLE_RESET;
			return result;
		}
		result += plainPart;
		width += plainPart.length;
		result += match[0];
		lastIndex = match.index + match[0].length;
	}

	const trailing = line.slice(lastIndex);
	const available = columns - width;
	if (trailing.length > available) {
		result += trailing.slice(0, available);
		result += STYLE_RESET;
		return result;
	}
	return result + trailing;
};

const padLine = (line, columns) => {
	const width = visibleWidth(line);
	if (width >= columns) {
		return line;
	}
	return line + " ".repeat(columns - width);
};

const renderKeyBinding = ({ key, description }) => {
	return `${STYLE_KEY}${key}${STYLE_RESET} ${STYLE_DESCRIPTION}${description}${STYLE_RESET}`;
};

const renderStatusBar = (columns) => {
	const bindings =
		STATUS_BAR_BINDINGS.map(renderKeyBinding).join(STATUS_BAR_SEPARATOR);
	const title = `${STYLE_CYAN}${TITLE_APP_NAME} ${TITLE_FEATURE_NAME}${STYLE_RESET}`;
	const separator = bindings ? `   ${bindings}` : "";
	return padLine(truncateToWidth(`${title}${separator}`, columns), columns);
};

const applySelection = (line, lineIndex, selection) => {
	if (!selection.active) {
		return line;
	}
	const { topRow, bottomRow } = selectionRowRange(selection);
	if (lineIndex < topRow || lineIndex > bottomRow) {
		return line;
	}

	const { start, end } = selectionColumnRange(
		selection,
		topRow,
		bottomRow,
		lineIndex,
		line.length,
	);
	if (start >= end) {
		return line;
	}

	const prefix = line.slice(0, start);
	const selected = line.slice(start, end);
	const suffix = line.slice(end);
	return `${prefix}${STYLE_SELECTED}${selected}${STYLE_RESET}${suffix}`;
};

const renderTimePrefix = (buffer, lineIndex) => {
	if (!buffer.showTime) {
		return "";
	}
	const timestamp = buffer.lineTimes[lineIndex] ?? 0;
	return `${STYLE_CYAN}${formatTime(timestamp)}${STYLE_RESET} `;
};

const renderLine = (buffer, lineIndex, columns) => {
	const rawLine = buffer.lines[lineIndex] ?? "";
	const sanitized = sanitizeLine(rawLine);
	if (sanitized === "") {
		return " ".repeat(columns);
	}
	const styled = applySelection(sanitized, lineIndex, buffer.selection);

	if (buffer.showTime) {
		const contentWidth = Math.max(0, columns - TIME_LENGTH);
		const truncated = truncateToWidth(styled, contentWidth);
		const padded = padLine(truncated, contentWidth);
		return `${renderTimePrefix(buffer, lineIndex)}${padded}`;
	}

	const padded = padLine(truncateToWidth(styled, columns), columns);
	return padded;
};

const renderMessage = (buffer) => {
	if (!buffer.message) {
		return "";
	}
	return `${CURSOR_TOP_LEFT}${STYLE_CYAN}${buffer.message}${STYLE_RESET}`;
};

export const renderWindow = (buffer, columns, rows) => {
	const lines = buffer.lines;
	const contentHeight = Math.max(0, rows - 2);
	const contentStart = contentStartIndex(
		lines,
		buffer.scrollOffset,
		contentHeight,
	);

	const contentRows = Array.from({ length: contentHeight }, (_, index) => {
		return renderLine(buffer, contentStart + index, columns);
	});

	const frame =
		CURSOR_HOME +
		CLEAR_SCREEN +
		contentRows.join("\n") +
		"\n" +
		" ".repeat(columns) +
		"\n" +
		renderStatusBar(columns) +
		renderMessage(buffer);

	return frame;
};

export const enterWindowMode = () => {
	stdout.write(ENTER_ALTERNATE_SCREEN);
	stdout.write(HIDE_CURSOR);
	stdout.write(ENABLE_MOUSE_TRACKING);
	stdout.write(ENABLE_SGR_MOUSE);
};

export const leaveWindowMode = () => {
	stdout.write(SHOW_CURSOR);
	stdout.write(DISABLE_MOUSE_TRACKING);
	stdout.write(DISABLE_SGR_MOUSE);
	stdout.write(LEAVE_ALTERNATE_SCREEN);
};
