import {
	AST_NODE,
	DATA_TYPE,
	FLOAT_TYPES,
	UNKNOWN,
	UNRESOLVED_TYPE,
} from "../constants.js";
import { resolveArrayMethod } from "./array-methods.js";
import {
	inferArrayElementType,
	parseArrayElementType,
	parseArrayType,
} from "./arrays.js";
import { unwrapAsyncTaskType } from "./async-task-type.js";
import {
	inferObjectFields,
	resolveSelfFieldForType,
	selfContextStack,
} from "./expression-objects.js";
import { flattenLogicalChain, resolveLogicalResultType } from "./logical.js";
import { encodeObjectShape, resolveObjectFieldType } from "./object-shapes.js";
import { normalizeOperandTypes } from "./operators.js";
import { resolveStringMethod } from "./string-methods.js";
import {
	resolveLiteralDataType,
	resolveNegationType,
	resolveWordDataType,
} from "./type-resolution.js";
import { COMPARISON_OPERATORS, LOGICAL_OPERATORS } from "./types.js";

export const resolveMethodCallReturnType = (
	receiverType,
	methodName,
	objectTypes,
) => {
	const method = receiverType
		? objectTypes?.[receiverType]?.methods?.[methodName]
		: null;
	if (method) {
		return method.returnType ?? null;
	}
	const arrayType = receiverType ? parseArrayType(receiverType) : null;
	const arrayMethod = arrayType
		? resolveArrayMethod(methodName, arrayType.elementType)
		: null;
	if (arrayMethod) {
		return arrayMethod.returnType;
	}
	const stringMethod =
		receiverType === DATA_TYPE.string ? resolveStringMethod(methodName) : null;
	return stringMethod ? stringMethod.returnType : null;
};

const resolveCallReceiverType = (
	node,
	resolveNameType,
	resolveCallType,
	wordSize,
	objectTypes,
	options,
) => {
	const callee = node.callee;
	if (callee?.type === AST_NODE.identifier) {
		return resolveCallType ? resolveCallType(callee.name) : null;
	}
	return resolveMemberCallType(
		callee,
		resolveNameType,
		resolveCallType,
		wordSize,
		objectTypes,
		options,
	);
};

// Array literals are receivers too (`[1, 2].length()`): infer the element type
// with the same helper the checker uses for array initializers, so the member
// surface matches what codegen emits. An empty literal has no element evidence,
// so it still exposes the array surface with an unknown element placeholder.
const resolveArrayLiteralReceiverType = (
	node,
	resolveNameType,
	wordSize,
	options,
) => {
	const elementType = inferArrayElementType(
		options.ast ?? null,
		node.elements,
		resolveNameType,
		options.wordType ?? resolveWordDataType(wordSize),
		options.resolveElementType ?? null,
		options.widenToWord ?? true,
	);
	return `${elementType ?? UNKNOWN}[]`;
};

// Resolves the declared type of a member-expression receiver, whatever its
// shape: a name, a nested field chain, `this.<field>`, an indexed element, a
// literal, an array literal, a parenthesized expression, a cast, a conditional
// or a call. The checker uses it to validate `receiver.method(...)`; the codegen
// uses the same helper to choose between a free-function call and a real member
// call.
export const resolveReceiverType = (
	node,
	resolveNameType,
	resolveCallType = null,
	wordSize = null,
	objectTypes = null,
	options = {},
) => {
	const {
		selfType = null,
		resolveAsType = null,
		isObjectHandle = null,
		ast = null,
		wordType = null,
		resolveElementType = null,
		widenToWord = true,
	} = options;
	const receiverOptions = {
		selfType,
		resolveAsType,
		isObjectHandle,
		ast,
		wordType,
		resolveElementType,
		widenToWord,
	};
	if (!node) {
		return null;
	}
	if (node.type === AST_NODE.identifier) {
		return resolveNameType ? resolveNameType(node.name, node.loc) : null;
	}
	if (node.type === AST_NODE.literal) {
		return resolveLiteralDataType(node);
	}
	if (node.type === AST_NODE.arrayLiteral) {
		return resolveArrayLiteralReceiverType(
			node,
			resolveNameType,
			wordSize,
			receiverOptions,
		);
	}
	if (node.type === AST_NODE.thisExpression) {
		return selfType;
	}
	if (node.type === AST_NODE.memberExpression) {
		const propertyName = node.property?.name;
		if (node.object?.type === AST_NODE.thisExpression) {
			if (selfType) {
				const fields = objectTypes?.[selfType];
				return (
					fields?.fields?.[propertyName]?.type ??
					fields?.capturedFieldTypes?.get(propertyName) ??
					null
				);
			}
			return resolveSelfFieldForType(propertyName, objectTypes)?.type ?? null;
		}
		const baseType = resolveReceiverType(
			node.object,
			resolveNameType,
			resolveCallType,
			wordSize,
			objectTypes,
			receiverOptions,
		);
		if (!baseType) {
			return null;
		}
		return resolveObjectFieldType(baseType, propertyName, objectTypes);
	}
	if (node.type === AST_NODE.indexExpression) {
		const baseType = resolveReceiverType(
			node.object,
			resolveNameType,
			resolveCallType,
			wordSize,
			objectTypes,
			receiverOptions,
		);
		const arrayType = baseType ? parseArrayType(baseType) : null;
		return arrayType ? arrayType.elementType : null;
	}
	if (node.type === AST_NODE.parenthesizedExpression) {
		return resolveReceiverType(
			node.expression,
			resolveNameType,
			resolveCallType,
			wordSize,
			objectTypes,
			receiverOptions,
		);
	}
	if (node.type === AST_NODE.asExpression) {
		const targetName = node.targetType?.name ?? null;
		if (resolveAsType) {
			return resolveAsType(targetName);
		}
		if (isObjectHandle) {
			return targetName && isObjectHandle(targetName) ? targetName : null;
		}
		return targetName;
	}
	if (node.type === AST_NODE.callExpression) {
		return resolveCallReceiverType(
			node,
			resolveNameType,
			resolveCallType,
			wordSize,
			objectTypes,
			receiverOptions,
		);
	}
	if (node.type === AST_NODE.conditionalExpression) {
		const consequentType = resolveReceiverType(
			node.consequent,
			resolveNameType,
			resolveCallType,
			wordSize,
			objectTypes,
			receiverOptions,
		);
		const alternateType = resolveReceiverType(
			node.alternate,
			resolveNameType,
			resolveCallType,
			wordSize,
			objectTypes,
			receiverOptions,
		);
		return consequentType && consequentType === alternateType
			? consequentType
			: null;
	}
	return null;
};

export const resolveMemberCallType = (
	callee,
	resolveNameType,
	resolveCallType = null,
	wordSize = null,
	objectTypes = null,
	options = {},
) => {
	if (callee?.type !== AST_NODE.memberExpression) {
		return null;
	}
	const methodName = callee.property?.name;
	if (callee.object?.type === AST_NODE.thisExpression && !options.selfType) {
		for (let index = selfContextStack.length - 1; index >= 0; index--) {
			const method =
				objectTypes?.[selfContextStack[index]]?.methods?.[methodName];
			if (method) {
				return method.returnType ?? null;
			}
		}
	}
	const receiverType = resolveReceiverType(
		callee.object,
		resolveNameType,
		resolveCallType,
		wordSize,
		objectTypes,
		options,
	);
	return resolveMethodCallReturnType(receiverType, methodName, objectTypes);
};

const resolveLogicalExpressionType = (
	resolveNameType,
	node,
	floatContext,
	resolveCallType,
	wordSize,
	objectTypes,
	ast,
	wordType,
	resolveElementType,
	widenToWord,
) => {
	const operands = flattenLogicalChain(node, node.operator);
	const types = operands.map((operand) =>
		resolveExpressionType(
			resolveNameType,
			operand,
			floatContext,
			resolveCallType,
			wordSize,
			objectTypes,
			ast,
			wordType,
			resolveElementType,
			widenToWord,
		),
	);
	return resolveLogicalResultType(types, node.operator, wordSize);
};

const makeExpressionResolveContext = (
	resolveNameType,
	floatContext,
	resolveCallType,
	wordSize,
	objectTypes,
	ast,
	wordType,
	resolveElementType,
	widenToWord,
) => {
	return {
		resolveNameType,
		floatContext,
		resolveCallType,
		wordSize,
		objectTypes,
		ast,
		wordType,
		resolveElementType,
		widenToWord,
	};
};

const resolveExpressionChild = (child, context) => {
	return resolveExpressionType(
		context.resolveNameType,
		child,
		context.floatContext,
		context.resolveCallType,
		context.wordSize,
		context.objectTypes,
		context.ast,
		context.wordType,
		context.resolveElementType,
		context.widenToWord,
	);
};

export const resolveExpressionType = (
	resolveNameType,
	node,
	floatContext,
	resolveCallType,
	wordSize,
	objectTypes,
	ast = null,
	wordType = null,
	resolveElementType = null,
	widenToWord = true,
) => {
	const context = makeExpressionResolveContext(
		resolveNameType,
		floatContext,
		resolveCallType,
		wordSize,
		objectTypes,
		ast,
		wordType,
		resolveElementType,
		widenToWord,
	);

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
		return resolveNameType ? resolveNameType(node.name, node.loc) : null;
	}
	if (node.type === AST_NODE.memberExpression) {
		if (node.object?.type === AST_NODE.thisExpression) {
			const field = resolveSelfFieldForType(node.property?.name, objectTypes);
			return field?.type ?? null;
		}
		const objectType =
			node.object?.type === AST_NODE.identifier
				? resolveNameType
					? resolveNameType(node.object.name, node.object.loc)
					: null
				: null;
		if (objectType && node.property?.type === AST_NODE.identifier) {
			const fieldType = resolveObjectFieldType(
				objectType,
				node.property.name,
				objectTypes,
			);
			if (fieldType) {
				return fieldType;
			}
		}
		return node.object?.type === AST_NODE.identifier ? UNRESOLVED_TYPE : null;
	}
	if (node.type === AST_NODE.indexExpression) {
		return parseArrayElementType(resolveExpressionChild(node.object, context));
	}
	if (node.type === AST_NODE.arrayLiteral) {
		const elementType = inferArrayElementType(
			ast,
			node.elements,
			resolveNameType,
			wordType ?? resolveWordDataType(wordSize),
			resolveElementType,
			widenToWord,
		);
		return elementType ? `${elementType}[]` : null;
	}
	if (node.type === AST_NODE.objectLiteral) {
		const fields = inferObjectFields(
			node,
			resolveNameType,
			resolveCallType,
			objectTypes,
			wordSize,
			ast,
			wordType,
			resolveElementType,
			widenToWord,
		);
		return encodeObjectShape(fields);
	}
	if (node.type === AST_NODE.callExpression) {
		if (node.callee?.type === AST_NODE.identifier) {
			return resolveCallType ? resolveCallType(node.callee.name) : null;
		}
		if (node.callee?.type === AST_NODE.memberExpression) {
			return resolveMemberCallType(
				node.callee,
				resolveNameType,
				resolveCallType,
				wordSize,
				objectTypes,
			);
		}
		return null;
	}
	if (node.type === AST_NODE.parenthesizedExpression) {
		return resolveExpressionChild(node.expression, context);
	}
	if (node.type === AST_NODE.asExpression) {
		return node.targetType.name;
	}
	if (node.type === AST_NODE.unaryExpression) {
		const operandType = resolveExpressionChild(node.argument, context);
		return node.operator === "-"
			? resolveNegationType(operandType, wordSize)
			: operandType;
	}
	if (node.type === AST_NODE.awaitExpression) {
		return unwrapAsyncTaskType(resolveExpressionChild(node.argument, context));
	}
	if (node.type === AST_NODE.binaryExpression) {
		if (COMPARISON_OPERATORS.has(node.operator)) {
			return DATA_TYPE.boolean;
		}
		if (LOGICAL_OPERATORS.has(node.operator)) {
			return resolveLogicalExpressionType(
				resolveNameType,
				node,
				floatContext,
				resolveCallType,
				wordSize,
				objectTypes,
				ast,
				wordType,
				resolveElementType,
				widenToWord,
			);
		}
		const leftType = resolveExpressionChild(node.left, context);
		const rightType = resolveExpressionChild(node.right, context);
		if (
			floatContext &&
			node.operator !== "%" &&
			(FLOAT_TYPES.has(leftType) || FLOAT_TYPES.has(rightType))
		) {
			return floatContext;
		}
		return normalizeOperandTypes(leftType, rightType, node.operator, wordSize);
	}
	if (node.type === AST_NODE.conditionalExpression) {
		const consequentType = resolveExpressionChild(node.consequent, context);
		const alternateType = resolveExpressionChild(node.alternate, context);
		if (consequentType === alternateType) {
			return consequentType;
		}
		if (
			floatContext &&
			(FLOAT_TYPES.has(consequentType) || FLOAT_TYPES.has(alternateType))
		) {
			return floatContext;
		}
		return normalizeOperandTypes(
			consequentType,
			alternateType,
			undefined,
			wordSize,
		);
	}
	return null;
};
