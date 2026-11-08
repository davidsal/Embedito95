import {
	AST_NODE,
	DATA_TYPE,
	ERROR_CODE,
	FLOAT_TYPES,
	UNRESOLVED_TYPE,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { parseArrayElementType } from "./arrays.js";
import { flattenLogicalChain, resolveLogicalResultType } from "./logical.js";
import { resolveObjectFieldType } from "./object-shapes.js";
import { normalizeOperandTypes } from "./operators.js";
import {
	resolveLiteralDataType,
	resolveNegationType,
} from "./type-resolution.js";
import {
	CHARACTER_TYPES,
	COMPARISON_OPERATORS,
	isNullableType,
	isNumericType,
	LOGICAL_OPERATORS,
	NULL_TYPE,
} from "./types.js";

const resolveObjectTypeName = (context, node) => {
	if (node?.type === AST_NODE.identifier) {
		return context.resolveVariableNameType(node.name, node.loc) ?? null;
	}
	if (node?.type === AST_NODE.memberExpression) {
		const objectType = resolveObjectTypeName(context, node.object);
		if (!objectType || !node.property?.name) {
			return null;
		}
		return (
			resolveObjectFieldType(
				objectType,
				node.property.name,
				context.objectTypes,
			) ?? null
		);
	}
	if (node?.type === AST_NODE.indexExpression) {
		return parseArrayElementType(
			resolveCheckExpressionType(context, node.object),
		);
	}
	return null;
};

const resolveMemberExpressionType = (context, node) => {
	if (node.property?.name) {
		if (
			node.object?.type === AST_NODE.identifier &&
			context.libEnumTypeNames.has(node.object.name) &&
			context.libEnumMembersByType[node.object.name]?.has(node.property.name)
		) {
			return node.object.name;
		}
		if (
			node.object?.type === AST_NODE.identifier &&
			context.enumTypes.has(node.object.name)
		) {
			return node.object.name;
		}
	}
	if (node.property?.name) {
		const objectType = resolveObjectTypeName(context, node.object);
		if (objectType) {
			const fieldType = resolveObjectFieldType(
				objectType,
				node.property.name,
				context.objectTypes,
			);
			if (fieldType) {
				return fieldType;
			}
		}
	}
	return node.object?.type === AST_NODE.identifier ? UNRESOLVED_TYPE : null;
};

const resolveCallExpressionType = (context, node) => {
	if (node.callee?.type === AST_NODE.identifier) {
		const definition =
			context.functionDefinitions[
				context.resolveImportedName(node.callee.name)
			];

		if (definition?.returnType) {
			return definition.returnType;
		}
	}
	return null;
};

const resolveConditionalExpressionType = (context, node) => {
	const consequentType = resolveCheckExpressionType(context, node.consequent);
	const alternateType = resolveCheckExpressionType(context, node.alternate);

	if (consequentType === alternateType) {
		return consequentType;
	}
	if (isNumericType(consequentType) && isNumericType(alternateType)) {
		return normalizeOperandTypes(
			consequentType,
			alternateType,
			undefined,
			context.wordSize,
		);
	}
	return consequentType ?? alternateType ?? null;
};

const resolveLogicalChainType = (context, node) => {
	const operands = flattenLogicalChain(node, node.operator);
	const types = operands.map((operand) =>
		resolveCheckExpressionType(context, operand),
	);
	return resolveLogicalResultType(types, node.operator, context.wordSize);
};

export const resolveCheckExpressionType = (context, node) => {
	if (!node || typeof node !== "object") {
		return null;
	}
	if (node.type === AST_NODE.literal) {
		return resolveLiteralDataType(node);
	}
	if (node.type === AST_NODE.templateLiteral) {
		return DATA_TYPE.string;
	}
	if (node.type === AST_NODE.identifier) {
		return (
			context.resolveVariableRange(node.name)?.type ??
			context.resolveVariableTypeAt(node.name, node.loc) ??
			context.libEnumMemberToType[node.name] ??
			null
		);
	}
	if (node.type === AST_NODE.memberExpression) {
		return resolveMemberExpressionType(context, node);
	}
	if (node.type === AST_NODE.indexExpression) {
		return parseArrayElementType(
			resolveCheckExpressionType(context, node.object),
		);
	}
	if (node.type === AST_NODE.callExpression) {
		return resolveCallExpressionType(context, node);
	}
	if (node.type === AST_NODE.asExpression) {
		return node.targetType.name;
	}
	if (node.type === AST_NODE.parenthesizedExpression) {
		return resolveCheckExpressionType(context, node.expression);
	}
	if (node.type === AST_NODE.unaryExpression) {
		if (node.operator === "!") {
			return DATA_TYPE.boolean;
		}
		const operandType = resolveCheckExpressionType(context, node.argument);
		return node.operator === "-"
			? resolveNegationType(operandType, context.wordSize)
			: operandType;
	}
	if (node.type === AST_NODE.awaitExpression) {
		return resolveCheckExpressionType(context, node.argument);
	}
	if (node.type === AST_NODE.binaryExpression) {
		if (LOGICAL_OPERATORS.has(node.operator)) {
			return resolveLogicalChainType(context, node);
		}
		if (COMPARISON_OPERATORS.has(node.operator)) {
			return DATA_TYPE.boolean;
		}
		return normalizeOperandTypes(
			resolveCheckExpressionType(context, node.left),
			resolveCheckExpressionType(context, node.right),
			node.operator,
			context.wordSize,
		);
	}
	if (node.type === AST_NODE.conditionalExpression) {
		return resolveConditionalExpressionType(context, node);
	}
	return null;
};

export const checkComparisonTypeMismatch = (
	context,
	left,
	right,
	operator,
	location,
) => {
	const leftType = resolveCheckExpressionType(context, left);
	const rightType = resolveCheckExpressionType(context, right);

	if (
		leftType === NULL_TYPE ||
		rightType === NULL_TYPE ||
		(leftType && isNullableType(leftType)) ||
		(rightType && isNullableType(rightType))
	) {
		if (operator === "==" || operator === "!=") {
			const leftIsNullable = leftType === NULL_TYPE || isNullableType(leftType);
			const rightIsNullable =
				rightType === NULL_TYPE || isNullableType(rightType);

			if (leftIsNullable && rightIsNullable) {
				return;
			}
			if (
				(leftType === NULL_TYPE && rightType && !isNullableType(rightType)) ||
				(rightType === NULL_TYPE && leftType && !isNullableType(leftType))
			) {
				context.errors.push(
					makeDiagnostic({
						code: ERROR_CODE.comparisonTypeMismatch,
						params: { operator, leftType, rightType },
						location,
					}),
				);
			}
		}
		return;
	}

	const isEnum =
		context.libEnumTypeNames.has(leftType) ||
		context.libEnumTypeNames.has(rightType) ||
		context.enumTypes.has(leftType) ||
		context.enumTypes.has(rightType);

	if (isEnum && operator !== "==" && operator !== "!=") {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.enumOrderingComparison,
				params: { operator },
				location,
			}),
		);
		return;
	}

	if (!leftType || !rightType || leftType === rightType) {
		return;
	}
	if (isNumericType(leftType) && isNumericType(rightType)) {
		if (FLOAT_TYPES.has(leftType) !== FLOAT_TYPES.has(rightType)) {
			context.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.comparisonTypeMismatch,
					params: { operator, leftType, rightType },
					location,
				}),
			);
		}
		return;
	}

	const isCharMismatch =
		CHARACTER_TYPES.has(leftType) !== CHARACTER_TYPES.has(rightType);
	const charLikeMismatch =
		CHARACTER_TYPES.has(leftType) &&
		CHARACTER_TYPES.has(rightType) &&
		leftType !== rightType;

	if (
		isEnum ||
		isCharMismatch ||
		charLikeMismatch ||
		leftType === DATA_TYPE.boolean ||
		rightType === DATA_TYPE.boolean
	) {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.comparisonTypeMismatch,
				params: { operator, leftType, rightType },
				location,
			}),
		);
	}
};
