import { evaluateConstant } from "../const-eval.js";
import { AST_NODE, DATA_TYPE } from "../constants.js";
import { inferObjectFields } from "./expression-objects.js";
import { encodeObjectShape, resolveObjectFieldType } from "./object-shapes.js";
import { containsType, resolveBinaryOperationType } from "./operators.js";
import {
	resolveLiteralDataType,
	resolveNegationType,
} from "./type-resolution.js";
import { isNumericType, NULL_TYPE } from "./types.js";

const mergeReturnTypes = (types) => {
	const unique = [...new Set(types.filter(Boolean))];

	if (unique.length <= 1) {
		return { type: unique[0] ?? null };
	}

	if (unique.some((type) => type === NULL_TYPE)) {
		const nonNull = unique.filter((type) => type !== NULL_TYPE);
		if (nonNull.length === 0) {
			return { type: NULL_TYPE };
		}
		const merged = mergeReturnTypes(nonNull);
		if (merged.conflict || merged.type == null) {
			return { conflict: true };
		}
		return { type: `${merged.type} | null` };
	}

	if (unique.some((type) => type === DATA_TYPE.f64)) {
		return unique.every((type) => isNumericType(type))
			? { type: DATA_TYPE.f64 }
			: { conflict: true };
	}
	if (unique.some((type) => type === DATA_TYPE.f32)) {
		return unique.every((type) => isNumericType(type))
			? { type: DATA_TYPE.f32 }
			: { conflict: true };
	}

	let result = unique[0];
	for (const type of unique) {
		if (containsType(result, type)) {
			continue;
		}
		if (containsType(type, result)) {
			result = type;
			continue;
		}
		return { conflict: true };
	}
	return { type: result };
};

const resolveReturnArgumentType = (
	node,
	resolveNameType,
	resolveCallType,
	wordSize,
	objectTypes,
) => {
	if (!node || typeof node !== "object") {
		return null;
	}
	switch (node.type) {
		case AST_NODE.literal:
			return resolveLiteralDataType(node);
		case AST_NODE.templateLiteral:
			return DATA_TYPE.string;
		case AST_NODE.identifier:
			return resolveNameType?.(node.name, node.loc) ?? null;
		case AST_NODE.callExpression:
			return resolveCallType?.(node.callee?.name) ?? null;
		case AST_NODE.memberExpression: {
			if (node.object?.type === AST_NODE.thisExpression) {
				return null;
			}
			const objectType =
				node.object?.type === AST_NODE.identifier
					? (resolveNameType?.(node.object.name, node.object.loc) ?? null)
					: null;
			return objectType
				? (resolveObjectFieldType(
						objectType,
						node.property?.name,
						objectTypes,
					) ?? null)
				: null;
		}
		case AST_NODE.asExpression:
			return node.targetType.name;
		case AST_NODE.parenthesizedExpression:
			return resolveReturnArgumentType(
				node.expression,
				resolveNameType,
				resolveCallType,
				wordSize,
				objectTypes,
			);
		case AST_NODE.unaryExpression: {
			const operand = resolveReturnArgumentType(
				node.argument,
				resolveNameType,
				resolveCallType,
				wordSize,
				objectTypes,
			);
			return node.operator === "-" && operand
				? resolveNegationType(operand, wordSize)
				: operand;
		}
		case AST_NODE.binaryExpression: {
			const left = resolveReturnArgumentType(
				node.left,
				resolveNameType,
				resolveCallType,
				wordSize,
				objectTypes,
			);
			const right = resolveReturnArgumentType(
				node.right,
				resolveNameType,
				resolveCallType,
				wordSize,
				objectTypes,
			);
			return left && right
				? resolveBinaryOperationType(node.operator, left, right)
				: null;
		}
		case AST_NODE.objectLiteral: {
			const fields = inferObjectFields(
				node,
				resolveNameType,
				resolveCallType,
				{},
				wordSize,
			);
			return encodeObjectShape(fields);
		}
		case AST_NODE.conditionalExpression: {
			const types = [
				resolveReturnArgumentType(
					node.consequent,
					resolveNameType,
					resolveCallType,
					wordSize,
					objectTypes,
				),
				resolveReturnArgumentType(
					node.alternate,
					resolveNameType,
					resolveCallType,
					wordSize,
					objectTypes,
				),
			].filter(Boolean);
			const merged = mergeReturnTypes(types);
			return merged.conflict ? null : merged.type;
		}
		default:
			return null;
	}
};

const collectReturnTypes = (
	node,
	resolveNameType,
	resolveCallType,
	wordSize,
	ast,
	returns,
	objectTypes,
) => {
	const visit = (current) => {
		if (!current) {
			return;
		}
		if (Array.isArray(current)) {
			for (const child of current) {
				visit(child);
			}
			return;
		}
		if (current.type === AST_NODE.returnStatement) {
			const type = resolveReturnArgumentType(
				current.argument,
				resolveNameType,
				resolveCallType,
				wordSize,
				objectTypes,
			);
			if (type) {
				returns.push({
					type,
					value: ast ? evaluateConstant(ast, current.argument) : null,
					argument: current.argument,
					loc: current.loc,
				});
			}
			return;
		}
		if (current.type === AST_NODE.blockStatement) {
			visit(current.body);
			return;
		}
		if (current.type === AST_NODE.ifStatement) {
			visit(current.consequent);
			visit(current.alternate);
			return;
		}
		if (current.type === AST_NODE.switchStatement) {
			for (const switchCase of current.cases ?? []) {
				visit(switchCase.consequent);
			}
			return;
		}
		if (
			current.type === AST_NODE.whileStatement ||
			current.type === AST_NODE.forStatement ||
			current.type === AST_NODE.doWhileStatement
		) {
			visit(current.body);
		}
	};
	visit(node);
};

export const inferFunctionReturnType = (
	functionExpression,
	resolveNameType,
	resolveCallType,
	wordSize,
	ast,
	objectTypes,
) => {
	const returns = [];
	collectReturnTypes(
		functionExpression.body?.body,
		resolveNameType,
		resolveCallType,
		wordSize,
		ast,
		returns,
		objectTypes,
	);
	const types = returns.map((entry) => entry.type);
	return { ...mergeReturnTypes(types), returns };
};
