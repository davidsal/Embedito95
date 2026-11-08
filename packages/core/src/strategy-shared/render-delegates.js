import {
	getNonNullableType,
	isNullableType,
	isNullLiteralNode,
	isNumericType,
	LOGICAL_OPERATORS,
	normalizeOperandTypes,
	resolveLiteralDataType,
	resolveNegationType,
} from "../checker/index.js";
import { ARITHMETIC_OPERATORS, AST_NODE, DATA_TYPE } from "../constants.js";
import { isFloatType } from "./c-types.js";
import { castOperand } from "./cast.js";
import { renderCondition, renderLogicalValue } from "./condition-render.js";
import { renderExpression } from "./expression.js";
import {
	expressionDataType,
	makeThisFieldResolver,
	makeThisMethodResolver,
	widenCommonTypeForValue,
} from "./type-resolve.js";

export const renderLiteral = (node, context) => {
	const { value, raw } = node;

	if (value === null) {
		return `nullable<u8>{ true, 0 }`;
	}
	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}
	if (typeof value === "string") {
		if (node.quote === "'") {
			return `'${value}'`;
		}
		return context.renderStringLiteral(value);
	}
	if (typeof value === "number") {
		if (Number.isInteger(value)) {
			if (context?.floatContext === DATA_TYPE.f32) {
				return `${String(value)}.0f`;
			}
			if (context?.floatContext === DATA_TYPE.f64) {
				return `${String(value)}.0`;
			}
			return raw ?? String(value);
		}
		const text = raw ?? String(value);
		return resolveLiteralDataType(node) === DATA_TYPE.f32 ? `${text}f` : text;
	}
	return raw ?? String(value);
};

export const renderTemplateLiteral = (node, context, lines) => {
	const quasis = node.quasis ?? [];
	const expressions = node.expressions ?? [];

	if (expressions.length === 0) {
		return context.renderStringLiteral(quasis.join(""));
	}

	const parts = [];
	for (let index = 0; index < expressions.length; index++) {
		if (quasis[index]) {
			parts.push({
				literal: context.renderStringLiteral(quasis[index]),
			});
		}
		const expression = expressions[index];
		const renderedExpression = renderExpression(expression, context, lines);
		parts.push({
			expression: `core_string::String(${renderedExpression})`,
		});
	}
	if (quasis[expressions.length]) {
		parts.push({
			literal: context.renderStringLiteral(quasis[expressions.length]),
		});
	}

	const first = parts.shift();
	const accumulator =
		first.literal !== undefined
			? `core_string::String(${first.literal})`
			: first.expression;
	const rest = parts.map((part) => {
		return part.literal !== undefined ? part.literal : part.expression;
	});
	const chain =
		rest.length > 0 ? `${accumulator} << ${rest.join(" << ")}` : accumulator;
	return `(${chain})`;
};

const renderNullComparison = (node, context) => {
	const leftIsNull = isNullLiteralNode(node.left);
	const rightIsNull = isNullLiteralNode(node.right);

	if (leftIsNull === rightIsNull) {
		return null;
	}

	const other = leftIsNull ? node.right : node.left;
	if (!other || other.type === AST_NODE.literal) {
		return null;
	}

	const otherType = expressionDataType(
		other,
		context.resolveNameType,
		context.ast,
		context.floatContext,
		context.resolveCallType,
		context.wordSize,
		makeThisFieldResolver(context),
		context.narrowingRegions,
		makeThisMethodResolver(context),
		context.objectTypes,
	);

	if (!isNullableType(otherType)) {
		return null;
	}

	const rendered = renderExpression(other, context, []);
	if (!rendered) {
		return null;
	}

	return node.operator === "==" ? `${rendered}.isNull` : `!${rendered}.isNull`;
};

const unwrapNullableOperand = (rendered, type) => {
	if (!isNullableType(type) || !rendered) {
		return rendered;
	}
	if (rendered.endsWith(".value")) {
		return rendered;
	}
	return `${rendered}.value`;
};

const renderComparisonExpression = (node, context, lines) => {
	const nullComparison = renderNullComparison(node, context);
	if (nullComparison) {
		return nullComparison;
	}

	const rawLeftType = expressionDataType(
		node.left,
		context.resolveNameType,
		context.ast,
		undefined,
		context.resolveCallType,
		undefined,
		makeThisFieldResolver(context),
		context.narrowingRegions,
		makeThisMethodResolver(context),
		context.objectTypes,
	);
	const rawRightType = expressionDataType(
		node.right,
		context.resolveNameType,
		context.ast,
		undefined,
		context.resolveCallType,
		undefined,
		makeThisFieldResolver(context),
		context.narrowingRegions,
		makeThisMethodResolver(context),
		context.objectTypes,
	);
	const leftType = getNonNullableType(rawLeftType);
	const rightType = getNonNullableType(rawRightType);

	const savedFloatContext = context.floatContext;
	context.floatContext = null;
	const leftRendered = unwrapNullableOperand(
		renderExpression(node.left, context, lines),
		rawLeftType,
	);
	const rightRendered = unwrapNullableOperand(
		renderExpression(node.right, context, lines),
		rawRightType,
	);
	context.floatContext = savedFloatContext;

	if (isNumericType(leftType) && isNumericType(rightType)) {
		const commonType = normalizeOperandTypes(leftType, rightType);
		return `${castOperand(leftRendered, leftType, commonType)} ${node.operator} ${castOperand(rightRendered, rightType, commonType)}`;
	}

	return `${leftRendered} ${node.operator} ${rightRendered}`;
};

export const renderBinaryExpression = (
	node,
	context,
	lines,
	skipWrap = false,
) => {
	if (LOGICAL_OPERATORS.has(node.operator)) {
		return renderLogicalValue(node, context, lines);
	}

	if (!ARITHMETIC_OPERATORS.has(node.operator)) {
		return renderComparisonExpression(node, context, lines);
	}

	const rawLeftType = expressionDataType(
		node.left,
		context.resolveNameType,
		context.ast,
		context.floatContext,
		context.resolveCallType,
		context.wordSize,
		makeThisFieldResolver(context),
		context.narrowingRegions,
		makeThisMethodResolver(context),
		context.objectTypes,
	);
	const rawRightType = expressionDataType(
		node.right,
		context.resolveNameType,
		context.ast,
		context.floatContext,
		context.resolveCallType,
		context.wordSize,
		makeThisFieldResolver(context),
		context.narrowingRegions,
		makeThisMethodResolver(context),
		context.objectTypes,
	);
	const leftType = getNonNullableType(rawLeftType);
	const rightType = getNonNullableType(rawRightType);
	const hasFloatOperand = isFloatType(leftType) || isFloatType(rightType);
	const commonType =
		context.floatContext && node.operator !== "%" && hasFloatOperand
			? context.floatContext
			: widenCommonTypeForValue(
					node.operator,
					node.left,
					node.right,
					normalizeOperandTypes(
						leftType,
						rightType,
						node.operator,
						context.wordSize,
					),
					context.ast,
				);

	const savedFloatContext = context.floatContext;
	if (commonType && !isFloatType(commonType)) {
		context.floatContext = null;
	}
	const leftRendered = unwrapNullableOperand(
		renderExpression(node.left, context, lines),
		rawLeftType,
	);
	const rightRendered = unwrapNullableOperand(
		renderExpression(node.right, context, lines),
		rawRightType,
	);
	context.floatContext = savedFloatContext;

	const castedLeft = castOperand(leftRendered, leftType, commonType);
	const castedRight = castOperand(rightRendered, rightType, commonType);
	const expression = `${castedLeft} ${node.operator} ${castedRight}`;

	if (!commonType) {
		return expression;
	}
	return skipWrap ? expression : `(${expression})`;
};

export const renderUnaryExpression = (node, context, lines) => {
	if (node.operator === "!") {
		return `!(${renderCondition(node.argument, context, lines)})`;
	}

	const renderedArgument = renderExpression(node.argument, context, lines);

	if (node.operator !== "-") {
		return `${node.operator}${renderedArgument}`;
	}

	const operandType = expressionDataType(
		node.argument,
		context.resolveNameType,
		context.ast,
		context.floatContext,
		context.resolveCallType,
		context.wordSize,
		makeThisFieldResolver(context),
		context.narrowingRegions,
		makeThisMethodResolver(context),
		context.objectTypes,
	);
	const negationType = resolveNegationType(operandType, context.wordSize);

	return negationType === operandType
		? `-${renderedArgument}`
		: `-(${context.toCType(negationType)})(${renderedArgument})`;
};

export const renderGroupedExpression = (node, context, lines) => {
	if (node?.type === AST_NODE.binaryExpression) {
		return renderBinaryExpression(node, context, lines, true);
	}
	return renderExpression(node, context, lines);
};
