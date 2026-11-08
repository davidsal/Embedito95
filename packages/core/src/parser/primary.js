import { AST_NODE, TOKEN_TYPE } from "../constants.js";
import { parseExpression } from "./expressions.js";
import { parseFunctionExpression } from "./functions.js";
import { parseIdentifier, parseLiteral } from "./imports.js";
import {
	parseArrayLiteral,
	parseObjectLiteral,
	parseTemplateLiteral,
} from "./literals.js";
import { extendLocation, makeLocation } from "./location.js";
import {
	consume,
	consumeLeftParenthesis,
	expect,
	expectRequiredOrEof,
	isArrowFunctionParameters,
	peek,
	reportUnexpectedToken,
} from "./token-stream.js";
import { isLiteralKeyword, isNameToken, TOKEN_LABELS } from "./tokens.js";

const parseArguments = (context) => {
	const argumentList = [];
	expect(context, TOKEN_TYPE.leftParenthesis);
	while (
		peek(context).type !== TOKEN_TYPE.rightParenthesis &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		argumentList.push(parseExpression(context));
		if (peek(context).type === TOKEN_TYPE.comma) {
			consume(context);
		} else if (peek(context).type !== TOKEN_TYPE.rightParenthesis) {
			reportUnexpectedToken(context, TOKEN_LABELS[TOKEN_TYPE.comma] || '","');
		}
	}
	const closingParenthesis = expectRequiredOrEof(
		context,
		TOKEN_TYPE.rightParenthesis,
	);
	return { argumentList, closingParenthesis };
};

export const parseCallExpression = (context, callee) => {
	const { argumentList, closingParenthesis } = parseArguments(context);
	const end = closingParenthesis ?? peek(context);
	return {
		type: AST_NODE.callExpression,
		callee,
		arguments: argumentList,
		loc: makeLocation(callee, end),
	};
};

const parseParenthesizedExpression = (context) => {
	const start = consumeLeftParenthesis(context);
	const expression = parseExpression(context);
	const end = expectRequiredOrEof(context, TOKEN_TYPE.rightParenthesis);

	return {
		type: AST_NODE.parenthesizedExpression,
		expression,
		loc: makeLocation(start, end ?? peek(context)),
	};
};

const parseThisExpression = (context) => {
	const thisToken = consume(context);
	let expression = {
		type: AST_NODE.thisExpression,
		loc: makeLocation(thisToken, extendLocation(thisToken)),
	};

	while (peek(context).type === TOKEN_TYPE.dot) {
		consume(context);
		const property = parseIdentifier(context);
		expression = {
			type: AST_NODE.memberExpression,
			object: expression,
			property,
			loc: makeLocation(expression, property),
		};

		if (peek(context).type === TOKEN_TYPE.leftParenthesis) {
			expression = parseCallExpression(context, expression);
		}
	}

	return expression;
};

const parseNumericProperty = (context) => {
	const propertyToken = consume(context);
	return {
		type: AST_NODE.identifier,
		name: String(propertyToken.value),
		loc: makeLocation(propertyToken, extendLocation(propertyToken)),
	};
};

const parseNamedExpression = (context) => {
	let expression = parseIdentifier(context);

	while (peek(context).type === TOKEN_TYPE.dot) {
		consume(context);
		const property =
			peek(context).type === TOKEN_TYPE.number
				? parseNumericProperty(context)
				: parseIdentifier(context);
		expression = {
			type: AST_NODE.memberExpression,
			object: expression,
			property,
			loc: makeLocation(expression, property),
		};

		if (peek(context).type === TOKEN_TYPE.leftParenthesis) {
			expression = parseCallExpression(context, expression);
		}
	}

	if (peek(context).type === TOKEN_TYPE.leftParenthesis) {
		return parseCallExpression(context, expression);
	}
	return expression;
};

export const parsePrimary = (context) => {
	const token = peek(context);
	if (token.type === TOKEN_TYPE.leftParenthesis) {
		return isArrowFunctionParameters(context)
			? parseFunctionExpression(context, false)
			: parseParenthesizedExpression(context);
	}
	if (token.type === TOKEN_TYPE.leftBracket) {
		return parseArrayLiteral(context);
	}
	if (token.type === TOKEN_TYPE.leftBrace) {
		return parseObjectLiteral(context);
	}
	if (token.type === TOKEN_TYPE.template) {
		return parseTemplateLiteral(context, consume(context));
	}
	if (token.type === TOKEN_TYPE.keyword && token.value === "this") {
		return parseThisExpression(context);
	}
	if (isNameToken(token)) {
		return parseNamedExpression(context);
	}
	if (token.type === TOKEN_TYPE.number || token.type === TOKEN_TYPE.string) {
		return parseLiteral(context);
	}
	if (isLiteralKeyword(token)) {
		return parseLiteral(context);
	}
	if (token.type === TOKEN_TYPE.eof) {
		return null;
	}
	reportUnexpectedToken(context, "expression", token);
	consume(context);
	return null;
};
