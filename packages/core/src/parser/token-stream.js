import { ERROR_CODE, TOKEN_TYPE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { extendLocation, makeUnexpectedTokenRange } from "./location.js";
import {
	formatToken,
	STATEMENT_START_KEYWORDS,
	TOKEN_LABELS,
} from "./tokens.js";

const MAX_RECOVERY_TOKEN_JUMPS = 64;

const RECOVERY_SYNC_TYPES = new Set([
	TOKEN_TYPE.semicolon,
	TOKEN_TYPE.rightBrace,
	TOKEN_TYPE.rightParenthesis,
	TOKEN_TYPE.rightBracket,
]);

export const createParserContext = (tokens, errors = []) => {
	return {
		tokens,
		errors,
		position: 0,
		parenDepth: 0,
		currentStatementId: 0,
		nextStatementId: 1,
		reportedUnexpectedStatements: new Set(),
	};
};

export const peek = (context) =>
	context.tokens[context.position] || context.tokens[context.tokens.length - 1];

export const consume = (context) => context.tokens[context.position++];

export const consumeLeftParenthesis = (context) => {
	context.parenDepth++;
	return consume(context);
};

export const consumeRightParenthesis = (context) => {
	if (context.parenDepth > 0) {
		context.parenDepth--;
	}
	return consume(context);
};

export const expect = (context, type) => {
	const token = peek(context);
	if (token.type === type) {
		if (type === TOKEN_TYPE.leftParenthesis) {
			return consumeLeftParenthesis(context);
		}
		if (type === TOKEN_TYPE.rightParenthesis) {
			return consumeRightParenthesis(context);
		}
		return consume(context);
	}
	return null;
};

const isStatementStartKeyword = (token) => {
	return (
		token.type === TOKEN_TYPE.keyword &&
		STATEMENT_START_KEYWORDS.has(token.value)
	);
};

const isRecoveryBoundary = (token, expectedType) => {
	if (token.type === TOKEN_TYPE.eof) {
		return true;
	}
	if (
		token.type === TOKEN_TYPE.rightBrace &&
		expectedType === TOKEN_TYPE.rightParenthesis
	) {
		return false;
	}
	if (isStatementStartKeyword(token)) {
		return true;
	}
	return RECOVERY_SYNC_TYPES.has(token.type);
};

const skipToPosition = (context, targetPosition) => {
	while (context.position < targetPosition) {
		const token = peek(context);
		if (token.type === TOKEN_TYPE.leftParenthesis) {
			consumeLeftParenthesis(context);
		} else if (token.type === TOKEN_TYPE.rightParenthesis) {
			consumeRightParenthesis(context);
		} else {
			consume(context);
		}
	}
};

const recoverExpectedToken = (context, type) => {
	const recoveryLimit = Math.min(
		context.tokens.length - 1,
		context.position + MAX_RECOVERY_TOKEN_JUMPS,
	);

	for (let position = context.position; position <= recoveryLimit; position++) {
		const token = context.tokens[position];
		if (token.type === type) {
			skipToPosition(context, position);
			return expect(context, type);
		}
		if (isRecoveryBoundary(token, type)) {
			return null;
		}
	}

	return null;
};

export const expectRequired = (context, type) => {
	const token = expect(context, type);
	if (token) {
		return token;
	}
	reportUnexpectedToken(
		context,
		TOKEN_LABELS[type] || formatToken({ type, value: null }),
		peek(context),
		type,
	);
	return recoverExpectedToken(context, type);
};

export const expectRequiredOrEof = expectRequired;

export const ensureParserProgress = (context, positionBefore) => {
	if (
		context.position === positionBefore &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		consume(context);
	}
};

export const acceptSemicolon = (context) => {
	if (peek(context).type === TOKEN_TYPE.semicolon) {
		consume(context);
	}
};

const REPORTED_ONCE_ERROR_CODES = new Set([
	ERROR_CODE.unexpectedToken,
	ERROR_CODE.unexpectedEof,
]);

export const reportParserError = (context, diagnostic) => {
	if (REPORTED_ONCE_ERROR_CODES.has(diagnostic.code)) {
		if (context.reportedUnexpectedStatements.has(context.currentStatementId)) {
			return;
		}
		context.reportedUnexpectedStatements.add(context.currentStatementId);
	}
	context.errors.push(diagnostic);
};

const makeUnexpectedTokenDiagnostic = (
	context,
	expected,
	token,
	expectedType,
) => {
	if (token.type === TOKEN_TYPE.eof) {
		return makeDiagnostic({
			code: ERROR_CODE.unexpectedEof,
			location: makeUnexpectedTokenRange(context, token, expectedType),
		});
	}
	return makeDiagnostic({
		code: ERROR_CODE.unexpectedToken,
		params: {
			expected,
			found: formatToken(token),
		},
		location: makeUnexpectedTokenRange(context, token, expectedType),
	});
};

export const reportUnexpectedToken = (
	context,
	expected,
	token = peek(context),
	expectedType = null,
) => {
	reportParserError(
		context,
		makeUnexpectedTokenDiagnostic(context, expected, token, expectedType),
	);
};

export const reportOperatorAtLineEnd = (context, operatorToken) => {
	if (context.parenDepth === 0 && peek(context).line > operatorToken.line) {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.operatorAtLineEnd,
				params: { operator: operatorToken.value },
				location: {
					start: operatorToken,
					end: extendLocation(operatorToken),
				},
			}),
		);
	}
};

export const isArrowFunctionParameters = (context) => {
	if (peek(context).type !== TOKEN_TYPE.leftParenthesis) {
		return false;
	}

	let depth = 0;
	let position = context.position;

	while (position < context.tokens.length) {
		const token = context.tokens[position];

		if (token.type === TOKEN_TYPE.leftParenthesis) {
			depth++;
		} else if (token.type === TOKEN_TYPE.rightParenthesis) {
			depth--;

			if (depth === 0) {
				let nextPosition = position + 1;
				const nextToken = context.tokens[nextPosition];

				if (nextToken?.type === TOKEN_TYPE.colon) {
					nextPosition++;
					const typeTokens = new Set([
						TOKEN_TYPE.identifier,
						TOKEN_TYPE.pipe,
						TOKEN_TYPE.dot,
						TOKEN_TYPE.leftBracket,
						TOKEN_TYPE.rightBracket,
						TOKEN_TYPE.number,
						TOKEN_TYPE.keyword,
						TOKEN_TYPE.lessThan,
						TOKEN_TYPE.greaterThan,
						TOKEN_TYPE.comma,
					]);
					while (
						nextPosition < context.tokens.length &&
						typeTokens.has(context.tokens[nextPosition].type)
					) {
						nextPosition++;
					}
				}

				return context.tokens[nextPosition]?.type === TOKEN_TYPE.arrow;
			}
		}
		position++;
	}

	return false;
};
