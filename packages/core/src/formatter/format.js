import { AST_NODE } from "../constants.js";
import { FORMATTERS as BLOCK_FORMATTERS } from "./blocks.js";
import {
	assignComments,
	getCommentEndLine,
	hasBlankLineBetween,
} from "./comments.js";
import { FORMATTERS as EXPRESSION_FORMATTERS } from "./expressions.js";
import { FORMATTERS as STATEMENT_FORMATTERS } from "./statements.js";

const FORMATTERS = {
	...STATEMENT_FORMATTERS,
	...BLOCK_FORMATTERS,
	...EXPRESSION_FORMATTERS,
};

export const formatNode = (node, depth, commentMap, source, options = {}) => {
	if (!node) {
		return "";
	}

	const nodeComments = commentMap?.get(node) ?? [];
	const commentState = { index: 0 };
	const formatter = FORMATTERS[node.type];
	if (!formatter) {
		return "";
	}
	return formatter(
		node,
		depth,
		commentMap,
		source,
		nodeComments,
		commentState,
		options,
	);
};

const buildParts = (ast, commentMap, source) => {
	const programComments = commentMap?.get(ast) ?? [];
	const body = ast.body;
	const parts = [];
	let programCommentIndex = 0;

	for (let index = 0; index < body.length; index++) {
		const statement = body[index];
		const stmtLine = statement.loc?.start?.line;
		while (
			programCommentIndex < programComments.length &&
			programComments[programCommentIndex].line < (stmtLine ?? Infinity)
		) {
			const comment = programComments[programCommentIndex];
			parts.push({
				text: `${comment.value}\n`,
				node: null,
				commentLine: comment.line,
				commentEndLine: getCommentEndLine(comment),
			});
			programCommentIndex++;
		}
		const formatted = formatNode(statement, 0, commentMap, source);
		const statementComments = commentMap.get(statement);
		commentMap.delete(statement);
		const code = formatNode(statement, 0, commentMap, source);
		if (statementComments) {
			commentMap.set(statement, statementComments);
		}
		parts.push({ text: formatted, code, node: statement });
	}

	while (programCommentIndex < programComments.length) {
		const comment = programComments[programCommentIndex];
		parts.push({
			text: `${comment.value}\n`,
			node: null,
			commentLine: comment.line,
			commentEndLine: getCommentEndLine(comment),
		});
		programCommentIndex++;
	}

	return parts;
};

const getSourceEndLine = (source, startLine, beforeLine) => {
	const lines = source.split("\n");
	for (let line = beforeLine; line >= startLine; line -= 1) {
		if ((lines[line - 1] ?? "").trim() !== "") {
			return line;
		}
	}
	return startLine;
};

const getSeparator = (source, previous, part, commentMap) => {
	if (previous.node && part.node) {
		const previousLine = previous.node.loc?.start?.line;
		const currentLine = part.node.loc?.start?.line;
		const previousIsImport = previous.node.type === AST_NODE.importDeclaration;
		const currentIsImport = part.node.type === AST_NODE.importDeclaration;

		if (previousIsImport && !currentIsImport) {
			return "\n\n";
		}
		const nodeComments = commentMap.get(part.node) ?? [];
		const leadingComment = nodeComments.find((comment) => {
			return comment.line < currentLine;
		});
		const checkLine = leadingComment?.line ?? currentLine;
		const previousEndLine = getSourceEndLine(
			source,
			previousLine ?? 1,
			checkLine - 1,
		);
		if (hasBlankLineBetween(source, previousEndLine, checkLine)) {
			return "\n\n";
		}
		return "\n";
	}
	if (previous.node && part.commentLine) {
		const prevLine = getSourceEndLine(
			source,
			previous.node.loc?.start?.line ?? 1,
			part.commentLine - 1,
		);
		if (hasBlankLineBetween(source, prevLine, part.commentLine)) {
			return "\n\n";
		}
		return "\n";
	}
	if (previous.commentLine && part.node) {
		const currentLine = part.node.loc?.start?.line;
		if (
			currentLine &&
			hasBlankLineBetween(source, previous.commentEndLine, currentLine)
		) {
			return "\n";
		}
		return "";
	}
	if (previous.commentLine && part.commentLine) {
		if (hasBlankLineBetween(source, previous.commentLine, part.commentLine)) {
			return "\n";
		}
		return "";
	}
	return "\n";
};

const joinParts = (source, parts, commentMap) => {
	const result = [];
	for (let index = 0; index < parts.length; index++) {
		const part = parts[index];
		if (index > 0) {
			result.push(getSeparator(source, parts[index - 1], part, commentMap));
		}
		result.push(part.text);
	}
	return result;
};

export const format = (ast, comments = [], source = "") => {
	const commentMap = assignComments(ast, comments);
	const parts = buildParts(ast, commentMap, source);
	const result = joinParts(source, parts, commentMap);
	return `${result.join("")}\n`;
};
