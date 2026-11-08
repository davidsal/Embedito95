import { TOKEN_TYPE } from "../constants.js";
import { STATEMENT_START_KEYWORDS } from "./tokens.js";

const STRING_DELIMITER_LENGTH = 1;
const TEMPLATE_DELIMITER_LENGTH = 1;
const MINIMUM_RANGE_WIDTH = 1;
const FIRST_LINE = 1;
const FIRST_COLUMN = 1;

const CLOSING_DELIMITER_TYPES = {
	[TOKEN_TYPE.rightBrace]: TOKEN_TYPE.leftBrace,
	[TOKEN_TYPE.rightParenthesis]: TOKEN_TYPE.leftParenthesis,
	[TOKEN_TYPE.rightBracket]: TOKEN_TYPE.leftBracket,
};

const resolvePoint = (value, edge) => {
	const source = value?.loc?.[edge] ?? value;
	return { line: source?.line, column: source?.column };
};

export const makeLocation = (start, end) => ({
	start: resolvePoint(start, "start"),
	end: resolvePoint(end, "end"),
});

export const extendLocation = (token, extraLength = 0) => {
	if (!token) {
		return token;
	}
	const column =
		token.column + (token.value ? token.value.length : 0) + extraLength;
	return { ...token, column };
};

const getTemplateEnd = (token) => {
	const lines = token.value.split("\n");
	const lastLine = lines[lines.length - 1];
	return {
		line: token.line + lines.length - 1,
		column:
			lines.length === 1
				? token.column + token.value.length + TEMPLATE_DELIMITER_LENGTH * 2
				: lastLine.length + TEMPLATE_DELIMITER_LENGTH * 2,
	};
};

export const getTokenEnd = (token) => {
	if (token.type === TOKEN_TYPE.template) {
		return getTemplateEnd(token);
	}
	const quoteLength = token.quote ? token.quote.length : 0;
	const extendedToken = extendLocation(
		token,
		quoteLength * STRING_DELIMITER_LENGTH * 2,
	);
	return { line: extendedToken.line, column: extendedToken.column };
};

export const makeTokenRange = (token) => ({
	start: { line: token.line, column: token.column },
	end: getTokenEnd(token),
});

const findLineEndColumn = (tokens, line) => {
	let endColumn = 0;
	for (const token of tokens) {
		if (token.type === TOKEN_TYPE.eof || token.line !== line) {
			continue;
		}
		const tokenEnd = getTokenEnd(token);
		const tokenEndColumn =
			tokenEnd.line === line ? tokenEnd.column : token.column + 1;
		endColumn = Math.max(endColumn, tokenEndColumn);
	}
	return endColumn;
};

const makeLineRange = (context, opener) => {
	const openerEnd = getTokenEnd(opener);
	const lineEndColumn = findLineEndColumn(context.tokens, opener.line);
	const endColumn = Math.max(
		openerEnd.column,
		lineEndColumn,
		opener.column + MINIMUM_RANGE_WIDTH,
	);
	return {
		start: { line: opener.line, column: opener.column },
		end: { line: opener.line, column: endColumn },
	};
};

const findUnmatchedOpener = (context, expectedType) => {
	const openerType = CLOSING_DELIMITER_TYPES[expectedType];
	let depth = 0;
	for (let position = context.position - 1; position >= 0; position--) {
		const token = context.tokens[position];
		if (token.type === expectedType) {
			depth++;
			continue;
		}
		if (token.type !== openerType) {
			continue;
		}
		if (depth === 0) {
			return token;
		}
		depth--;
	}
	return null;
};

const isClosingDelimiter = (type) => {
	return CLOSING_DELIMITER_TYPES[type] !== undefined;
};

const shouldAnchorAtOpening = (token, opener) => {
	if (token.type === TOKEN_TYPE.eof) {
		return true;
	}
	if (
		token.type === TOKEN_TYPE.keyword &&
		STATEMENT_START_KEYWORDS.has(token.value)
	) {
		return true;
	}
	return token.line > opener.line;
};

const findLastContentToken = (tokens) => {
	for (let position = tokens.length - 1; position >= 0; position--) {
		if (tokens[position].type !== TOKEN_TYPE.eof) {
			return tokens[position];
		}
	}
	return null;
};

const makeEofRange = (context) => {
	const lastToken = findLastContentToken(context.tokens);
	if (!lastToken) {
		return {
			start: { line: FIRST_LINE, column: FIRST_COLUMN },
			end: {
				line: FIRST_LINE,
				column: FIRST_COLUMN + MINIMUM_RANGE_WIDTH,
			},
		};
	}
	return makeTokenRange(lastToken);
};

export const makeUnexpectedTokenRange = (context, token, expectedType) => {
	const opener = isClosingDelimiter(expectedType)
		? findUnmatchedOpener(context, expectedType)
		: null;
	if (opener && shouldAnchorAtOpening(token, opener)) {
		return makeLineRange(context, opener);
	}
	if (token.type === TOKEN_TYPE.eof) {
		return makeEofRange(context);
	}
	return makeTokenRange(token);
};
