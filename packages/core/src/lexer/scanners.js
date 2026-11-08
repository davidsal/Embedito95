import { PUNCTUATION } from "../ast.js";
import {
	ERROR_CODE,
	KEYWORDS,
	NEWLINE,
	OPERATORS,
	QUOTE_DOUBLE,
	QUOTE_SINGLE,
	SINGLE_OPERATORS,
	SLASH,
	STAR,
	TOKEN_TYPE,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";

const isIdentifierStart = (character) => {
	return /[a-zA-Z_$]/.test(character);
};

const isIdentifierContinue = (character) => {
	return /[a-zA-Z0-9_$]/.test(character);
};

export const advanceCharacter = (source, position, line, column) => {
	if (source[position] === NEWLINE) {
		return { position: position + 1, line: line + 1, column: 1 };
	}
	return { position: position + 1, line, column: column + 1 };
};

const scanDigits = (source, position, column) => {
	let value = "";
	while (position < source.length && /[0-9.]/.test(source[position])) {
		value += source[position];
		position++;
		column++;
	}
	return { value, position, column };
};

export const makeToken = (type, value, line, column) => {
	return {
		type,
		value,
		line,
		column,
	};
};

const skipLineComment = (source, startPosition, startColumn) => {
	let position = startPosition;
	let column = startColumn;

	while (position < source.length && source[position] !== NEWLINE) {
		position++;
		column++;
	}

	return { position, column };
};

const parseBlockComment = (
	source,
	startPosition,
	startLine,
	startColumn,
	errors,
) => {
	let position = startPosition + 2;
	let column = startColumn + 2;
	let line = startLine;

	while (
		position < source.length &&
		!(source[position] === STAR && source[position + 1] === SLASH)
	) {
		const advanced = advanceCharacter(source, position, line, column);
		position = advanced.position;
		line = advanced.line;
		column = advanced.column;
	}

	if (position >= source.length) {
		errors.push(
			makeDiagnostic({
				code: ERROR_CODE.unexpectedEof,
				location: {
					start: { line: startLine, column: startColumn },
					end: { line, column },
				},
			}),
		);
		return null;
	}

	position += 2;
	column += 2;
	return { position, column, line };
};

export const scanLineComment = (source, position, line, column, tokens) => {
	if (!(source[position] === SLASH && source[position + 1] === SLASH)) {
		return null;
	}
	const startPosition = position;
	const startColumn = column;
	const result = skipLineComment(source, position, column);
	tokens.push(
		makeToken(
			TOKEN_TYPE.comment,
			source.slice(startPosition, result.position),
			line,
			startColumn,
		),
	);
	return {
		position: result.position,
		column: result.column,
		line,
		stop: false,
	};
};

export const scanBlockComment = (
	source,
	position,
	line,
	column,
	errors,
	tokens,
) => {
	if (!(source[position] === SLASH && source[position + 1] === STAR)) {
		return null;
	}
	const startPosition = position;
	const startLine = line;
	const startColumn = column;
	const result = parseBlockComment(
		source,
		startPosition,
		startLine,
		startColumn,
		errors,
	);
	if (!result) {
		return { position, line, column, stop: true };
	}
	tokens.push(
		makeToken(
			TOKEN_TYPE.comment,
			source.slice(startPosition, result.position),
			startLine,
			startColumn,
		),
	);
	return {
		position: result.position,
		column: result.column,
		line: result.line,
		stop: false,
	};
};

export const scanOperator = (source, position, line, column, tokens) => {
	const character = source[position];
	if (character === "=" && source[position + 1] === ">") {
		tokens.push(makeToken(TOKEN_TYPE.arrow, "=>", line, column));
		return { position: position + 2, line, column: column + 2, stop: false };
	}

	for (const [operator, type] of OPERATORS) {
		if (source.startsWith(operator, position)) {
			tokens.push(makeToken(type, operator, line, column));
			return {
				position: position + operator.length,
				line,
				column: column + operator.length,
				stop: false,
			};
		}
	}

	for (const [operator, type] of SINGLE_OPERATORS) {
		if (character === operator) {
			tokens.push(makeToken(type, operator, line, column));
			return { position: position + 1, line, column: column + 1, stop: false };
		}
	}

	return null;
};

export const scanNegativeNumber = (source, position, line, column, tokens) => {
	if (!(source[position] === "-" && /[0-9]/.test(source[position + 1]))) {
		return null;
	}
	const startColumn = column;
	const result = scanDigits(source, position + 1, column + 1);
	tokens.push(
		makeToken(TOKEN_TYPE.number, `-${result.value}`, line, startColumn),
	);
	return {
		position: result.position,
		line,
		column: result.column,
		stop: false,
	};
};

export const scanPunctuation = (source, position, line, column, tokens) => {
	const character = source[position];
	const matched = PUNCTUATION.some(({ char: punctuationCharacter, type }) => {
		if (character === punctuationCharacter) {
			tokens.push(makeToken(type, punctuationCharacter, line, column));
			return true;
		}
		return false;
	});
	if (!matched) {
		return null;
	}
	return { position: position + 1, line, column: column + 1, stop: false };
};

const resolveLineEndColumn = (
	source,
	startPosition,
	startColumn,
	fallbackColumn,
) => {
	const lineEndPosition = source.indexOf(NEWLINE, startPosition);
	if (lineEndPosition === -1) {
		return fallbackColumn;
	}
	return startColumn + (lineEndPosition - startPosition);
};

export const scanString = (source, position, line, column, errors, tokens) => {
	const character = source[position];
	if (character !== QUOTE_SINGLE && character !== QUOTE_DOUBLE) {
		return null;
	}
	const startColumn = column;
	const startPosition = position;
	position++;
	column++;
	let value = "";
	while (position < source.length && source[position] !== character) {
		value += source[position];
		position++;
		column++;
	}
	if (position >= source.length) {
		errors.push(
			makeDiagnostic({
				code: ERROR_CODE.unexpectedEof,
				location: {
					start: { line, column: startColumn },
					end: {
						line,
						column: resolveLineEndColumn(
							source,
							startPosition,
							startColumn,
							column,
						),
					},
				},
			}),
		);
		return { position, line, column, stop: true };
	}
	position++;
	column++;
	const token = makeToken(TOKEN_TYPE.string, value, line, startColumn);
	token.quote = character;
	tokens.push(token);
	return { position, line, column, stop: false };
};

export const scanNumber = (source, position, line, column, tokens) => {
	if (!/[0-9]/.test(source[position])) {
		return null;
	}
	const startColumn = column;
	const digits = scanDigits(source, position, column);

	if (
		digits.position < source.length &&
		isIdentifierStart(source[digits.position])
	) {
		let value = digits.value;
		let currentPosition = digits.position;
		let currentColumn = digits.column;
		while (
			currentPosition < source.length &&
			isIdentifierContinue(source[currentPosition])
		) {
			value += source[currentPosition];
			currentPosition++;
			currentColumn++;
		}
		tokens.push(makeToken(TOKEN_TYPE.identifier, value, line, startColumn));
		return {
			position: currentPosition,
			line,
			column: currentColumn,
			stop: false,
		};
	}
	tokens.push(makeToken(TOKEN_TYPE.number, digits.value, line, startColumn));
	return {
		position: digits.position,
		line,
		column: digits.column,
		stop: false,
	};
};

export const scanIdentifier = (source, position, line, column, tokens) => {
	if (!isIdentifierStart(source[position])) {
		return null;
	}
	const startColumn = column;
	let value = "";
	while (position < source.length && isIdentifierContinue(source[position])) {
		value += source[position];
		position++;
		column++;
	}
	const type = KEYWORDS.has(value) ? TOKEN_TYPE.keyword : TOKEN_TYPE.identifier;
	tokens.push(makeToken(type, value, line, startColumn));
	return { position, line, column, stop: false };
};
