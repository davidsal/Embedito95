import { AST_NODE, TOKEN_TYPE } from "../constants.js";
import { makeLocation } from "./location.js";
import { parseStatement } from "./statements.js";
import {
	createParserContext,
	ensureParserProgress,
	peek,
} from "./token-stream.js";

const parseProgram = (context) => {
	const body = [];
	while (peek(context).type !== TOKEN_TYPE.eof) {
		const positionBefore = context.position;
		body.push(parseStatement(context));
		ensureParserProgress(context, positionBefore);
	}
	const start = context.tokens[0] || { line: 1, column: 1 };
	const end = peek(context);
	return { type: AST_NODE.program, body, loc: makeLocation(start, end) };
};

export const parse = (inputTokens) => {
	const comments = inputTokens.filter(
		(token) => token.type === TOKEN_TYPE.comment,
	);
	const context = createParserContext(
		inputTokens.filter((token) => token.type !== TOKEN_TYPE.comment),
	);
	const ast = parseProgram(context);
	return { ast, errors: context.errors, comments };
};
