import {
	CHARACTER_TYPES,
	COMPARISON_OPERATORS,
	flattenLogicalChain,
	getNonNullableType,
	isNullableType,
	isNumericType,
	isObjectShapeType,
	parseArrayType,
} from "../checker/index.js";
import { AST_NODE, DATA_TYPE } from "../constants.js";
import { optionalName } from "./c-types.js";
import { renderExpression } from "./expression.js";
import {
	expressionDataType,
	makeThisFieldResolver,
	makeThisMethodResolver,
} from "./type-resolve.js";

const TRUTHINESS_KIND = {
	unknown: "unknown",
	always: "always",
	boolean: "boolean",
	string: "string",
	numeric: "numeric",
};

const LOGICAL_TEMP_PREFIX = "_e95_t";

const resolveValueType = (node, context) => {
	return expressionDataType(
		node,
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
};

const resolveDeclaredType = (node, context) => {
	if (node?.type === AST_NODE.identifier) {
		return context.resolveNameType?.(node.name, node.loc) ?? null;
	}
	return resolveValueType(node, context);
};

const truthinessKind = (context, type) => {
	if (!type) {
		return TRUTHINESS_KIND.unknown;
	}
	const nonNull = getNonNullableType(type);
	if (nonNull === DATA_TYPE.boolean) {
		return TRUTHINESS_KIND.boolean;
	}
	if (CHARACTER_TYPES.has(nonNull)) {
		return nonNull === DATA_TYPE.char
			? TRUTHINESS_KIND.always
			: TRUTHINESS_KIND.string;
	}
	if (isNumericType(nonNull)) {
		return TRUTHINESS_KIND.numeric;
	}
	if (
		parseArrayType(nonNull) ||
		isObjectShapeType(nonNull) ||
		context.objectTypes?.[nonNull]
	) {
		return TRUTHINESS_KIND.always;
	}
	return TRUTHINESS_KIND.numeric;
};

const renderRawOperand = (node, context, lines) => {
	if (node?.type === AST_NODE.identifier) {
		const originalName = context.resolveImportedName?.(node.name) ?? node.name;
		const namespace = context.importNamespaces?.get(originalName);
		return namespace ? `${namespace}::${originalName}` : originalName;
	}
	return renderExpression(node, context, lines);
};

const renderTruthinessForType = (kind, nullable, rendered) => {
	if (kind === TRUTHINESS_KIND.always) {
		return nullable ? `!${rendered}.isNull` : "true";
	}
	if (kind === TRUTHINESS_KIND.unknown) {
		return nullable ? `!${rendered}.isNull` : rendered;
	}
	const value = nullable ? `${rendered}.value` : rendered;
	if (kind === TRUTHINESS_KIND.boolean) {
		return nullable ? `(!${rendered}.isNull && ${value})` : value;
	}
	if (kind === TRUTHINESS_KIND.string) {
		const check = `${value}.length() != 0`;
		return nullable ? `(!${rendered}.isNull && ${check})` : check;
	}
	const check = `${value} != 0`;
	return nullable ? `(!${rendered}.isNull && ${check})` : check;
};

const renderTruthiness = (node, context, lines) => {
	const type = resolveDeclaredType(node, context);
	return renderTruthinessForType(
		truthinessKind(context, type),
		isNullableType(type),
		renderRawOperand(node, context, lines),
	);
};

export const renderCondition = (node, context, lines) => {
	if (node?.type === AST_NODE.parenthesizedExpression) {
		return `(${renderCondition(node.expression, context, lines)})`;
	}
	if (node?.type === AST_NODE.unaryExpression && node.operator === "!") {
		return `!(${renderCondition(node.argument, context, lines)})`;
	}
	if (node?.type === AST_NODE.binaryExpression) {
		if (node.operator === "&&" || node.operator === "||") {
			return `(${renderCondition(node.left, context, lines)} ${node.operator} ${renderCondition(node.right, context, lines)})`;
		}
		if (node.operator === "??") {
			const resultType = resolveDeclaredType(node, context);
			const value = renderLogicalValue(node, context, lines);
			return renderTruthinessForType(
				truthinessKind(context, resultType),
				isNullableType(resultType),
				value,
			);
		}
		if (COMPARISON_OPERATORS.has(node.operator)) {
			return renderExpression(node, context, lines);
		}
	}
	return renderTruthiness(node, context, lines);
};

const hasSideEffects = (node) => {
	if (!node || typeof node !== "object") {
		return false;
	}
	if (
		node.type === AST_NODE.callExpression ||
		node.type === AST_NODE.assignmentExpression ||
		node.type === AST_NODE.updateExpression ||
		node.type === AST_NODE.awaitExpression
	) {
		return true;
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			continue;
		}
		if (Array.isArray(value)) {
			if (value.some((item) => hasSideEffects(item))) {
				return true;
			}
		} else if (value && typeof value === "object") {
			if (hasSideEffects(value)) {
				return true;
			}
		}
	}
	return false;
};

const collectLogicalTemporaries = (operands, context, lines) => {
	const tempNames = new Map();
	const declarations = [];
	operands.forEach((operand, index) => {
		if (index < operands.length - 1 && hasSideEffects(operand)) {
			const name = `${LOGICAL_TEMP_PREFIX}${index}`;
			declarations.push(
				`auto ${name} = ${renderExpression(operand, context, lines)}`,
			);
			tempNames.set(index, name);
		}
	});
	return { tempNames, declarations };
};

const renderLogicalOperand = (state, index) => {
	return (
		state.tempNames.get(index) ??
		renderExpression(state.operands[index], state.context, state.lines)
	);
};

const wrapLogicalResult = (state, raw, producedNullable) => {
	if (state.resultNullable && !producedNullable) {
		return `${optionalName(state.nonNullCType)}{ false, ${raw} }`;
	}
	return raw;
};

const renderLogicalFallback = (state, index) => {
	return wrapLogicalResult(
		state,
		renderLogicalOperand(state, index),
		isNullableType(state.types[index]),
	);
};

const renderLogicalBranch = (state, index) => {
	const raw = isNullableType(state.types[index])
		? `${renderLogicalOperand(state, index)}.value`
		: renderLogicalOperand(state, index);
	return wrapLogicalResult(state, raw, false);
};

const renderLogicalTruthiness = (state, index) => {
	return renderTruthinessForType(
		truthinessKind(state.context, state.types[index]),
		isNullableType(state.types[index]),
		renderLogicalOperand(state, index),
	);
};

const foldLogicalOperand = (state, index, result) => {
	const kind = truthinessKind(state.context, state.types[index]);
	const nullable = isNullableType(state.types[index]);
	if (state.operator === "??") {
		if (!nullable) {
			return renderLogicalBranch(state, index);
		}
		return `(${renderLogicalOperand(state, index)}.isNull ? ${result} : ${renderLogicalBranch(state, index)})`;
	}
	if (state.operator === "||") {
		if (!nullable && kind === TRUTHINESS_KIND.always) {
			return renderLogicalBranch(state, index);
		}
		return `(${renderLogicalTruthiness(state, index)} ? ${renderLogicalBranch(state, index)} : ${result})`;
	}
	if (!nullable && kind === TRUTHINESS_KIND.always) {
		// `truthy && result` yields `result`; the operand is still evaluated
		// when it has side effects (through its temporary).
		return result;
	}
	return `(${renderLogicalTruthiness(state, index)} ? ${result} : ${renderLogicalFallback(state, index)})`;
};

export const renderLogicalValue = (node, context, lines) => {
	const operator = node.operator;
	const operands = flattenLogicalChain(node, operator);
	const types = operands.map((operand) => resolveValueType(operand, context));
	const resultType = resolveValueType(node, context);
	const resultNullable = isNullableType(resultType);
	const { tempNames, declarations } = collectLogicalTemporaries(
		operands,
		context,
		lines,
	);
	const state = {
		context,
		lines,
		operands,
		types,
		operator,
		tempNames,
		resultNullable,
		nonNullCType: resultNullable
			? context.toCType(getNonNullableType(resultType))
			: null,
	};

	let result = renderLogicalFallback(state, operands.length - 1);
	for (let index = operands.length - 2; index >= 0; index -= 1) {
		result = foldLogicalOperand(state, index, result);
	}

	if (declarations.length > 0) {
		return `({ ${declarations.join("; ")}; ${result}; })`;
	}
	return result;
};
