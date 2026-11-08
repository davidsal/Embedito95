import { tokenize } from "../lexer/index.js";
import { parse } from "../parser/index.js";

export const parseStatements = (source) => {
	const { tokens } = tokenize(source);
	return parse(tokens).ast.body;
};

export const rebaseLines = (node, offset) => {
	if (Array.isArray(node)) {
		for (const item of node) {
			rebaseLines(item, offset);
		}
		return;
	}
	if (!node || typeof node !== "object") {
		return;
	}
	if (node.loc?.start && node.loc?.end) {
		node.loc.start.line += offset;
		node.loc.end.line += offset;
	}
	for (const value of Object.values(node)) {
		if (value && typeof value === "object") {
			rebaseLines(value, offset);
		}
	}
};
