import {
	AST_NODE,
	DATA_TYPE,
	ERROR_CODE,
	SEVERITY,
	UNRESOLVED_TYPE,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { describeExpression } from "./arguments.js";
import { parseArrayType } from "./arrays.js";
import { inferLiteralType, resolveLiteralDataType } from "./type-resolution.js";
import {
	CHARACTER_TYPES,
	INTEGER_TYPES,
	isNullableType,
	isNumericType,
	TYPE_RANGES,
	unwrapParentheses,
} from "./types.js";

const unwrapConditional = (child) => {
	return unwrapParentheses(child)?.type === AST_NODE.conditionalExpression;
};

const isAllowedConditionType = (context, type) => {
	if (!type) {
		return true;
	}
	if (type === DATA_TYPE.boolean || isNumericType(type)) {
		return true;
	}
	if (isNullableType(type)) {
		return true;
	}
	if (CHARACTER_TYPES.has(type)) {
		return true;
	}
	if (type === UNRESOLVED_TYPE) {
		return true;
	}
	if (context.enumTypes?.has(type) || context.libEnumTypeNames?.has(type)) {
		return true;
	}
	if (context.objectTypes?.[type]) {
		return true;
	}
	return Boolean(parseArrayType(type));
};

export const checkTernaryExpression = (context, node) => {
	if (
		unwrapConditional(node.test) ||
		unwrapConditional(node.consequent) ||
		unwrapConditional(node.alternate)
	) {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.nestedTernary,
				location: node.loc,
			}),
		);
		return;
	}

	const testType = context.resolveCheckExpressionType(node.test);

	if (testType && !isAllowedConditionType(context, testType)) {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.ternaryConditionTypeMismatch,
				params: { type: testType },
				location: node.test.loc ?? node.loc,
			}),
		);
	}

	const consequentType = context.resolveCheckExpressionType(node.consequent);
	const alternateType = context.resolveCheckExpressionType(node.alternate);

	if (
		consequentType &&
		alternateType &&
		consequentType !== alternateType &&
		!(isNumericType(consequentType) && isNumericType(alternateType))
	) {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.ternaryBranchTypeMismatch,
				params: { leftType: consequentType, rightType: alternateType },
				location: node.loc,
			}),
		);
	}
};

const checkBranchLiteral = (context, branchNodeUnwrapped, param, range) => {
	if (context.libEnumTypeNames.has(param.type)) {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual:
						typeof branchNodeUnwrapped.value === "number"
							? inferLiteralType(branchNodeUnwrapped.value)
							: typeof branchNodeUnwrapped.value,
					value: branchNodeUnwrapped.value,
				},
				location: branchNodeUnwrapped.loc,
			}),
		);
		return;
	}

	if (
		range &&
		typeof branchNodeUnwrapped.value === "number" &&
		(branchNodeUnwrapped.value < range.min ||
			branchNodeUnwrapped.value > range.max)
	) {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual: inferLiteralType(branchNodeUnwrapped.value),
					value: branchNodeUnwrapped.value,
				},
				location: branchNodeUnwrapped.loc,
			}),
		);
	}

	if (range && typeof branchNodeUnwrapped.value !== "number") {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual:
						typeof branchNodeUnwrapped.value === "string"
							? resolveLiteralDataType(branchNodeUnwrapped)
							: typeof branchNodeUnwrapped.value,
					value: branchNodeUnwrapped.value,
				},
				location: branchNodeUnwrapped.loc,
			}),
		);
	}
};

const checkBranchExpressionType = (
	context,
	branchNodeUnwrapped,
	param,
	range,
) => {
	const branchType = context.resolveCheckExpressionType(branchNodeUnwrapped);

	if (!branchType) {
		return;
	}

	if (context.libEnumTypeNames.has(param.type)) {
		if (branchType !== param.type && branchType !== UNRESOLVED_TYPE) {
			context.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.argumentTypeMismatch,
					params: {
						name: param.name,
						expected: param.type,
						actual: branchType,
						value: describeExpression(branchNodeUnwrapped),
					},
					location: branchNodeUnwrapped.loc,
				}),
			);
		}
		return;
	}

	if (CHARACTER_TYPES.has(param.type)) {
		if (branchType !== param.type) {
			context.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.argumentTypeMismatch,
					params: {
						name: param.name,
						expected: param.type,
						actual: branchType,
						value: describeExpression(branchNodeUnwrapped),
					},
					location: branchNodeUnwrapped.loc,
				}),
			);
		}
		return;
	}

	if (range && !INTEGER_TYPES.has(branchType)) {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual: branchType,
					value: describeExpression(branchNodeUnwrapped),
				},
				location: branchNodeUnwrapped.loc,
			}),
		);
	} else if (range && INTEGER_TYPES.has(branchType)) {
		checkBranchRange(context, branchNodeUnwrapped, param, branchType, range);
	}
};

const checkBranchRange = (
	context,
	branchNodeUnwrapped,
	param,
	branchType,
	range,
) => {
	const branchRange = TYPE_RANGES[branchType];

	if (
		branchRange &&
		(branchRange.min < range.min || branchRange.max > range.max)
	) {
		context.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual: branchType,
					value: describeExpression(branchNodeUnwrapped),
				},
				location: branchNodeUnwrapped.loc,
				severity: SEVERITY.warning,
			}),
		);
	}
};

const checkTernaryBranch = (context, branchNode, param) => {
	const branchNodeUnwrapped = unwrapParentheses(branchNode);
	const range = TYPE_RANGES[param.type];

	if (branchNodeUnwrapped.type === AST_NODE.literal) {
		checkBranchLiteral(context, branchNodeUnwrapped, param, range);
		return;
	}

	checkBranchExpressionType(context, branchNodeUnwrapped, param, range);
};

export const checkTernaryAgainstParam = (context, conditionalNode, param) => {
	checkTernaryBranch(context, conditionalNode.consequent, param);
	checkTernaryBranch(context, conditionalNode.alternate, param);
};
