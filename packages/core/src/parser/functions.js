import { AST_NODE, TOKEN_TYPE } from "../constants.js";
import { makeLocation } from "./location.js";
import { parseBlockStatement } from "./statements.js";
import {
	consume,
	expectRequired,
	expectRequiredOrEof,
	peek,
} from "./token-stream.js";
import { isNameToken } from "./tokens.js";
import { parseParameter, parseTypeUnion } from "./types.js";

const parseFunctionParameters = (context) => {
	const params = [];
	while (
		peek(context).type !== TOKEN_TYPE.rightParenthesis &&
		peek(context).type !== TOKEN_TYPE.eof
	) {
		if (isNameToken(peek(context))) {
			params.push(parseParameter(context));
		} else {
			break;
		}
		if (peek(context).type === TOKEN_TYPE.comma) {
			consume(context);
		}
	}
	return params;
};

const parseFunctionReturnType = (context) => {
	if (peek(context).type !== TOKEN_TYPE.colon) {
		return null;
	}
	consume(context);
	const parsed = parseTypeUnion(context);
	if (!parsed) {
		return null;
	}
	return { name: parsed.name, loc: parsed.loc };
};

const makeEmptyFunctionExpression = (context, async, params, returnType) => {
	return {
		type: AST_NODE.functionExpression,
		async,
		params,
		returnType,
		body: {
			type: AST_NODE.blockStatement,
			body: [],
			loc: makeLocation(peek(context), peek(context)),
		},
		loc: makeLocation(peek(context), peek(context)),
	};
};

export const parseFunctionExpression = (context, async) => {
	expectRequired(context, TOKEN_TYPE.leftParenthesis);
	const params = parseFunctionParameters(context);
	if (!expectRequiredOrEof(context, TOKEN_TYPE.rightParenthesis)) {
		return makeEmptyFunctionExpression(context, async, params, null);
	}
	const returnType = parseFunctionReturnType(context);
	if (!expectRequiredOrEof(context, TOKEN_TYPE.arrow)) {
		return makeEmptyFunctionExpression(context, async, params, returnType);
	}
	const body = parseBlockStatement(context);
	return {
		type: AST_NODE.functionExpression,
		async,
		params,
		returnType,
		body,
		loc: makeLocation(params[0] || body, body),
	};
};
