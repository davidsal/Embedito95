import { evaluateConstant } from "../const-eval.js";
import { AST_NODE, FLOAT_TYPES } from "../constants.js";
import {
	getNonNullableType,
	INTEGER_TYPES,
	rangeFitsWithin,
	TYPE_RANGES,
} from "./types.js";

export const resolveAssignmentTruncation = (
	rhsNode,
	rhsType,
	targetType,
	floatContext,
	ast,
) => {
	if (
		!targetType ||
		!rhsNode ||
		rhsNode.type === AST_NODE.literal ||
		evaluateConstant(ast, rhsNode, floatContext) !== null
	) {
		return null;
	}
	if (!rhsType) {
		return null;
	}
	const nonNullTarget = getNonNullableType(targetType);
	const nonNullRhs = getNonNullableType(rhsType);
	if (INTEGER_TYPES.has(nonNullRhs) && INTEGER_TYPES.has(nonNullTarget)) {
		const targetRange = TYPE_RANGES[nonNullTarget];
		const rhsRange = TYPE_RANGES[nonNullRhs];

		if (rangeFitsWithin(rhsRange, targetRange)) {
			return null;
		}
	} else if (
		(!INTEGER_TYPES.has(nonNullRhs) && !FLOAT_TYPES.has(nonNullRhs)) ||
		nonNullRhs === nonNullTarget
	) {
		return null;
	}
	return rhsType;
};
