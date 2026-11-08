import {
	getNonNullableType,
	isNullableType,
	isNullLiteralNode,
} from "../checker/index.js";
import { AST_NODE, DATA_TYPE } from "../constants.js";
import { renderCondition } from "./condition-render.js";
import {
	renderAssignmentExpression,
	renderExpressionStatement,
	renderForInit,
	renderVariableDeclaration,
} from "./declaration-render.js";
import { renderExpression } from "./expression.js";
import {
	renderOptionalNull,
	renderOptionalWrap,
	resolveOptionalEntry,
} from "./optional-value.js";
import { renderGroupedExpression } from "./render-delegates.js";
import {
	expressionDataType,
	makeThisFieldResolver,
	makeThisMethodResolver,
} from "./type-resolve.js";

const renderStatement = (node, context, lines) => {
	context.floatContext = null;

	switch (node?.type) {
		case AST_NODE.blockStatement: {
			const block = renderBlock(node, context);
			lines.push(block);
			return;
		}
		case AST_NODE.variableDeclaration: {
			renderVariableDeclaration(node, context, lines);
			return;
		}
		case AST_NODE.expressionStatement: {
			renderExpressionStatement(node.expression, context, lines);
			return;
		}
		case AST_NODE.returnStatement: {
			renderReturnStatement(node, context, lines);
			return;
		}
		case AST_NODE.whileStatement: {
			const test = renderCondition(node.test, context, lines);
			const block = renderBlock(node.body, context);
			lines.push(`while (${test}) ${block}`);
			return;
		}
		case AST_NODE.doWhileStatement: {
			const block = renderBlock(node.body, context);
			const test = renderCondition(node.test, context, lines);
			lines.push(`do ${block} while (${test});`);
			return;
		}
		case AST_NODE.ifStatement: {
			const test = renderCondition(node.test, context, lines);
			const consequent = renderBlock(node.consequent, context);
			// `else if` is a nested if-statement, not a block, so it must be
			// rendered recursively; treating it as a block would drop every
			// branch after the first one.
			if (node.alternate?.type === AST_NODE.ifStatement) {
				const nested = [];
				renderStatement(node.alternate, context, nested);
				lines.push(`if (${test}) ${consequent} else ${nested.join("\n")}`);
			} else if (node.alternate) {
				lines.push(
					`if (${test}) ${consequent} else ${renderBlock(node.alternate, context)}`,
				);
			} else {
				lines.push(`if (${test}) ${consequent}`);
			}
			return;
		}
		case AST_NODE.forStatement: {
			const init = node.init ? renderForInit(node.init, context, lines) : "";
			const test = node.test ? renderCondition(node.test, context, lines) : "";
			const update = node.update
				? node.update.type === AST_NODE.assignmentExpression
					? renderAssignmentExpression(node.update, context, lines)
					: renderExpression(node.update, context, lines)
				: "";
			const block = renderBlock(node.body, context);
			lines.push(`for (${init}; ${test}; ${update}) ${block}`);
			return;
		}
		case AST_NODE.switchStatement: {
			const discriminant = renderGroupedExpression(
				node.discriminant,
				context,
				lines,
			);
			const body = renderSwitchCases(node.cases, context);
			lines.push(`switch (${discriminant}) ${body}`);
			return;
		}
		case AST_NODE.breakStatement: {
			lines.push("break;");
			return;
		}
		default:
			return;
	}
};

const renderReturnStatement = (node, context, lines) => {
	const argument = node.argument;
	if (!argument) {
		lines.push("return;");
		return;
	}
	const returnType = context.functionReturnType;
	if (isNullableType(returnType)) {
		if (isNullLiteralNode(argument)) {
			const entry = resolveOptionalEntry(returnType, context);
			lines.push(`return ${renderOptionalNull(entry)};`);
			return;
		}
		const argumentType = expressionDataType(
			argument,
			context.resolveNameType,
			context.ast,
			undefined,
			context.resolveCallType,
			context.wordSize,
			makeThisFieldResolver(context),
			context.narrowingRegions,
			makeThisMethodResolver(context),
			context.objectTypes,
		);
		const rendered = renderGroupedExpression(argument, context, lines);
		if (isNullableType(argumentType)) {
			lines.push(`return ${rendered};`);
			return;
		}
		const entry = resolveOptionalEntry(returnType, context);
		const nonNullType = getNonNullableType(returnType);
		const renderedValue =
			entry.isHandle && argument?.type === AST_NODE.objectLiteral
				? `${context.toCType(nonNullType)}(${context.objectStorageCType(nonNullType)}${rendered})`
				: rendered;
		lines.push(`return ${renderOptionalWrap(entry, renderedValue)};`);
		return;
	}
	const rendered = renderGroupedExpression(argument, context, lines);
	if (
		argument?.type === AST_NODE.objectLiteral &&
		context.isObjectHandle?.(returnType)
	) {
		lines.push(
			`return ${context.toCType(returnType)}(${context.objectStorageCType(returnType)}${rendered});`,
		);
		return;
	}
	lines.push(`return ${rendered};`);
};

const renderStatementList = (statements, context, lines) => {
	for (const statement of statements ?? []) {
		const statementStartLine = statement.loc?.start?.line;

		if (
			statementStartLine &&
			context.sourceLines?.[statementStartLine - 2]?.trim() === ""
		) {
			lines.push("");
		}

		renderStatement(statement, context, lines);
	}
};

const renderBracedLines = (lines) => {
	if (lines.length === 0) {
		return "{}";
	}
	return `{\n${lines.map((line) => (line ? `\t${line}` : "")).join("\n")}\n}`;
};

const renderBlock = (node, context) => {
	const lines = [];
	renderStatementList(node.body, context, lines);
	return renderBracedLines(lines);
};

const renderSwitchCases = (cases, context) => {
	const lines = [];
	for (const switchCase of cases) {
		if (switchCase.test) {
			const test = renderGroupedExpression(switchCase.test, context, lines);
			lines.push(`case ${test}:`);
		} else {
			lines.push("default:");
		}
		const consequent = [];
		renderStatementList(switchCase.consequent, context, consequent);
		for (const line of consequent) {
			lines.push(line ? `\t${line}` : "");
		}
	}
	return renderBracedLines(lines);
};

export const renderFunctionBody = (functionExpression, context) => {
	const lines = [];
	renderStatementList(functionExpression.body?.body, context, lines);
	return lines;
};

// Renders an inline callback-record method (`{ onEvent: (value) => {...} }`) as a
// CAPTURELESS C++ lambda: it converts implicitly to the slot's function-pointer
// type, so the struct shape is unchanged. The return type comes from the arrow
// when annotated, otherwise from the declared method signature. The explicit
// `-> ret` is required because C++ would otherwise deduce the PROMOTED type of
// the return expression (e.g. `i16 + i16` -> `int`) and the lambda would not
// convert to the expected `ret (*)(...)` slot.
export const renderFunctionExpression = (
	functionExpression,
	context,
	methodDefinition = null,
) => {
	const params = (functionExpression.params ?? [])
		.map(
			(param) => `${context.toCType(param.typeAnnotation?.type)} ${param.name}`,
		)
		.join(", ");
	const returnType =
		functionExpression.returnType?.name ??
		methodDefinition?.returnType ??
		DATA_TYPE.void;
	const savedReturnType = context.functionReturnType;
	context.functionReturnType = returnType;
	const body = renderFunctionBody(functionExpression, context)
		.map((line) => (line ? `\t${line}` : ""))
		.join("\n");
	context.functionReturnType = savedReturnType;
	return `[](${params}) -> ${context.toCType(returnType)} {\n${body}\n}`;
};
