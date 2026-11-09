import { once } from "node:events";
import { stderr, stdin, stdout } from "node:process";
import {
	formatDiagnosticMessage,
	isTruncationWarning,
	SEVERITY,
} from "embedito95-core";
import {
	BROKEN_PIPE_ERROR_CODE,
	CSI,
	HIDE_CURSOR,
	SHOW_CURSOR,
} from "./constants.js";

const exitOnBrokenPipe = (error) => {
	if (error.code === BROKEN_PIPE_ERROR_CODE) {
		process.exit(0);
	}

	throw error;
};

stdout.on("error", exitOnBrokenPipe);
stderr.on("error", exitOnBrokenPipe);

const makeStyle = (openCode, closeCode, stream) => {
	return (text) => {
		if (!stream.isTTY) {
			return text;
		}

		return `${CSI}${openCode}m${text}${CSI}${closeCode}m`;
	};
};

export const cyan = makeStyle("36", "39", stdout);
export const dim = makeStyle("2", "22", stdout);
export const bold = makeStyle("1", "22", stdout);
export const green = makeStyle("32", "39", stdout);
export const orange = makeStyle("38;5;208", "39", stdout);
export const yellow = makeStyle("33", "39", stderr);
export const red = makeStyle("31", "39", stderr);

export const write = (text) => {
	stdout.write(text);
};
export const writeLine = (text = "") => {
	stdout.write(`${text}\n`);
};
export const writeError = (text) => {
	stderr.write(text);
};
export const writeErrorLine = (text = "") => {
	stderr.write(`${text}\n`);
};

export const hideCursor = () => {
	write(HIDE_CURSOR);
};
export const showCursor = () => {
	write(SHOW_CURSOR);
};
export const clearLine = () => {
	write(`${CSI}2K\r`);
};
export const moveUp = (number) => {
	write(`${CSI}${number}A`);
};

export const readKey = async () => {
	const [data] = await once(stdin, "data");
	return data.toString();
};

export const readLine = async () => {
	return (await readKey()).replace(/\r?\n$/, "");
};

export const setRawMode = (enable) => {
	if (!stdin.isTTY) {
		return;
	}

	stdin.setRawMode(enable);

	if (enable) {
		stdin.resume();
	} else {
		stdin.pause();
	}
};

const isErrorDiagnostic = (diagnostic) => {
	return (diagnostic.severity ?? SEVERITY.error) === SEVERITY.error;
};

export const hasErrorDiagnostics = (diagnostics) => {
	return diagnostics.some(isErrorDiagnostic);
};

export const printDiagnostics = (diagnostics, entryFile) => {
	for (const diagnostic of diagnostics) {
		if (isTruncationWarning(diagnostic)) {
			continue;
		}
		const location = diagnostic.location?.start;
		const locationSuffix = location
			? ` (${entryFile}:${location.line}:${location.column})`
			: "";
		const symbol = isErrorDiagnostic(diagnostic) ? red("✖") : yellow("⚠");
		writeErrorLine(
			`  ${symbol} ${formatDiagnosticMessage(diagnostic)}${locationSuffix}`,
		);
	}
};
