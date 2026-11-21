import { AST_NODE, ERROR_CODE, NEWLINE, TOKEN_TYPE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
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

const INTERPOLATION_OPENER_LENGTH = 2;
const INTERPOLATION_FOUND = "'}'";
const INTERPOLATION_EXPECTED = "expression";

const hasSignificantToken = (tokens) => {
	return tokens.some((token) => {
		return token.type !== TOKEN_TYPE.eof && token.type !== TOKEN_TYPE.comment;
	});
};

const computeExpressionEnd = (expression) => {
	const source = expression.source ?? "";
	let line = expression.line;
	let column = expression.column;
	for (const character of source) {
		if (character === NEWLINE) {
			line += 1;
			column = 1;
		} else {
			column += 1;
		}
	}
	return { line, column: column + 1 };
};

const buildEmptyInterpolationDiagnostic = (expression) => {
	return makeDiagnostic({
		code: ERROR_CODE.unexpectedToken,
		params: { expected: INTERPOLATION_EXPECTED, found: INTERPOLATION_FOUND },
		location: {
			start: {
				line: expression.line,
				column: expression.column - INTERPOLATION_OPENER_LENGTH,
			},
			end: computeExpressionEnd(expression),
		},
	});
};

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
		if (!hasSignificantToken(tokens)) {
			context.errors.push(buildEmptyInterpolationDiagnostic(expression));
			continue;
		}
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
