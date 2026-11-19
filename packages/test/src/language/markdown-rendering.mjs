// Markdown primitives shared by the document generators. A pipe inside a code
// span still splits a GFM table cell, so every code span escapes it.
export const CODE_FENCE = "```";

// GFM treats a pipe as escaped only when an odd number of backslashes precedes
// it. The pattern captures that run so the callback can keep an already escaped
// pipe and still escape one that follows an even run (e.g. `\\|`, which GFM
// reads as a literal backslash followed by a cell delimiter).
const TABLE_PIPE_RUN = /(\\*)\|/g;
const TABLE_PIPE_ESCAPE = "\\|";
const PARITY_DIVISOR = 2;
const ODD_PARITY_REMAINDER = 1;
const CELL_SEPARATOR = " | ";
const ROW_EDGE = "|";
const ALIGNMENT_CELL = "---";

const escapeUnescapedTablePipe = (match, backslashes) => {
	const isEscaped = backslashes.length % PARITY_DIVISOR === ODD_PARITY_REMAINDER;
	if (isEscaped) {
		return match;
	}
	return `${backslashes}${TABLE_PIPE_ESCAPE}`;
};

export const renderCode = (value) => {
	return `\`${value.replace(TABLE_PIPE_RUN, escapeUnescapedTablePipe)}\``;
};

export const renderMarkdownRow = (cells) => {
	return `${ROW_EDGE} ${cells.join(CELL_SEPARATOR)} ${ROW_EDGE}`;
};

export const renderMarkdownSeparator = (columnCount) => {
	return renderMarkdownRow(new Array(columnCount).fill(ALIGNMENT_CELL));
};
