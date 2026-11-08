import { AST_NODE, QUOTE_SINGLE } from "../constants.js";
import {
	getIndent,
	renderInlineComments,
	splitCommentsByOpeningLine,
} from "./comments.js";
import { formatNode } from "./format.js";

const formatImportSpecifier = (node, _depth, _commentMap, _source) => {
	return node.alias ? `${node.name} as ${node.alias}` : node.name;
};

const formatVariableDeclarator = (node, depth, commentMap, source) => {
	const id = formatNode(node.id, depth, commentMap, source);
	if (node.init === null) {
		return id;
	}
	return `${id} = ${formatNode(node.init, depth, commentMap, source)}`;
};

const formatFunctionExpression = (node, depth, commentMap, source) => {
	const prefix = node.async ? "async " : "";
	const parameters = node.params
		.map((parameter) => {
			return formatNode(parameter, depth, commentMap, source);
		})
		.join(", ");
	const returnTypeText = node.returnType ? `: ${node.returnType.name}` : "";
	const body = formatNode(node.body, depth, commentMap, source);
	return `${prefix}(${parameters})${returnTypeText} => ${body}`;
};

const formatCallExpression = (node, depth, commentMap, source) => {
	const callee = formatNode(node.callee, depth, commentMap, source);
	const renderedArguments = node.arguments
		.map((argument) => {
			return formatNode(argument, depth, commentMap, source);
		})
		.join(", ");
	return `${callee}(${renderedArguments})`;
};

const formatBinaryExpression = (node, depth, commentMap, source) => {
	return `${formatNode(node.left, depth, commentMap, source)} ${node.operator} ${formatNode(node.right, depth, commentMap, source)}`;
};

const formatParenthesizedExpression = (node, depth, commentMap, source) => {
	const inner = formatNode(node.expression, depth, commentMap, source);
	return `(${inner})`;
};

const formatConditionalExpression = (node, depth, commentMap, source) => {
	const test = formatNode(node.test, depth, commentMap, source);
	const consequent = formatNode(node.consequent, depth, commentMap, source);
	const alternate = node.alternate
		? formatNode(node.alternate, depth, commentMap, source)
		: "";
	return `${test} ? ${consequent} : ${alternate}`;
};

const formatAsExpression = (node, depth, commentMap, source) => {
	const inner = formatNode(node.expression, depth, commentMap, source);
	return `${inner} as ${node.targetType.name}`;
};

const formatAssignmentExpression = (node, depth, commentMap, source) => {
	const left = formatNode(node.left, depth, commentMap, source);
	const right = formatNode(node.right, depth, commentMap, source);
	return `${left} ${node.operator} ${right}`;
};

const formatUpdateExpression = (node, depth, commentMap, source) => {
	const argument = formatNode(node.argument, depth, commentMap, source);
	return node.prefix
		? `${node.operator}${argument}`
		: `${argument}${node.operator}`;
};

const formatUnaryExpression = (node, depth, commentMap, source) => {
	const argument = formatNode(node.argument, depth, commentMap, source);
	return `${node.operator}${argument}`;
};

const formatAwaitExpression = (node, depth, commentMap, source) => {
	const argument = formatNode(node.argument, depth, commentMap, source);
	return `await ${argument}`;
};

const formatIdentifier = (node, depth, commentMap, source) => {
	let result = node.name;
	if (node.typeAnnotation) {
		result += `: ${node.typeAnnotation.type}`;
	}
	if (node.defaultValue) {
		result += ` = ${formatNode(node.defaultValue, depth, commentMap, source)}`;
	}
	return result;
};

const formatMemberExpression = (node, depth, commentMap, _source) => {
	return `${formatNode(node.object, depth, commentMap)}.${formatNode(node.property, depth, commentMap)}`;
};

const formatThisExpression = (_node, _depth, _commentMap, _source) => {
	return "this";
};

const isMultilineElement = (element) => {
	return (
		element.type === AST_NODE.arrayLiteral ||
		element.type === AST_NODE.objectLiteral
	);
};

const sortByLine = (comments) => {
	return [...(comments ?? [])].sort((first, second) => {
		return first.line - second.line;
	});
};

const formatArrayLiteral = (node, depth, commentMap, source, nodeComments) => {
	const comments = sortByLine(nodeComments);
	const { headerComments, bodyComments } = splitCommentsByOpeningLine(
		node,
		comments,
	);
	const multiline =
		headerComments.length > 0 ||
		(node.elements.length > 0 && node.elements.some(isMultilineElement));

	if (!multiline) {
		const elements = node.elements
			.map((element) => formatNode(element, depth, commentMap, source))
			.join(", ");
		return `[${elements}]${renderInlineComments(bodyComments)}`;
	}

	const lines = [];
	let commentIndex = 0;
	node.elements.forEach((element, index) => {
		const elementStart = element.loc?.start?.line;
		const elementEnd = element.loc?.end?.line ?? elementStart;
		const leading = [];
		while (
			commentIndex < bodyComments.length &&
			bodyComments[commentIndex].line < elementStart
		) {
			leading.push(bodyComments[commentIndex]);
			commentIndex += 1;
		}
		const inline = [];
		while (
			commentIndex < bodyComments.length &&
			bodyComments[commentIndex].line <= elementEnd
		) {
			inline.push(bodyComments[commentIndex]);
			commentIndex += 1;
		}
		const value = formatNode(element, depth + 1, commentMap, source);
		const suffix = index < node.elements.length - 1 ? "," : "";
		for (const comment of leading) {
			lines.push(`${getIndent(depth + 1)}${comment.value}`);
		}
		lines.push(
			`${getIndent(depth + 1)}${value}${suffix}${renderInlineComments(inline)}`,
		);
	});

	const leftover = bodyComments.slice(commentIndex);
	const closeInline = leftover.filter((comment) => {
		return comment.line >= node.loc?.end?.line;
	});
	for (const comment of leftover) {
		if (comment.line < node.loc?.end?.line) {
			lines.push(`${getIndent(depth + 1)}${comment.value}`);
		}
	}
	return `[${renderInlineComments(headerComments)}\n${lines.join("\n")}\n${getIndent(depth)}]${renderInlineComments(closeInline)}`;
};

const formatEmptyObjectLiteral = (
	node,
	depth,
	headerComments,
	bodyComments,
) => {
	const endLine = node.loc?.end?.line;
	const closeInline = bodyComments.filter((comment) => {
		return comment.line >= endLine;
	});
	const innerComments = bodyComments.filter((comment) => {
		return comment.line < endLine;
	});
	if (headerComments.length === 0) {
		return `{}${renderInlineComments(bodyComments)}`;
	}
	const lines = innerComments.map((comment) => {
		return `${getIndent(depth + 1)}${comment.value}`;
	});
	const bodySection = lines.length > 0 ? `\n${lines.join("\n")}` : "";
	return `{${renderInlineComments(headerComments)}${bodySection}\n${getIndent(depth)}}${renderInlineComments(closeInline)}`;
};

const formatObjectLiteral = (node, depth, commentMap, source, nodeComments) => {
	const comments = sortByLine(nodeComments);
	const { headerComments, bodyComments } = splitCommentsByOpeningLine(
		node,
		comments,
	);

	if (node.properties.length === 0) {
		return formatEmptyObjectLiteral(node, depth, headerComments, bodyComments);
	}

	let commentIndex = 0;
	const lines = node.properties.map((property, index) => {
		const propertyStart = property.loc?.start?.line;
		const propertyEnd = Math.max(
			propertyStart,
			property.value?.loc?.end?.line ?? propertyStart,
		);
		const leading = [];
		while (
			commentIndex < bodyComments.length &&
			bodyComments[commentIndex].line < propertyStart
		) {
			leading.push(bodyComments[commentIndex]);
			commentIndex += 1;
		}
		const inline = [];
		while (
			commentIndex < bodyComments.length &&
			bodyComments[commentIndex].line <= propertyEnd
		) {
			inline.push(bodyComments[commentIndex]);
			commentIndex += 1;
		}
		const value = formatNode(property.value, depth + 1, commentMap, source);
		const suffix = index < node.properties.length - 1 ? "," : "";
		const leadingText = leading
			.map((comment) => `${getIndent(depth + 1)}${comment.value}\n`)
			.join("");
		return `${leadingText}${getIndent(depth + 1)}${property.key}: ${value}${suffix}${renderInlineComments(inline)}`;
	});

	const leftover = bodyComments.slice(commentIndex);
	const endLine = node.loc?.end?.line;
	for (const comment of leftover) {
		if (comment.line < endLine) {
			lines.push(`${getIndent(depth + 1)}${comment.value}`);
		}
	}
	const closeInline = leftover.filter((comment) => {
		return comment.line >= endLine;
	});
	return `{${renderInlineComments(headerComments)}\n${lines.join("\n")}\n${getIndent(depth)}}${renderInlineComments(closeInline)}`;
};

const formatIndexExpression = (node, depth, commentMap, source) => {
	return `${formatNode(node.object, depth, commentMap, source)}[${formatNode(node.index, depth, commentMap, source)}]`;
};

const formatLiteral = (node, _depth, _commentMap, _source) => {
	if (typeof node.value === "string") {
		const quote = node.quote ?? QUOTE_SINGLE;
		return `${quote}${node.value}${quote}`;
	}
	return node.raw;
};

const formatTemplateLiteral = (node, depth, commentMap, source) => {
	const quasis = node.quasis ?? [];
	const expressions = node.expressions ?? [];
	let result = "`";
	for (let index = 0; index < expressions.length; index++) {
		result += quasis[index] ?? "";
		result += `\${${formatNode(expressions[index], depth, commentMap, source)}}`;
	}
	result += quasis[expressions.length] ?? "";
	result += "`";
	return result;
};

export const FORMATTERS = {
	[AST_NODE.importSpecifier]: formatImportSpecifier,
	[AST_NODE.variableDeclarator]: formatVariableDeclarator,
	[AST_NODE.functionExpression]: formatFunctionExpression,
	[AST_NODE.callExpression]: formatCallExpression,
	[AST_NODE.binaryExpression]: formatBinaryExpression,
	[AST_NODE.parenthesizedExpression]: formatParenthesizedExpression,
	[AST_NODE.conditionalExpression]: formatConditionalExpression,
	[AST_NODE.asExpression]: formatAsExpression,
	[AST_NODE.assignmentExpression]: formatAssignmentExpression,
	[AST_NODE.updateExpression]: formatUpdateExpression,
	[AST_NODE.unaryExpression]: formatUnaryExpression,
	[AST_NODE.awaitExpression]: formatAwaitExpression,
	[AST_NODE.identifier]: formatIdentifier,
	[AST_NODE.memberExpression]: formatMemberExpression,
	[AST_NODE.thisExpression]: formatThisExpression,
	[AST_NODE.arrayLiteral]: formatArrayLiteral,
	[AST_NODE.objectLiteral]: formatObjectLiteral,
	[AST_NODE.indexExpression]: formatIndexExpression,
	[AST_NODE.literal]: formatLiteral,
	[AST_NODE.templateLiteral]: formatTemplateLiteral,
};
