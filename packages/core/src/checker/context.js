import {
	AST_NODE,
	DATA_TYPE,
	ERROR_CODE,
	FLOAT_TYPES,
	SEVERITY,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { isAsyncTaskType } from "./async-task-type.js";
import {
	checkComparisonTypeMismatch,
	resolveCheckExpressionType,
} from "./comparisons.js";
import { resolveAssignmentTruncation } from "./expression-assignment.js";
import { resolveExpressionType } from "./expressions.js";
import { createNarrowedTypeResolver } from "./narrowing.js";
import { checkMethodOnlyObjectLiteral } from "./object-method-validation.js";
import { validateObjectAssignment } from "./object-validation.js";
import { checkTernaryAgainstParam, checkTernaryExpression } from "./ternary.js";
import {
	CHARACTER_TYPES,
	getNonNullableType,
	INTEGER_TYPES,
	isArbitraryUnionType,
	isNullableType,
	isNullLiteralNode,
	isNumericType,
	TYPE_RANGES,
	unwrapParentheses,
} from "./types.js";

// Names bound by an enclosing function/block: every scope except the module-level
// one at index 0. Used to reject an inline callback-record method that would need
// to capture local state.
const collectLocalBindingNames = (rangeScopes) => {
	const names = new Set();
	for (let index = 1; index < rangeScopes.length; index++) {
		for (const name of rangeScopes[index].keys()) {
			names.add(name);
		}
	}
	return names;
};

// `value as f32` is a legal, exact cast wherever it appears; the snag is
// storing the resulting float value in an integer target, which is an implicit
// float -> int conversion and therefore an error (not a truncation warning).
// A plain float literal (`const x: i16 = 1.5`) is not an explicit float cast
// and keeps its current truncating-literal behavior.
const isExplicitFloatCast = (node) => {
	const expression = unwrapParentheses(node);
	return (
		expression?.type === AST_NODE.asExpression &&
		FLOAT_TYPES.has(expression.targetType?.name)
	);
};

export const buildCheckContext = ({
	ast,
	errors,
	objectTypes,
	variableTypes,
	libEnumMemberToType,
	libEnumMembersByType,
	libEnumTypeNames,
	enumTypes,
	functionDefinitions,
	resolveImportedName,
	wordSize,
	resolveCallType,
	narrowingRegions,
	allowNullObjectDefaults = false,
}) => {
	const rangeScopes = [new Map()];

	const registerVariableRange = (name, entry) => {
		if (!name || !entry || rangeScopes.length === 0) {
			return;
		}
		rangeScopes[rangeScopes.length - 1].set(name, entry);
	};

	const resolveVariableRange = (name) => {
		for (let index = rangeScopes.length - 1; index >= 0; index--) {
			const entry = rangeScopes[index].get(name);
			if (entry) {
				return entry;
			}
		}
		return null;
	};

	const resolveVariableNameType = (name, loc) => {
		const ranged = resolveVariableRange(name)?.type;
		if (ranged) {
			return ranged;
		}
		const type = variableTypes.resolve(name, loc);
		return type && (objectTypes[type] || isAsyncTaskType(type))
			? type
			: undefined;
	};

	const resolveVariableTypeAt = createNarrowedTypeResolver(
		variableTypes,
		narrowingRegions,
	);

	const checkValueOutOfRange = (name, value, variableType, location) => {
		const range = TYPE_RANGES[variableType];

		if (
			!range ||
			typeof value !== "number" ||
			!Number.isInteger(value) ||
			(value >= range.min && value <= range.max)
		) {
			return;
		}

		errors.push(
			makeDiagnostic({
				code: ERROR_CODE.valueOutOfRange,
				params: {
					name: name ?? "?",
					value,
					type: variableType,
					min: range.min,
					max: range.max,
				},
				location,
			}),
		);
	};

	const checkAssignmentTypeMismatch = (
		name,
		targetType,
		rhsNode,
		floatContext,
		location,
		resolveCallType = null,
	) => {
		if (isArbitraryUnionType(targetType)) {
			return;
		}
		if (
			rhsNode?.type === AST_NODE.objectLiteral &&
			objectTypes?.[targetType]?.fields
		) {
			const localNames = collectLocalBindingNames(rangeScopes);
			errors.push(
				...validateObjectAssignment(
					rhsNode,
					targetType,
					objectTypes,
					resolveVariableNameType,
					wordSize,
					localNames,
					allowNullObjectDefaults,
				),
				...checkMethodOnlyObjectLiteral(
					rhsNode,
					targetType,
					objectTypes,
					localNames,
				),
			);
		}

		const rhsType = resolveExpressionType(
			resolveVariableNameType,
			rhsNode,
			floatContext,
			undefined,
			wordSize,
			objectTypes,
		);
		const callAwareRhsType = resolveCallType
			? resolveExpressionType(
					resolveVariableNameType,
					rhsNode,
					floatContext,
					resolveCallType,
					wordSize,
					objectTypes,
				)
			: null;

		if (
			rhsType &&
			isNullableType(rhsType) &&
			targetType &&
			!isNullableType(targetType)
		) {
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.assignmentTypeMismatch,
					params: { name: name ?? "?", type: targetType, rhsType },
					location,
				}),
			);
			return;
		}

		const nonNullTarget = targetType
			? getNonNullableType(targetType)
			: targetType;
		const nonNullRhs = rhsType ? getNonNullableType(rhsType) : rhsType;
		const nonNullCallRhs = callAwareRhsType
			? getNonNullableType(callAwareRhsType)
			: null;
		const taskRhsType = isAsyncTaskType(nonNullRhs)
			? rhsType
			: isAsyncTaskType(nonNullCallRhs)
				? callAwareRhsType
				: null;
		if (taskRhsType && !isAsyncTaskType(nonNullTarget)) {
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.assignmentTypeMismatch,
					params: { name: name ?? "?", type: targetType, rhsType: taskRhsType },
					location,
				}),
			);
			return;
		}
		const targetIsChar = CHARACTER_TYPES.has(nonNullTarget);
		const rhsIsChar = CHARACTER_TYPES.has(nonNullRhs);

		if (rhsType && !isNullLiteralNode(rhsNode) && (targetIsChar || rhsIsChar)) {
			if (targetIsChar !== rhsIsChar) {
				errors.push(
					makeDiagnostic({
						code: ERROR_CODE.assignmentTypeMismatch,
						params: {
							name: name ?? "?",
							type: targetType,
							rhsType,
						},
						location,
					}),
				);
				return;
			}
			if (targetIsChar && rhsIsChar && nonNullTarget !== nonNullRhs) {
				errors.push(
					makeDiagnostic({
						code: ERROR_CODE.assignmentTypeMismatch,
						params: {
							name: name ?? "?",
							type: targetType,
							rhsType,
						},
						location,
					}),
				);
				return;
			}
		}

		if (isExplicitFloatCast(rhsNode) && INTEGER_TYPES.has(nonNullTarget)) {
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.explicitFloatInIntContext,
					location,
				}),
			);
			return;
		}

		if (
			resolveAssignmentTruncation(
				rhsNode,
				rhsType,
				targetType,
				floatContext,
				ast,
			)
		) {
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.assignmentTypeMismatch,
					params: {
						name: name ?? "?",
						type: targetType,
						rhsType,
					},
					location,
					severity: SEVERITY.warning,
				}),
			);
		}
	};

	const checkUnaryExpression = (node) => {
		if (node.operator !== "-") {
			return;
		}

		const argument = unwrapParentheses(node.argument);
		let operandType = null;

		if (argument?.type === AST_NODE.identifier) {
			operandType = resolveVariableTypeAt(argument.name, argument.loc);
		}

		if (!operandType) {
			operandType = resolveCheckExpressionType(node.argument);
		}

		if (
			!operandType ||
			isNullableType(operandType) ||
			isNumericType(operandType)
		) {
			return;
		}

		errors.push(
			makeDiagnostic({
				code: ERROR_CODE.nonNumericOperand,
				params: { operator: "-", type: operandType },
				location: node.loc,
			}),
		);
	};

	const evaluateAlwaysCondition = (range, value, operator) => {
		const { min, max } = range;
		switch (operator) {
			case "<":
				return max < value ? "true" : min >= value ? "false" : null;
			case "<=":
				return max <= value ? "true" : min > value ? "false" : null;
			case ">":
				return min > value ? "true" : max <= value ? "false" : null;
			case ">=":
				return min >= value ? "true" : max < value ? "false" : null;
			case "==":
				return min === max && min === value
					? "true"
					: value < min || value > max
						? "false"
						: null;
			case "!=":
				return value < min || value > max
					? "true"
					: min === max && min === value
						? "false"
						: null;
			default:
				return null;
		}
	};

	const resolveMethodArgumentType = (node) => {
		if (node?.type === AST_NODE.arrayLiteral) {
			return resolveExpressionType(
				resolveVariableTypeAt,
				node,
				undefined,
				resolveCallType,
				wordSize,
				objectTypes,
				ast,
			);
		}
		if (node?.type === AST_NODE.awaitExpression) {
			// `await AsyncTask<T>` yields `T`; the expression resolver already
			// unwraps the task payload, so the method argument path delegates to
			// it instead of duplicating the unwrapping.
			return resolveExpressionType(
				resolveVariableTypeAt,
				node,
				undefined,
				resolveCallType,
				wordSize,
				objectTypes,
				ast,
			);
		}
		if (node?.type === AST_NODE.callExpression) {
			if (node.callee?.type === AST_NODE.identifier) {
				return resolveCallType(node.callee.name) ?? null;
			}
			if (node.callee?.type === AST_NODE.memberExpression) {
				const objectName = node.callee.object?.name;
				const propertyName = node.callee.property?.name;
				const objectType = objectName
					? variableTypes.resolve(objectName, node.callee.object.loc)
					: null;
				const method = objectType
					? objectTypes[objectType]?.methods?.[propertyName]
					: null;
				return method?.returnType ?? null;
			}
			return null;
		}
		if (node?.type === AST_NODE.templateLiteral) {
			return DATA_TYPE.string;
		}
		if (node?.type === AST_NODE.asExpression) {
			return node.targetType?.name ?? null;
		}
		return null;
	};

	const context = {
		errors,
		objectTypes,
		libEnumTypeNames,
		libEnumMemberToType,
		libEnumMembersByType,
		enumTypes,
		functionDefinitions,
		resolveImportedName,
		resolveCallType,
		wordSize,
		rangeScopes,
		registerVariableRange,
		resolveVariableRange,
		resolveVariableNameType,
		resolveVariableTypeAt,
		resolveLocalBindingNames: () => collectLocalBindingNames(rangeScopes),
		checkValueOutOfRange,
		checkAssignmentTypeMismatch,
		checkUnaryExpression,
		evaluateAlwaysCondition,
		resolveMethodArgumentType,
	};

	const fullContext = {
		...context,
		resolveCheckExpressionType: (node) =>
			resolveCheckExpressionType(context, node),
		checkComparisonTypeMismatch: (left, right, operator, location) =>
			checkComparisonTypeMismatch(context, left, right, operator, location),
	};

	return {
		...fullContext,
		checkTernaryExpression: (node) => checkTernaryExpression(fullContext, node),
		checkTernaryAgainstParam: (conditionalNode, param) =>
			checkTernaryAgainstParam(fullContext, conditionalNode, param),
	};
};
