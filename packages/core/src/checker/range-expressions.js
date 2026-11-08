import { evaluateConstant } from "../const-eval.js";
import {
	ARITHMETIC_OPERATORS,
	AST_NODE,
	DATA_TYPES,
	ERROR_CODE,
	FLOAT_TYPES,
	SEVERITY,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { resolveExpressionType } from "./expressions.js";
import { resolveBinaryOperationType } from "./operators.js";
import { typeIsKnown } from "./type-resolution.js";
import {
	CHARACTER_TYPES,
	COMPARISON_OPERATORS,
	getNonNullableType,
	INTEGER_TYPES,
	isNullableType,
	isNumericType,
	LOGICAL_OPERATORS,
	unwrapToIdentifier,
} from "./types.js";

const NULLISH_COALESCING_OPERATORS = new Set(["??"]);
const NON_NULLISH_LOGICAL_OPERATORS = new Set(["&&", "||"]);

const resolveOperandType = (state, operand) => {
	const identifier = unwrapToIdentifier(operand);
	if (identifier && state.variableTypes.has(identifier.name)) {
		const type = state.context.resolveVariableTypeAt(
			identifier.name,
			identifier.loc,
		);
		if (type) {
			return type;
		}
	}
	return resolveExpressionType(
		state.context.resolveVariableNameType,
		operand,
		undefined,
		undefined,
		state.wordSize,
		state.objectTypes,
	);
};

const isDeferredNullableOperand = (state, operand) => {
	const identifier = unwrapToIdentifier(operand);
	if (!identifier) {
		return false;
	}
	const type = state.context.resolveVariableTypeAt(
		identifier.name,
		identifier.loc,
	);
	return isNullableType(type);
};

export const checkCastTargetType = (state, node) => {
	if (node.type !== AST_NODE.asExpression) {
		return;
	}
	if (
		!typeIsKnown(
			node.targetType.name,
			state.enumTypes,
			state.libEnumTypeNames,
			state.libNameToType,
			state.objectTypeNames,
		)
	) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.unknownType,
				params: { type: node.targetType.name },
				location: node.targetType.loc,
			}),
		);
	}

	if (
		state.platformTypes &&
		DATA_TYPES.has(node.targetType.name) &&
		!state.platformTypes.has(node.targetType.name)
	) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.unsupportedType,
				params: { type: node.targetType.name },
				location: node.targetType.loc,
			}),
		);
	}

	if (FLOAT_TYPES.has(node.targetType.name)) {
		const targetType = state.targetTypeStack[state.targetTypeStack.length - 1];

		if (targetType && INTEGER_TYPES.has(targetType)) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.explicitFloatInIntContext,
					location: node.loc,
				}),
			);
		}
	}
};

const handleArithmeticExpression = (state, node) => {
	if (!ARITHMETIC_OPERATORS.has(node.operator)) {
		return;
	}
	const deferredNullable =
		isDeferredNullableOperand(state, node.left) ||
		isDeferredNullableOperand(state, node.right);
	const leftType = resolveOperandType(state, node.left);
	const rightType = resolveOperandType(state, node.right);

	if (!deferredNullable) {
		if (
			node.operator === "%" &&
			(FLOAT_TYPES.has(leftType) || FLOAT_TYPES.has(rightType)) &&
			leftType &&
			rightType
		) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.floatModulo,
					params: { operator: node.operator },
					location: node.loc,
				}),
			);
		} else if (
			resolveBinaryOperationType(
				node.operator,
				leftType,
				rightType,
				state.wordSize,
			) === null &&
			leftType &&
			rightType
		) {
			const nonNumericType = isNumericType(leftType) ? rightType : leftType;
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.nonNumericOperand,
					params: {
						type: nonNumericType,
						operator: node.operator,
					},
					location: node.loc,
				}),
			);
		}
	}

	if (node.operator === "/" || node.operator === "%") {
		const divisor = evaluateConstant(state.ast, node.right);

		if (divisor === 0) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.divisionByZero,
					params: { operator: node.operator },
					location: node.right?.loc ?? node.loc,
				}),
			);
		}
	}
};

const handleComparisonExpression = (state, node) => {
	const { left, right, operator } = node;

	state.context.checkComparisonTypeMismatch(left, right, operator, node.loc);

	let range = null;
	let variableName = null;
	let literalValue = null;

	if (
		left.type === AST_NODE.identifier &&
		right.type === AST_NODE.literal &&
		typeof right.value === "number"
	) {
		range = state.context.resolveVariableRange(left.name);
		variableName = left.name;
		literalValue = right.value;
	} else if (
		right.type === AST_NODE.identifier &&
		left.type === AST_NODE.literal &&
		typeof left.value === "number"
	) {
		range = state.context.resolveVariableRange(right.name);
		variableName = right.name;
		literalValue = left.value;
	}

	if (!range || range.min === undefined || range.max === undefined) {
		return;
	}

	const result = state.context.evaluateAlwaysCondition(
		range,
		literalValue,
		operator,
	);

	if (result === "true" || result === "false") {
		state.errors.push(
			makeDiagnostic({
				code:
					result === "true"
						? ERROR_CODE.comparisonAlwaysTrue
						: ERROR_CODE.comparisonAlwaysFalse,
				params: {
					name: variableName,
					operator,
					literal: literalValue,
					type: range.type,
					min: range.min,
					max: range.max,
				},
				severity: SEVERITY.warning,
				location: node.loc,
			}),
		);
	}
};

const areLogicalOperandsCompatible = (leftType, rightType) => {
	const left = getNonNullableType(leftType);
	const right = getNonNullableType(rightType);
	if (left === right) {
		return true;
	}
	if (isNumericType(left) && isNumericType(right)) {
		return true;
	}
	if (CHARACTER_TYPES.has(left) && CHARACTER_TYPES.has(right)) {
		return true;
	}
	return false;
};

const isLogicalOperatorNode = (node, operators) => {
	return (
		node?.type === AST_NODE.binaryExpression && operators.has(node.operator)
	);
};

const isMixedLogicalExpression = (node) => {
	if (NULLISH_COALESCING_OPERATORS.has(node.operator)) {
		return (
			isLogicalOperatorNode(node.left, NON_NULLISH_LOGICAL_OPERATORS) ||
			isLogicalOperatorNode(node.right, NON_NULLISH_LOGICAL_OPERATORS)
		);
	}
	if (NON_NULLISH_LOGICAL_OPERATORS.has(node.operator)) {
		return (
			isLogicalOperatorNode(node.left, NULLISH_COALESCING_OPERATORS) ||
			isLogicalOperatorNode(node.right, NULLISH_COALESCING_OPERATORS)
		);
	}
	return false;
};

const handleLogicalExpression = (state, node) => {
	if (isMixedLogicalExpression(node)) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.mixedLogicalOperators,
				location: node.loc,
			}),
		);
		return;
	}

	const leftType = resolveOperandType(state, node.left);
	const rightType = resolveOperandType(state, node.right);

	if (
		!leftType ||
		!rightType ||
		areLogicalOperandsCompatible(leftType, rightType)
	) {
		return;
	}

	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.logicalTypeMismatch,
			params: { operator: node.operator, leftType, rightType },
			location: node.loc,
		}),
	);
};

export const handleBinaryExpression = (state, node) => {
	if (node.type !== AST_NODE.binaryExpression) {
		return;
	}
	handleArithmeticExpression(state, node);

	if (COMPARISON_OPERATORS.has(node.operator)) {
		handleComparisonExpression(state, node);
	}

	if (LOGICAL_OPERATORS.has(node.operator)) {
		handleLogicalExpression(state, node);
	}
};

export const handleConditionalExpression = (state, node) => {
	if (node.type === AST_NODE.conditionalExpression) {
		state.context.checkTernaryExpression(node);
	}
};

export const handleUnaryExpression = (state, node) => {
	if (node.type === AST_NODE.unaryExpression) {
		state.context.checkUnaryExpression(node);
	}
};
