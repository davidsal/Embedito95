import { AST_NODE } from "../constants.js";
import {
	collectInlineComments,
	emitNodeComments,
	formatEmptyBlock,
	getCommentEndLine,
	getIndent,
	hasBlankLineBetween,
	indentLines,
} from "./comments.js";
import { formatNode } from "./format.js";

const collectBlockStatementLines = (
	node,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
) => {
	const inner = [];
	for (const statement of node.body) {
		const beforeIndex = commentState.index;
		const before = emitNodeComments(
			nodeComments,
			commentState,
			statement.loc?.start?.line,
		);
		const firstComment = nodeComments[beforeIndex];
		const beforeLine = before && firstComment ? firstComment.line : null;
		const lastComment = nodeComments[commentState.index - 1];
		const lastBeforeLine = lastComment ? getCommentEndLine(lastComment) : null;
		const statementLine = statement.loc?.start?.line;
		const blankBefore =
			before &&
			lastBeforeLine &&
			statementLine &&
			hasBlankLineBetween(source, lastBeforeLine, statementLine);
		const code = formatNode(statement, depth + 1, commentMap, source);
		const indentedBefore = indentLines(before, depth + 1);
		inner.push({
			text: `${indentedBefore}${blankBefore ? "\n" : ""}${code}`,
			code,
			node: statement,
			beforeLine,
		});
	}
	return inner;
};

const joinBlockStatementLines = (rendered, source) => {
	let bodyText = "";
	for (let index = 0; index < rendered.length; index++) {
		if (index > 0) {
			const previous = rendered[index - 1];
			const previousStartLine = previous.node.loc?.start?.line;
			const previousEndLine =
				previousStartLine + previous.code.split("\n").length - 1;
			const currentStartLine =
				rendered[index].beforeLine ?? rendered[index].node.loc?.start?.line;
			bodyText += hasBlankLineBetween(source, previousEndLine, currentStartLine)
				? "\n\n"
				: "\n";
		}
		bodyText += rendered[index].text;
	}
	return bodyText;
};

const formatBlockStatement = (
	node,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
	options,
) => {
	const openingLine = node.loc?.start?.line;
	const closingLine = node.loc?.end?.line;
	const deferClosingInline = options?.deferClosingInline === true;
	if (node.body.length === 0) {
		return formatEmptyBlock(
			nodeComments,
			commentState,
			depth,
			openingLine,
			closingLine,
			deferClosingInline,
		);
	}
	const headerInline = collectInlineComments(
		nodeComments,
		commentState,
		openingLine,
	);
	const rendered = collectBlockStatementLines(
		node,
		depth,
		commentMap,
		source,
		nodeComments,
		commentState,
	);
	const bodyText = joinBlockStatementLines(rendered, source);
	const body = bodyText ? `${bodyText}\n` : "";
	const afterBlock = emitNodeComments(nodeComments, commentState, closingLine);
	const indentedAfter = indentLines(afterBlock, depth + 1);
	const closingInline = deferClosingInline
		? ""
		: collectInlineComments(nodeComments, commentState, closingLine);
	return `{${headerInline}\n${body}${indentedAfter}${getIndent(depth)}}${closingInline}`;
};

const collectEnumMemberLines = (
	node,
	depth,
	commentMap,
	source,
	nodeComments,
	commentState,
) => {
	return node.members.map((member, index) => {
		const memberBefore = emitNodeComments(
			nodeComments,
			commentState,
			member.loc?.start?.line,
		);
		const line = member.value
			? `${getIndent(depth + 1)}${member.name} = ${formatNode(member.value, depth + 1, commentMap, source)}`
			: `${getIndent(depth + 1)}${member.name}`;
		const memberLine = member.loc?.start?.line;
		const inline = collectInlineComments(
			nodeComments,
			commentState,
			memberLine,
		);
		const suffix = index < node.members.length - 1 ? "," : "";
		if (memberBefore) {
			const formattedBefore = indentLines(memberBefore, depth + 1);
			return `${formattedBefore}${line}${suffix}${inline}`;
		}
		return `${line}${suffix}${inline}`;
	});
};

const formatEnumDeclaration = (
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
	const prefix = node.export ? "export " : "";
	const head = `${before}${getIndent(depth)}${prefix}enum ${node.name}`;
	if (node.members.length === 0) {
		return `${head} ${formatEmptyBlock(nodeComments, commentState, depth)}`;
	}
	let result = `${head} {\n`;
	result += collectEnumMemberLines(
		node,
		depth,
		commentMap,
		source,
		nodeComments,
		commentState,
	).join("\n");
	const closingLine = node.loc?.end?.line;
	const beforeClose = emitNodeComments(nodeComments, commentState, closingLine);
	if (beforeClose) {
		result += `\n${indentLines(beforeClose.trimEnd(), depth + 1)}`;
	}
	result += `\n${getIndent(depth)}}`;
	const after = emitNodeComments(nodeComments, commentState, Infinity).replace(
		/\n$/,
		"",
	);
	if (after) {
		result += `\n${after}`;
	}
	return result;
};

const collectTypeMemberLines = (
	node,
	depth,
	_commentMap,
	_source,
	nodeComments,
	commentState,
) => {
	return node.members.map((member, index) => {
		const memberBefore = emitNodeComments(
			nodeComments,
			commentState,
			member.loc?.start?.line,
		);
		const params =
			member.kind === "method"
				? member.params
						.map((param) => `${param.name}: ${param.type}`)
						.join(", ")
				: "";
		const memberType =
			member.kind === "method"
				? `(${params})${member.returnType ? ` => ${member.returnType}` : ""}`
				: (member.returnType ?? "");
		const inline = collectInlineComments(
			nodeComments,
			commentState,
			member.loc?.start?.line,
		);
		const suffix = index < node.members.length - 1 ? "," : "";
		const line = `${getIndent(depth + 1)}${member.name}${
			member.optional ? "?" : ""
		}: ${memberType}${suffix}${inline}`;
		if (memberBefore) {
			return `${indentLines(memberBefore, depth + 1)}${line}`;
		}
		return line;
	});
};

const formatTypeDeclaration = (
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
	const prefix = node.export ? "export " : "";
	const head = `${before}${getIndent(depth)}${prefix}type ${node.name} = {`;
	if (node.members.length === 0) {
		return `${head} }`;
	}
	let result = `${head}\n`;
	result += collectTypeMemberLines(
		node,
		depth,
		commentMap,
		source,
		nodeComments,
		commentState,
	).join("\n");
	result += `\n${getIndent(depth)}}`;
	const after = emitNodeComments(nodeComments, commentState, Infinity).replace(
		/\n$/,
		"",
	);
	if (after) {
		result += `\n${after}`;
	}
	return result;
};

export const FORMATTERS = {
	[AST_NODE.blockStatement]: formatBlockStatement,
	[AST_NODE.enumDeclaration]: formatEnumDeclaration,
	[AST_NODE.typeDeclaration]: formatTypeDeclaration,
};
