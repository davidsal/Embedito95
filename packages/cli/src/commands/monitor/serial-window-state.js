import { UTF8 } from "embedito95-core";
import { DEFAULT_MAX_LINES } from "../../constants.js";

export const createWindowBuffer = (maxLines = DEFAULT_MAX_LINES) => {
	return {
		lines: [],
		lineTimes: [],
		partial: "",
		maxLines,
		scrollOffset: 0,
		message: "",
		showTime: false,
		selection: {
			active: false,
			anchorRow: -1,
			anchorColumn: -1,
			row: -1,
			column: -1,
		},
	};
};

export const contentStartIndex = (lines, scrollOffset, contentHeight) => {
	const maxOffset = Math.max(0, lines.length - contentHeight);
	const offset = Math.min(scrollOffset, maxOffset);
	const endIndex = lines.length - offset;
	return Math.max(0, endIndex - contentHeight);
};

export const selectionRowRange = (selection) => {
	const topRow = Math.min(selection.anchorRow, selection.row);
	const bottomRow = Math.max(selection.anchorRow, selection.row);
	return { topRow, bottomRow };
};

const resolveSelectionRange = (
	selection,
	topRow,
	bottomRow,
	lineIndex,
	lineLength,
) => {
	const topColumn =
		selection.anchorRow <= selection.row
			? selection.anchorColumn
			: selection.column;
	const bottomColumn =
		selection.anchorRow <= selection.row
			? selection.column
			: selection.anchorColumn;

	if (topRow === bottomRow) {
		return {
			start: Math.min(topColumn, bottomColumn),
			end: Math.max(topColumn, bottomColumn) + 1,
		};
	}
	if (lineIndex === topRow) {
		return { start: topColumn, end: lineLength };
	}
	if (lineIndex === bottomRow) {
		return { start: 0, end: bottomColumn + 1 };
	}
	return { start: 0, end: lineLength };
};

export const selectionColumnRange = (
	selection,
	topRow,
	bottomRow,
	lineIndex,
	lineLength,
) => {
	const { start, end } = resolveSelectionRange(
		selection,
		topRow,
		bottomRow,
		lineIndex,
		lineLength,
	);
	const clampedStart = Math.max(0, Math.min(start, lineLength));
	const clampedEnd = Math.max(clampedStart, Math.min(end, lineLength));
	return { start: clampedStart, end: clampedEnd };
};

const clampScrollOffset = (buffer, contentHeight) => {
	const maxOffset = Math.max(0, buffer.lines.length - contentHeight);
	if (buffer.scrollOffset > maxOffset) {
		buffer.scrollOffset = maxOffset;
	}
	if (buffer.scrollOffset < 0) {
		buffer.scrollOffset = 0;
	}
};

export const scrollWindow = (buffer, direction, contentHeight) => {
	buffer.scrollOffset += direction;
	clampScrollOffset(buffer, contentHeight);
	buffer.selection.active = false;
};

export const setSelectionAnchor = (buffer, row, column, contentHeight) => {
	const contentStart = contentStartIndex(
		buffer.lines,
		buffer.scrollOffset,
		contentHeight,
	);
	buffer.selection = {
		active: true,
		anchorRow: contentStart + row,
		anchorColumn: column,
		row: contentStart + row,
		column,
	};
};

export const updateSelection = (buffer, row, column, contentHeight) => {
	if (!buffer.selection.active) {
		return;
	}
	const contentStart = contentStartIndex(
		buffer.lines,
		buffer.scrollOffset,
		contentHeight,
	);
	buffer.selection.row = contentStart + row;
	buffer.selection.column = column;
};

const extractSelectionText = (lines, selection) => {
	const { topRow, bottomRow } = selectionRowRange(selection);
	const pieces = [];
	for (let lineIndex = topRow; lineIndex <= bottomRow; lineIndex++) {
		const line = lines[lineIndex] ?? "";
		const { start, end } = selectionColumnRange(
			selection,
			topRow,
			bottomRow,
			lineIndex,
			line.length,
		);
		pieces.push(line.slice(start, end));
	}
	return pieces.join("\n");
};

export const finishSelection = (buffer) => {
	if (!buffer.selection.active) {
		return "";
	}
	const text = extractSelectionText(buffer.lines, buffer.selection);
	buffer.selection.active = false;
	return text;
};

export const clearSelection = (buffer) => {
	buffer.selection.active = false;
};

export const setMessage = (buffer, message) => {
	buffer.message = message;
};

export const toggleTime = (buffer) => {
	buffer.showTime = !buffer.showTime;
};

const appendCompleteLine = (buffer, line) => {
	buffer.lines.push(line);
	buffer.lineTimes.push(Date.now());
	if (buffer.lines.length > buffer.maxLines) {
		buffer.lines.splice(0, buffer.lines.length - buffer.maxLines);
		buffer.lineTimes.splice(0, buffer.lineTimes.length - buffer.maxLines);
	}
};

export const appendSerialData = (buffer, chunk) => {
	const text = chunk.toString(UTF8);
	const combined = buffer.partial + text;
	const segments = combined.split("\n");

	buffer.partial = segments.pop() ?? "";
	for (const segment of segments) {
		appendCompleteLine(buffer, segment.replace(/\r$/, ""));
	}

	if (segments.length > 0) {
		buffer.selection.active = false;
	}
};

export const clearWindowBuffer = (buffer) => {
	buffer.lines = [];
	buffer.lineTimes = [];
	buffer.partial = "";
	buffer.scrollOffset = 0;
	buffer.selection.active = false;
	buffer.message = "";
};
