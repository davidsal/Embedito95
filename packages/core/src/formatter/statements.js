import { AST_NODE, NEWLINE } from "../constants.js";
import {
	collectInlineComments,
	emitNodeComments,
	getCommentEndLine,
	getIndent,
	getInlineCommentsAtLine,
	hasBlankLineBetween,
	indentLines,
	renderInlineComments,
} from "./comments.js";
import { formatNode } from "./format.js";

const BLANK_LINE = NEWLINE + NEWLINE;

const getLeadingCommentSeparator = (
	source,
	nodeComments,
	commentIndex,
	statementLine,
) => {
	const lastComment = nodeComments[commentIndex - 1];
	const lastCommentEndLine = lastComment
		? getCommentEndLine(lastComment)
		: null;
	if (
		lastCommentEndLine &&
		hasBlankLineBetween(source, lastCommentEndLine, statementLine)
	) {
		return NEWLINE;
	}
	return "";
};

const getTrailingCommentSeparator = (firstAfterLine, statementLine) => {
	if (firstAfterLine && statementLine && firstAfterLine > statementLine + 1) {
		return BLANK_LINE;
	}
	return NEWLINE;
};

const formatImportDeclaration = (
	node,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
) => {
	const before = emitNodeComments(
		nodeComments,
		commentState,
		node.loc?.start?.line,
	);
	const beforeIdx = commentState.index;
	const names = node.specifiers
		.map((specifier) => {
			return formatNode(specifier, depth, commentMap, source);
		})
		.join(", ");
	const importLine = node.loc?.start?.line;
	const inline = collectInlineComments(nodeComments, commentState, importLine);
	const firstAfterLine = nodeComments[commentState.index]?.line;
	const afterRaw = emitNodeComments(
		nodeComments,
		commentState,
		Infinity,
	).replace(/\n$/, "");
	const code = `${getIndent(depth)}import { ${names} } from '${node.source}'${inline}`;
	const beforeSeparator = getLeadingCommentSeparator(
		source,
		nodeComments,
		beforeIdx,
		importLine,
	);
	if (!afterRaw) {
		return `${before}${beforeSeparator}${code}`;
	}
	const afterSeparator = getTrailingCommentSeparator(
		firstAfterLine,
		importLine,
	);
	return `${before}${beforeSeparator}${code}${afterSeparator}${afterRaw}`;
};

const formatVariableDeclaration = (
	node,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
) => {
	const before = emitNodeComments(
		nodeComments,
		commentState,
		node.loc?.start?.line,
	);
	const beforeIdx = commentState.index;
	const prefix = node.export ? "export " : "";
	const code = `${getIndent(depth)}${prefix}${node.kind} ${formatNode(node.declarations[0], depth, commentMap, source)}`;
	const exprLine = node.loc?.start?.line;
	const inline = collectInlineComments(nodeComments, commentState, exprLine);
	const afterComments = emitNodeComments(
		nodeComments,
		commentState,
		Infinity,
	).replace(/\n$/, "");
	const separator = getLeadingCommentSeparator(
		source,
		nodeComments,
		beforeIdx,
		exprLine,
	);
	return `${before}${separator}${code}${inline}${afterComments ? `${NEWLINE}${afterComments}` : ""}`;
};

const formatReturnStatement = (
	node,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
) => {
	const returnLine = node.loc?.start?.line;
	const before = emitNodeComments(nodeComments, commentState, returnLine);
	const argumentText = node.argument
		? ` ${formatNode(node.argument, depth, commentMap, source)}`
		: "";
	const inline = collectInlineComments(nodeComments, commentState, returnLine);
	return `${before}${getIndent(depth)}return${argumentText}${inline}`;
};

const formatWhileStatement = (
	node,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
) => {
	const whileLine = node.loc?.start?.line;
	const before = emitNodeComments(nodeComments, commentState, whileLine);
	const test = formatNode(node.test, depth, commentMap, source);
	const body = formatNode(node.body, depth, commentMap, source);
	const inline = collectInlineComments(nodeComments, commentState, whileLine);
	return `${before}${getIndent(depth)}while (${test}) ${body}${inline}`;
};

const formatForStatement = (
	node,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
) => {
	const forLine = node.loc?.start?.line;
	const before = emitNodeComments(nodeComments, commentState, forLine);
	const init = node.init
		? formatNode(node.init, depth, commentMap, source).trimStart()
		: "";
	const test = node.test
		? formatNode(node.test, depth, commentMap, source)
		: "";
	const update = node.update
		? formatNode(node.update, depth, commentMap, source)
		: "";
	const body = formatNode(node.body, depth, commentMap, source);
	const inline = collectInlineComments(nodeComments, commentState, forLine);
	return `${before}${getIndent(depth)}for (${init}; ${test}; ${update}) ${body}${inline}`;
};

const formatDoWhileStatement = (
	node,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
) => {
	const doWhileLine = node.loc?.start?.line;
	const before = emitNodeComments(nodeComments, commentState, doWhileLine);
	const test = formatNode(node.test, depth, commentMap, source);
	const isBlockBody = node.body?.type === AST_NODE.blockStatement;
	const body = formatNode(node.body, depth, commentMap, source, {
		deferClosingInline: isBlockBody,
	});
	const closingLine = node.body?.loc?.end?.line;
	const bodyComments = commentMap?.get(node.body) ?? [];
	const closingInline = isBlockBody
		? renderInlineComments(getInlineCommentsAtLine(bodyComments, closingLine))
		: "";
	const inline = collectInlineComments(nodeComments, commentState, doWhileLine);
	return `${before}${getIndent(depth)}do ${body} while (${test})${inline}${closingInline}`;
};

const formatIfStatement = (
	node,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
) => {
	const ifLine = node.loc?.start?.line;
	const before = emitNodeComments(nodeComments, commentState, ifLine);
	const test = formatNode(node.test, depth, commentMap, source);
	const consequent = formatNode(node.consequent, depth, commentMap, source);
	let result = `${before}${getIndent(depth)}if (${test}) ${consequent}`;
	if (node.alternate) {
		result += ` else ${formatNode(node.alternate, depth, commentMap, source)}`;
	}
	const inline = collectInlineComments(nodeComments, commentState, ifLine);
	return `${result}${inline}`;
};

const formatExpressionStatement = (
	node,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
) => {
	const expressionLine = node.loc?.start?.line;
	const before = emitNodeComments(nodeComments, commentState, expressionLine);
	const expression = formatNode(node.expression, depth, commentMap, source);
	const inline = collectInlineComments(
		nodeComments,
		commentState,
		expressionLine,
	);
	const firstAfterLine = nodeComments[commentState.index]?.line;
	const afterRaw = emitNodeComments(
		nodeComments,
		commentState,
		Infinity,
	).replace(/\n$/, "");
	const indent = getIndent(depth);
	const base = `${before}${indent}${expression}${inline}`;

	if (!afterRaw) {
		return base;
	}

	const separator = getTrailingCommentSeparator(firstAfterLine, expressionLine);
	const indentedAfter = indentLines(afterRaw, depth);
	return `${base}${separator}${indentedAfter}`;
};

const formatBreakStatement = (
	node,
	depth,
	_commentMap,
	_source,
	nodeComments,
	commentState,
) => {
	const breakLine = node.loc?.start?.line;
	const before = emitNodeComments(nodeComments, commentState, breakLine);
	const inline = collectInlineComments(nodeComments, commentState, breakLine);
	return `${before}${getIndent(depth)}break${inline}`;
};

const formatSwitchCase = (
	switchCase,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
) => {
	const caseLine = switchCase.loc?.start?.line;
	const before = emitNodeComments(nodeComments, commentState, caseLine);
	const label = switchCase.test
		? `case ${formatNode(switchCase.test, depth, commentMap, source)}:`
		: "default:";
	const inline = collectInlineComments(nodeComments, commentState, caseLine);
	const lines = [`${getIndent(depth)}${label}${inline}`];
	for (const statement of switchCase.consequent) {
		const statementBefore = emitNodeComments(
			nodeComments,
			commentState,
			statement.loc?.start?.line,
		);
		const indentedBefore = indentLines(statementBefore, depth + 1);
		lines.push(
			`${indentedBefore}${formatNode(statement, depth + 1, commentMap, source)}`,
		);
	}
	return `${indentLines(before, depth)}${lines.join("\n")}`;
};

const formatSwitchStatement = (
	node,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
) => {
	const switchLine = node.loc?.start?.line;
	const closingLine = node.loc?.end?.line;
	const before = emitNodeComments(nodeComments, commentState, switchLine);
	const discriminant = formatNode(node.discriminant, depth, commentMap, source);
	const headerInline = collectInlineComments(
		nodeComments,
		commentState,
		switchLine,
	);
	const head = `${before}${getIndent(depth)}switch (${discriminant}) {${headerInline}`;
	const body = node.cases
		.map((switchCase) => {
			return formatSwitchCase(
				switchCase,
				depth + 1,
				commentMap,
				source,
				nodeComments,
				commentState,
			);
		})
		.join("\n");
	const afterBody = emitNodeComments(nodeComments, commentState, closingLine);
	const closingInline = collectInlineComments(
		nodeComments,
		commentState,
		closingLine,
	);
	const isSingleLineEmptySwitch =
		node.cases.length === 0 &&
		closingLine <= switchLine &&
		afterBody.trim() === "" &&
		headerInline === "";
	if (isSingleLineEmptySwitch) {
		return `${head}}${closingInline}`;
	}
	const bodySection = body ? `\n${body}` : "";
	const afterSection =
		afterBody.trim() === ""
			? ""
			: `\n${indentLines(afterBody.trimEnd(), depth + 1)}`;
	return `${head}${bodySection}${afterSection}\n${getIndent(depth)}}${closingInline}`;
};

export const FORMATTERS = {
	[AST_NODE.importDeclaration]: formatImportDeclaration,
	[AST_NODE.variableDeclaration]: formatVariableDeclaration,
	[AST_NODE.returnStatement]: formatReturnStatement,
	[AST_NODE.whileStatement]: formatWhileStatement,
	[AST_NODE.forStatement]: formatForStatement,
	[AST_NODE.doWhileStatement]: formatDoWhileStatement,
	[AST_NODE.ifStatement]: formatIfStatement,
	[AST_NODE.expressionStatement]: formatExpressionStatement,
	[AST_NODE.switchStatement]: formatSwitchStatement,
	[AST_NODE.breakStatement]: formatBreakStatement,
};
