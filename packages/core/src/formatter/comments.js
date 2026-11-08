import {
	AST_NODE,
	CONTAINER_TYPES,
	INDENT,
	STATEMENT_TYPES,
} from "../constants.js";

export const getIndent = (depth) => {
	return INDENT.repeat(depth);
};

const isInRange = (line, location) => {
	return location && line >= location.start.line && line <= location.end.line;
};

const getChildNodes = (node) => {
	const children = [];
	for (const [key, value] of Object.entries(node)) {
		if (key === "loc" || key === "type") {
			continue;
		}
		if (Array.isArray(value)) {
			children.push(...value);
			continue;
		}
		if (typeof value === "object" && value !== null) {
			children.push(value);
		}
	}
	return children;
};

const collectNodeMatches = (node, context, isMatch) => {
	if (!node || typeof node !== "object") {
		return [];
	}
	const matches = isMatch(node, context) ? [node] : [];
	for (const child of getChildNodes(node)) {
		const childMatches = collectNodeMatches(child, context, isMatch);
		for (const childMatch of childMatches) {
			matches.push(childMatch);
		}
	}
	return matches;
};

const findBestNode = (node, context, isMatch, isBetter) => {
	const matches = collectNodeMatches(node, context, isMatch);
	return matches.reduce((best, match) => {
		if (best === null) {
			return match;
		}
		return isBetter(match, best) ? match : best;
	}, null);
};

const isLaterNode = (_candidate, current) => {
	return Boolean(current);
};

const isNotBetterNode = () => {
	return false;
};

const isStatementStartingAtLine = (candidate, line) => {
	return (
		STATEMENT_TYPES.has(candidate.type) && candidate.loc?.start?.line === line
	);
};

const isContainerAtLine = (candidate, line) => {
	return (
		CONTAINER_TYPES.has(candidate.type) &&
		Boolean(candidate.loc) &&
		isInRange(line, candidate.loc)
	);
};

const findContainer = (node, line) => {
	return findBestNode(node, line, isContainerAtLine, isLaterNode);
};

const findStatementAtLine = (node, line) => {
	return findBestNode(node, line, isStatementStartingAtLine, isLaterNode);
};

const findOutermostStatementAtLine = (node, line) => {
	return findBestNode(node, line, isStatementStartingAtLine, isNotBetterNode);
};

const HEADER_CONTAINER_TYPES = new Set([
	AST_NODE.blockStatement,
	AST_NODE.arrayLiteral,
	AST_NODE.objectLiteral,
]);

const isLiteralContainer = (node) => {
	return (
		node.type === AST_NODE.arrayLiteral || node.type === AST_NODE.objectLiteral
	);
};

const getContainerFirstMemberStart = (node) => {
	if (node.type === AST_NODE.blockStatement) {
		return node.body[0]?.loc?.start ?? null;
	}
	if (node.type === AST_NODE.objectLiteral) {
		return node.properties[0]?.loc?.start ?? null;
	}
	if (node.type === AST_NODE.arrayLiteral) {
		return node.elements[0]?.loc?.start ?? null;
	}
	return null;
};

export const isOpeningLineComment = (node, comment) => {
	const start = node.loc?.start;
	const end = node.loc?.end;
	if (!start || !end || start.line !== comment.line || end.line <= start.line) {
		return false;
	}
	const firstMemberStart = getContainerFirstMemberStart(node);
	if (!firstMemberStart || firstMemberStart.line > comment.line) {
		return true;
	}
	return (
		firstMemberStart.line === comment.line &&
		comment.column < firstMemberStart.column
	);
};

const isDeeperContainer = (candidate, current) => {
	if (!current) {
		return true;
	}
	return (
		(candidate.loc?.start?.column ?? 0) >= (current.loc?.start?.column ?? 0)
	);
};

const isOpeningContainerForComment = (candidate, comment) => {
	return (
		HEADER_CONTAINER_TYPES.has(candidate.type) &&
		isOpeningLineComment(candidate, comment)
	);
};

const findOpeningContainer = (node, comment) => {
	return findBestNode(
		node,
		comment,
		isOpeningContainerForComment,
		isDeeperContainer,
	);
};

const isSafeLiteralPosition = (parent, node) => {
	if (!parent) {
		return false;
	}
	if (parent.type === AST_NODE.variableDeclarator && parent.init === node) {
		return true;
	}
	if (parent.type === AST_NODE.arrayLiteral && parent.elements.includes(node)) {
		return true;
	}
	if (parent.type === AST_NODE.objectProperty && parent.value === node) {
		return true;
	}
	return false;
};

const findOutermostLiteral = (node, line, parent = null) => {
	if (!node || typeof node !== "object") {
		return null;
	}
	if (isLiteralContainer(node) && node.loc && isInRange(line, node.loc)) {
		return isSafeLiteralPosition(parent, node) ? node : null;
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === "loc" || key === "type") {
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				const found = findOutermostLiteral(item, line, node);
				if (found) {
					return found;
				}
			}
		} else if (typeof value === "object" && value !== null) {
			const found = findOutermostLiteral(value, line, node);
			if (found) {
				return found;
			}
		}
	}
	return null;
};

export const assignComments = (ast, comments) => {
	const map = new Map();

	const push = (target, comment) => {
		if (!map.has(target)) {
			map.set(target, []);
		}
		map.get(target).push(comment);
	};

	for (const comment of comments) {
		const inlineStatement = findStatementAtLine(ast, comment.line);

		if (inlineStatement) {
			const outermostStatement =
				findOutermostStatementAtLine(ast, comment.line) ?? inlineStatement;
			const openingContainer = findOpeningContainer(
				outermostStatement,
				comment,
			);
			push(openingContainer ?? inlineStatement, comment);
			continue;
		}

		const literal = findOutermostLiteral(ast, comment.line);

		if (literal) {
			push(literal, comment);
			continue;
		}

		const container = findContainer(ast, comment.line) ?? ast;

		if (container.type === AST_NODE.program) {
			const next = ast.body.find(
				(statement) =>
					statement.loc?.start?.line && statement.loc.start.line > comment.line,
			);

			if (next) {
				push(next, comment);
				continue;
			}

			push(ast, comment);
			continue;
		}

		push(container, comment);
	}

	for (const [, list] of map) {
		list.sort(
			(first, second) =>
				first.line - second.line || first.column - second.column,
		);
	}
	return map;
};

export const hasBlankLineBetween = (source, lineA, lineB) => {
	if (!source || !lineA || !lineB) {
		return false;
	}
	const lines = source.split("\n");
	for (let lineIndex = lineA; lineIndex < lineB - 1; lineIndex++) {
		if (lines[lineIndex]?.trim() === "") {
			return true;
		}
	}
	return false;
};

export const getCommentEndLine = (comment) => {
	return comment.line + (comment.value.match(/\n/g) ?? []).length;
};

const rebaseMultilineComment = (comment) => {
	const { value, column } = comment;
	if (!value.includes("\n") || (column ?? 1) <= 1) {
		return value;
	}
	const stripCount = column - 1;
	return value
		.split("\n")
		.map((line, index) => {
			if (index === 0) {
				return line;
			}
			let count = 0;
			while (count < stripCount && line[count] === " ") {
				count++;
			}
			return line.slice(count);
		})
		.join("\n");
};

export const emitNodeComments = (nodeComments, commentState, untilLine) => {
	let result = "";
	let lastLine = null;

	while (
		commentState.index < nodeComments.length &&
		nodeComments[commentState.index].line < (untilLine ?? Infinity)
	) {
		const comment = nodeComments[commentState.index];
		if (lastLine !== null && comment.line - lastLine > 1) {
			result += "\n";
		}
		result += `${rebaseMultilineComment(comment)}\n`;
		lastLine = comment.line;
		commentState.index++;
	}

	return result;
};

export const collectInlineComments = (nodeComments, commentState, line) => {
	let inline = "";
	while (
		commentState.index < nodeComments.length &&
		nodeComments[commentState.index].line === line
	) {
		inline += ` ${nodeComments[commentState.index].value}`;
		commentState.index++;
	}
	return inline;
};

export const getInlineCommentsAtLine = (nodeComments, line) => {
	return nodeComments.filter((comment) => {
		return comment.line === line;
	});
};

export const renderInlineComments = (comments) => {
	return comments
		.map((comment) => {
			return ` ${comment.value}`;
		})
		.join("");
};

export const splitCommentsByOpeningLine = (node, comments) => {
	const headerComments = comments.filter((comment) => {
		return isOpeningLineComment(node, comment);
	});
	const bodyComments = comments.filter((comment) => {
		return !isOpeningLineComment(node, comment);
	});
	return { headerComments, bodyComments };
};

export const indentLines = (text, depth) => {
	return text
		.split("\n")
		.map((line) => {
			return line ? `${getIndent(depth)}${line}` : line;
		})
		.join("\n");
};

export const formatEmptyBlock = (
	nodeComments,
	commentState,
	depth,
	blockLine,
	closingLine = blockLine,
	deferClosingInline = false,
) => {
	const spansMultipleLines =
		Boolean(blockLine) && Boolean(closingLine) && closingLine > blockLine;
	if (!spansMultipleLines) {
		const blockComment = emitNodeComments(nodeComments, commentState, Infinity);
		if (!blockComment) {
			return "{}";
		}
		if (
			blockLine &&
			nodeComments.length > 0 &&
			nodeComments[0].line === blockLine
		) {
			return `{ ${blockComment.trimEnd()} }`;
		}
		const indented = indentLines(blockComment.trimEnd(), depth + 1);
		return `{\n${indented}\n${getIndent(depth)}}`;
	}
	const leading = emitNodeComments(nodeComments, commentState, blockLine);
	const headerInline = collectInlineComments(
		nodeComments,
		commentState,
		blockLine,
	);
	const bodyText = emitNodeComments(nodeComments, commentState, closingLine);
	const closingInline = deferClosingInline
		? ""
		: collectInlineComments(nodeComments, commentState, closingLine);
	const indentedBody = indentLines(bodyText.trimEnd(), depth + 1);
	const hasHeader = headerInline.trim() !== "";
	const hasBody = indentedBody.trim() !== "";
	if (!hasHeader && !hasBody) {
		return `${leading}{}${closingInline}`;
	}
	if (!hasHeader) {
		return `${leading}{\n${indentedBody}\n${getIndent(depth)}}${closingInline}`;
	}
	const bodySection = hasBody ? `\n${indentedBody}` : "";
	return `${leading}{${headerInline}${bodySection}\n${getIndent(depth)}}${closingInline}`;
};
