import { AST_NODE } from "../constants.js";
import { normalizeOperandTypes } from "./operators.js";
import {
	getNonNullableType,
	isNullableType,
	isNumericType,
	NULL_TYPE,
} from "./types.js";

export const flattenLogicalChain = (node, operator) => {
	const operands = [];
	const stack = [node];
	while (stack.length > 0) {
		const current = stack.pop();
		if (
			current?.type === AST_NODE.binaryExpression &&
			current.operator === operator
		) {
			stack.push(current.right);
			stack.push(current.left);
		} else {
			operands.push(current);
		}
	}
	return operands;
};

const combineLogicalTypes = (leftType, rightType, wordSize) => {
	if (leftType == null) {
		return rightType;
	}
	if (rightType == null) {
		return leftType;
	}
	const left = getNonNullableType(leftType);
	const right = getNonNullableType(rightType);
	if (left === right) {
		return left;
	}
	if (isNumericType(left) && isNumericType(right)) {
		return normalizeOperandTypes(left, right, undefined, wordSize);
	}
	return left;
};

export const resolveLogicalResultType = (types, operator, wordSize) => {
	let resultType = null;
	for (const type of types) {
		resultType = combineLogicalTypes(resultType, type, wordSize);
	}
	const nullable =
		operator === "&&"
			? types.some((type) => isNullableType(type))
			: types.slice(1).some((type) => isNullableType(type));
	if (nullable && resultType && resultType !== NULL_TYPE) {
		return `${resultType} | null`;
	}
	return resultType;
};
