import { AST_NODE, TOKEN_TYPE } from "../constants.js";
import { tokenize } from "../lexer/index.js";
import { parseExpression } from "./expressions.js";
import { extendLocation, makeLocation } from "./location.js";
import {
	consume,
	createParserContext,
	expectRequired,
	expectRequiredOrEof,
	peek,
} from "./token-stream.js";
import { isObjectKeyToken } from "./tokens.js";

export const parseTemplateLiteral = (context, token) => {
	const expressions = [];
	for (const expression of token.expressions ?? []) {
		const { tokens, errors: expressionErrors } = tokenize(
			expression.source,
			0,
			expression.line,
			expression.column,
		);
		context.errors.push(...expressionErrors);
		const expressionContext = createParserContext(tokens, context.errors);
		const parsed = parseExpression(expressionContext);
		if (parsed) {
			expressions.push(parsed);
		}
	}
	return {
		type: AST_NODE.templateLiteral,
		quasis: token.quasis ?? [],
		expressions,
		raw: `\`${token.value}\``,
		loc: makeLocation(token, extendLocation(token, 2)),
	};
};

export const parseArrayLiteral = (context) => {
	const start = consume(context);
	const elements = [];
	while (
		peek(context).type !== TOKEN_TYPE.rightBracket &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		elements.push(parseExpression(context));
		if (peek(context).type === TOKEN_TYPE.comma) {
			consume(context);
			if (peek(context).type === TOKEN_TYPE.rightBracket) {
				break;
			}
		} else {
			break;
		}
	}
	const end = expectRequiredOrEof(context, TOKEN_TYPE.rightBracket);
	return {
		type: AST_NODE.arrayLiteral,
		elements,
		loc: makeLocation(start, end ?? peek(context)),
	};
};

export const parseObjectLiteral = (context) => {
	const start = consume(context);
	const properties = [];
	while (
		peek(context).type !== TOKEN_TYPE.rightBrace &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		const keyToken = isObjectKeyToken(peek(context))
			? consume(context)
			: expectRequired(context, TOKEN_TYPE.identifier);
		const key = keyToken?.value ?? "?";
		expectRequired(context, TOKEN_TYPE.colon);
		const value = parseExpression(context);
		const propertyStart = keyToken ?? start;
		properties.push({
			type: AST_NODE.objectProperty,
			key,
			value,
			loc: makeLocation(propertyStart, extendLocation(peek(context))),
		});
		if (peek(context).type === TOKEN_TYPE.comma) {
			consume(context);
			if (peek(context).type === TOKEN_TYPE.rightBrace) {
				break;
			}
		} else {
			break;
		}
	}
	const end = expectRequiredOrEof(context, TOKEN_TYPE.rightBrace);
	return {
		type: AST_NODE.objectLiteral,
		properties,
		loc: makeLocation(start, end ?? peek(context)),
	};
};
