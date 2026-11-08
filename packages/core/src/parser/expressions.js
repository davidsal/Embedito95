import {
	AST_NODE,
	AWAIT_KEYWORD,
	ERROR_CODE,
	TOKEN_TYPE,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { parseFunctionExpression } from "./functions.js";
import { parseIdentifier } from "./imports.js";
import { extendLocation, makeLocation, makeTokenRange } from "./location.js";
import { parseCallExpression, parsePrimary } from "./primary.js";
import { parseBlockStatement } from "./statements.js";
import {
	consume,
	expectRequiredOrEof,
	isArrowFunctionParameters,
	peek,
	reportOperatorAtLineEnd,
	reportParserError,
} from "./token-stream.js";
import {
	ASSIGNMENT_OPERATORS,
	BINARY_PRECEDENCE,
	UNARY_OPERATORS,
	UPDATE_OPERATORS,
} from "./tokens.js";
import { parseTypeName } from "./types.js";

const STRICT_EQUALITY_SUGGESTIONS = {
	[TOKEN_TYPE.strictEqual]: "==",
	[TOKEN_TYPE.strictNotEqual]: "!=",
};

const STRICT_EQUALITY_OPERATORS = new Set(
	Object.keys(STRICT_EQUALITY_SUGGESTIONS),
);

const reportStrictEquality = (context, token) => {
	context.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.strictEquality,
			params: {
				operator: token.value,
				suggested: STRICT_EQUALITY_SUGGESTIONS[token.type],
			},
			location: { start: token, end: extendLocation(token) },
		}),
	);
};

const parseAssignment = (context) => {
	const left = parseConditional(context);
	if (
		left &&
		ASSIGNMENT_OPERATORS.has(peek(context).type) &&
		(left.type === AST_NODE.identifier ||
			left.type === AST_NODE.memberExpression ||
			left.type === AST_NODE.indexExpression)
	) {
		const operatorToken = consume(context);
		reportOperatorAtLineEnd(context, operatorToken);
		const right = parseAssignment(context);
		return {
			type: AST_NODE.assignmentExpression,
			operator: operatorToken.value,
			left,
			right,
			loc: makeLocation(left, peek(context)),
		};
	}
	return left;
};

const parseConditional = (context) => {
	const test = parseBinary(context, 0);

	if (test && peek(context).type === TOKEN_TYPE.question) {
		consume(context);
		const consequent = parseAssignment(context);
		const colon = expectRequiredOrEof(context, TOKEN_TYPE.colon);
		const alternate = colon ? parseAssignment(context) : null;
		return {
			type: AST_NODE.conditionalExpression,
			test,
			consequent,
			alternate,
			loc: makeLocation(test, alternate ?? consequent ?? peek(context)),
		};
	}

	return test;
};

const parseBinary = (context, minPrecedence) => {
	let left = parseUnary(context);
	while (left) {
		const token = peek(context);
		if (STRICT_EQUALITY_OPERATORS.has(token.type)) {
			reportStrictEquality(context, token);
			consume(context);
			const right = parseBinary(context, minPrecedence);
			if (!right) {
				break;
			}
			left = {
				type: AST_NODE.binaryExpression,
				operator: token.value,
				left,
				right,
				loc: makeLocation(left, peek(context)),
			};
			continue;
		}
		const precedence = BINARY_PRECEDENCE[token.type];
		if (precedence === undefined || precedence < minPrecedence) {
			break;
		}
		consume(context);
		reportOperatorAtLineEnd(context, token);
		const right = parseBinary(context, precedence + 1);
		if (!right) {
			break;
		}
		left = {
			type: AST_NODE.binaryExpression,
			operator: token.value,
			left,
			right,
			loc: makeLocation(left, peek(context)),
		};
	}
	return left;
};

const parseUnary = (context) => {
	const token = peek(context);
	if (token.type === TOKEN_TYPE.keyword && token.value === AWAIT_KEYWORD) {
		consume(context);
		const argument = parseUnary(context);
		return {
			type: AST_NODE.awaitExpression,
			argument,
			loc: makeLocation(token, peek(context)),
		};
	}
	if (UNARY_OPERATORS.has(token.type)) {
		consume(context);
		const argument = parseUnary(context);
		return {
			type: AST_NODE.unaryExpression,
			operator: token.value,
			argument,
			prefix: true,
			loc: makeLocation(token, peek(context)),
		};
	}
	return parsePostfix(context);
};

const parseAsExpression = (context, expression) => {
	if (
		peek(context).type !== TOKEN_TYPE.identifier ||
		peek(context).value !== "as"
	) {
		return null;
	}
	consume(context);
	const typeToken = expectRequiredOrEof(context, TOKEN_TYPE.identifier);
	if (!typeToken) {
		return { stop: true };
	}
	const parsed = parseTypeName(context, typeToken);
	return {
		expression: {
			type: AST_NODE.asExpression,
			expression,
			targetType: {
				name: parsed.name,
				loc: parsed.loc,
			},
			loc: makeLocation(expression, parsed.loc.end),
		},
	};
};

const parseUpdateSuffix = (context, expression) => {
	if (!UPDATE_OPERATORS.has(peek(context).type)) {
		return null;
	}
	const token = consume(context);
	return {
		type: AST_NODE.updateExpression,
		operator: token.value,
		argument: expression,
		prefix: false,
		loc: makeLocation(expression, peek(context)),
	};
};

const parseIndexSuffix = (context, expression) => {
	if (peek(context).type !== TOKEN_TYPE.leftBracket) {
		return null;
	}
	consume(context);
	const index = parseExpression(context);
	const end = expectRequiredOrEof(context, TOKEN_TYPE.rightBracket);
	return {
		type: AST_NODE.indexExpression,
		object: expression,
		index,
		loc: makeLocation(expression, end ?? peek(context)),
	};
};

const parseMemberChain = (context, expression) => {
	if (peek(context).type !== TOKEN_TYPE.dot) {
		return null;
	}
	consume(context);
	const property = parseIdentifier(context);
	const member = {
		type: AST_NODE.memberExpression,
		object: expression,
		property,
		loc: makeLocation(expression, property),
	};
	if (peek(context).type === TOKEN_TYPE.leftParenthesis) {
		return parseCallExpression(context, member);
	}
	return member;
};

const parsePostfix = (context) => {
	let expression = parsePrimary(context);
	while (expression) {
		const asResult = parseAsExpression(context, expression);
		if (asResult) {
			if (asResult.stop) {
				break;
			}
			expression = asResult.expression;
			continue;
		}
		const updateResult = parseUpdateSuffix(context, expression);
		if (updateResult) {
			expression = updateResult;
			continue;
		}
		const indexResult = parseIndexSuffix(context, expression);
		if (indexResult) {
			expression = indexResult;
			continue;
		}
		const memberResult = parseMemberChain(context, expression);
		if (memberResult) {
			expression = memberResult;
			continue;
		}
		break;
	}
	return expression;
};

const isArrowWithoutAsync = (context) => {
	return (
		context.tokens[context.position + 1]?.type === TOKEN_TYPE.leftParenthesis &&
		context.tokens[context.position + 2]?.type ===
			TOKEN_TYPE.rightParenthesis &&
		context.tokens[context.position + 3]?.type === TOKEN_TYPE.arrow
	);
};

const parseMissingAsyncArrow = (context) => {
	const startToken = peek(context);
	consume(context);
	consume(context);
	consume(context);
	reportParserError(
		context,
		makeDiagnostic({
			code: ERROR_CODE.unexpectedToken,
			params: {
				expected: "'async' before function",
				found: `'${startToken.value}'`,
			},
			location: makeTokenRange(startToken),
		}),
	);
	consume(context);
	const body = parseBlockStatement(context);
	return {
		type: AST_NODE.functionExpression,
		async: false,
		params: [],
		body,
		loc: makeLocation(startToken, body),
	};
};

const parseFunctionKeywordExpression = (context) => {
	const token = consume(context);
	context.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.functionNotAllowed,
			location: makeTokenRange(token),
		}),
	);
	if (peek(context).type === TOKEN_TYPE.identifier) {
		consume(context);
	}
	if (peek(context).type === TOKEN_TYPE.leftParenthesis) {
		return parseFunctionExpression(context, false);
	}
	return { type: AST_NODE.literal, value: null, raw: "null" };
};

const parseCallExpressionArrowError = (context, expression) => {
	const name = expression.callee?.name || "identifier";
	reportParserError(
		context,
		makeDiagnostic({
			code: ERROR_CODE.unexpectedToken,
			params: {
				expected: "'async' before function",
				found: `'${name}'`,
			},
			location: expression.callee.loc,
		}),
	);
	consume(context);
	const body = parseBlockStatement(context);
	return {
		type: AST_NODE.functionExpression,
		async: false,
		params: [],
		body,
		loc: makeLocation(expression.callee || body, body),
	};
};

const isCallExpressionArrow = (context, expression) => {
	return (
		expression?.type === AST_NODE.callExpression &&
		peek(context).type === TOKEN_TYPE.arrow
	);
};

export const parseExpression = (context) => {
	if (
		peek(context).type === TOKEN_TYPE.leftParenthesis &&
		isArrowFunctionParameters(context)
	) {
		return parseFunctionExpression(context, false);
	}
	if (
		peek(context).type === TOKEN_TYPE.keyword &&
		peek(context).value === "async"
	) {
		consume(context);
		return parseFunctionExpression(context, true);
	}
	if (
		peek(context).type === TOKEN_TYPE.keyword &&
		peek(context).value === "function"
	) {
		return parseFunctionKeywordExpression(context);
	}
	if (
		peek(context).type === TOKEN_TYPE.identifier ||
		peek(context).type === TOKEN_TYPE.number
	) {
		if (isArrowWithoutAsync(context)) {
			return parseMissingAsyncArrow(context);
		}
	}

	const expression = parseAssignment(context);
	if (isCallExpressionArrow(context, expression)) {
		return parseCallExpressionArrowError(context, expression);
	}
	return expression;
};
