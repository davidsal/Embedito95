import { ERROR_CODE, NEWLINE, TOKEN_TYPE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import {
	advanceCharacter,
	makeToken,
	scanBlockComment,
	scanIdentifier,
	scanLineComment,
	scanNegativeNumber,
	scanNumber,
	scanOperator,
	scanPunctuation,
	scanString,
} from "./scanners.js";
import { scanTemplateToken } from "./template.js";

const isWhitespace = (character) => {
	return (
		character === NEWLINE ||
		character === " " ||
		character === "\t" ||
		character === "\r"
	);
};

const skipWhitespace = (source, position, line, column) => {
	return {
		...advanceCharacter(source, position, line, column),
		stop: false,
	};
};

const scanLiteralToken = (source, position, line, column, errors, tokens) => {
	const stringResult = scanString(
		source,
		position,
		line,
		column,
		errors,
		tokens,
	);
	if (stringResult) {
		return stringResult;
	}

	const numberResult = scanNumber(source, position, line, column, tokens);
	if (numberResult) {
		return numberResult;
	}

	return scanIdentifier(source, position, line, column, tokens);
};

const scanNext = (source, position, line, column, errors, tokens) => {
	const character = source[position];

	if (isWhitespace(character)) {
		return skipWhitespace(source, position, line, column);
	}

	const commentResult =
		scanLineComment(source, position, line, column, tokens) ??
		scanBlockComment(source, position, line, column, errors, tokens);
	if (commentResult) {
		return commentResult;
	}

	const operatorResult =
		scanOperator(source, position, line, column, tokens) ??
		scanNegativeNumber(source, position, line, column, tokens);
	if (operatorResult) {
		return operatorResult;
	}

	const punctuationResult = scanPunctuation(
		source,
		position,
		line,
		column,
		tokens,
	);
	if (punctuationResult) {
		return punctuationResult;
	}

	if (character === "`") {
		return scanTemplateToken(source, position, line, column, errors, tokens);
	}

	const literalResult = scanLiteralToken(
		source,
		position,
		line,
		column,
		errors,
		tokens,
	);
	if (literalResult) {
		return literalResult;
	}

	return pushInvalidCharacter(source, position, line, column, errors);
};

const pushInvalidCharacter = (source, position, line, column, errors) => {
	errors.push(
		makeDiagnostic({
			code: ERROR_CODE.invalidCharacter,
			params: { character: source[position] },
			location: {
				start: { line, column },
				end: { line, column: column + 1 },
			},
		}),
	);
	return { position: position + 1, line, column: column + 1, stop: false };
};

export const tokenize = (
	source,
	startPosition = 0,
	startLine = 1,
	startColumn = 1,
) => {
	const tokens = [];
	const errors = [];
	let position = startPosition;
	let line = startLine;
	let column = startColumn;

	while (position < source.length) {
		const result = scanNext(source, position, line, column, errors, tokens);
		if (result.stop) {
			break;
		}
		position = result.position;
		line = result.line;
		column = result.column;
	}

	tokens.push(makeToken(TOKEN_TYPE.eof, null, line, column));
	return { tokens, errors };
};
