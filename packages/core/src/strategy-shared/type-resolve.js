import {
	decodeObjectShape,
	flattenLogicalChain,
	getNonNullableType,
	inferLiteralType,
	isNarrowedAt,
	isObjectShapeType,
	LOGICAL_OPERATORS,
	normalizeOperandTypes,
	parseArrayType,
	resolveArrayMethod,
	resolveLiteralDataType,
	resolveLogicalResultType,
	resolveNegationType,
	resolveStringMethod,
	unwrapAsyncTaskType,
} from "../checker/index.js";
import {
	evaluateBinaryNumber,
	evaluateConstant,
	nodeIsFloat,
} from "../const-eval.js";
import {
	AST_NODE,
	DATA_TYPE,
	INTEGER_WIDTHS,
	UNRESOLVED_TYPE,
} from "../constants.js";
import { isFloatType } from "./c-types.js";

export const widenCommonTypeForValue = (
	operator,
	leftNode,
	rightNode,
	commonType,
	ast,
) => {
	if (!commonType || isFloatType(commonType)) {
		return commonType;
	}

	const left = evaluateConstant(ast, leftNode);
	const right = evaluateConstant(ast, rightNode);

	if (typeof left !== "number" || typeof right !== "number") {
		return commonType;
	}

	const leftIsFloat = nodeIsFloat(ast, leftNode);
	const rightIsFloat = nodeIsFloat(ast, rightNode);

	let intermediate;
	if (leftIsFloat && rightIsFloat) {
		intermediate = evaluateBinaryNumber(operator, left, right);
	} else if (leftIsFloat) {
		intermediate = evaluateBinaryNumber(operator, Math.trunc(left), right);
	} else if (rightIsFloat) {
		intermediate = evaluateBinaryNumber(operator, left, Math.trunc(right));
	} else {
		intermediate = evaluateBinaryNumber(operator, left, right);
	}

	if (typeof intermediate !== "number" || !Number.isInteger(intermediate)) {
		return commonType;
	}

	const neededType = inferLiteralType(intermediate);
	const commonWidth = INTEGER_WIDTHS[commonType];
	const neededWidth = neededType ? INTEGER_WIDTHS[neededType] : undefined;

	if (neededWidth !== undefined && neededWidth > commonWidth) {
		return neededType;
	}
	return commonType;
};

const literalDataType = resolveLiteralDataType;

const resolveLogicalDataType = (node, context) => {
	const operands = flattenLogicalChain(node, node.operator);
	const types = operands.map((operand) =>
		resolveExpressionType(operand, context),
	);
	return resolveLogicalResultType(types, node.operator, context.wordSize);
};

const resolveUnaryDataType = (node, context) => {
	const operandType = resolveExpressionType(node.argument, context);
	return node.operator === "-"
		? resolveNegationType(operandType, context.wordSize)
		: operandType;
};

const resolveBinaryDataType = (node, context) => {
	if (LOGICAL_OPERATORS.has(node.operator)) {
		return resolveLogicalDataType(node, context);
	}
	const leftType = resolveExpressionType(node.left, context);
	const rightType = resolveExpressionType(node.right, context);
	const commonType = normalizeOperandTypes(
		leftType,
		rightType,
		node.operator,
		context.wordSize,
	);
	if (
		context.floatContext &&
		node.operator !== "%" &&
		(isFloatType(leftType) || isFloatType(rightType))
	) {
		return context.floatContext;
	}
	return widenCommonTypeForValue(
		node.operator,
		node.left,
		node.right,
		commonType,
		context.ast,
	);
};

const resolveConditionalDataType = (node, context) => {
	const consequentType = resolveExpressionType(node.consequent, context);
	const alternateType = resolveExpressionType(node.alternate, context);
	if (consequentType === alternateType) {
		return consequentType;
	}
	if (
		context.floatContext &&
		(isFloatType(consequentType) || isFloatType(alternateType))
	) {
		return context.floatContext;
	}
	return normalizeOperandTypes(consequentType, alternateType);
};

const resolveObjectFieldType = (objectType, propertyName, context) => {
	const fields =
		context.objectTypes?.[objectType]?.fields ??
		(isObjectShapeType(objectType) ? decodeObjectShape(objectType) : null);
	return fields?.[propertyName]?.type ?? null;
};

const resolveMemberDataType = (node, context) => {
	if (
		node.object?.type === AST_NODE.thisExpression &&
		context.resolveThisFieldType
	) {
		return context.resolveThisFieldType(node.property?.name);
	}
	const receiverType = resolveExpressionType(node.object, context);
	if (!receiverType) {
		return UNRESOLVED_TYPE;
	}
	return (
		resolveObjectFieldType(receiverType, node.property?.name, context) ??
		UNRESOLVED_TYPE
	);
};

const resolveIndexDataType = (node, context) => {
	const arrayType = parseArrayType(resolveExpressionType(node.object, context));
	return arrayType ? arrayType.elementType : UNRESOLVED_TYPE;
};

const resolveCallDataType = (node, context) => {
	if (node.callee?.type === AST_NODE.identifier) {
		return context.resolveCallType
			? context.resolveCallType(node.callee.name)
			: null;
	}
	if (node.callee?.type === AST_NODE.memberExpression) {
		const methodName = node.callee.property?.name;
		if (
			node.callee.object?.type === AST_NODE.thisExpression &&
			context.resolveThisMethodType
		) {
			return context.resolveThisMethodType(methodName);
		}
		const objectName = node.callee.object?.name;
		const objectType =
			objectName && context.resolveNameType
				? context.resolveNameType(objectName, node.callee.object.loc)
				: null;
		const method = objectType
			? context.objectTypes?.[objectType]?.methods?.[methodName]
			: null;
		if (method) {
			return method.returnType ?? null;
		}
		const arrayType = objectType ? parseArrayType(objectType) : null;
		const arrayMethod = arrayType
			? resolveArrayMethod(methodName, arrayType.elementType)
			: null;
		if (arrayMethod) {
			return arrayMethod.returnType;
		}
		const stringMethod =
			objectType === DATA_TYPE.string ? resolveStringMethod(methodName) : null;
		return stringMethod ? stringMethod.returnType : null;
	}
	return null;
};

const resolveExpressionType = (node, context) => {
	if (!node || typeof node !== "object") {
		return null;
	}
	switch (node.type) {
		case AST_NODE.literal:
			return literalDataType(node);
		case AST_NODE.templateLiteral:
			return DATA_TYPE.string;
		case AST_NODE.identifier: {
			const type = context.resolveNameType
				? context.resolveNameType(node.name, node.loc)
				: null;
			if (
				type &&
				context.narrowingRegions &&
				isNarrowedAt(node.name, node.loc, context.narrowingRegions)
			) {
				return getNonNullableType(type);
			}
			return type;
		}
		case AST_NODE.memberExpression:
			return resolveMemberDataType(node, context);
		case AST_NODE.indexExpression:
			return resolveIndexDataType(node, context);
		case AST_NODE.callExpression:
			return resolveCallDataType(node, context);
		case AST_NODE.parenthesizedExpression:
			return resolveExpressionType(node.expression, context);
		case AST_NODE.asExpression:
			return node.targetType.name;
		case AST_NODE.unaryExpression:
			return resolveUnaryDataType(node, context);
		case AST_NODE.awaitExpression:
			return unwrapAsyncTaskType(resolveExpressionType(node.argument, context));
		case AST_NODE.binaryExpression:
			return resolveBinaryDataType(node, context);
		case AST_NODE.conditionalExpression:
			return resolveConditionalDataType(node, context);
		default:
			return null;
	}
};

const makeTypeContext = (
	resolveNameType,
	ast,
	floatContext,
	resolveCallType,
	wordSize,
	resolveThisFieldType,
	narrowingRegions,
	resolveThisMethodType,
	objectTypes,
) => {
	return {
		resolveNameType,
		ast,
		floatContext,
		resolveCallType,
		wordSize,
		resolveThisFieldType,
		narrowingRegions,
		resolveThisMethodType,
		objectTypes,
	};
};

export const expressionDataType = (
	node,
	resolveNameType,
	ast,
	floatContext,
	resolveCallType,
	wordSize,
	resolveThisFieldType,
	narrowingRegions = null,
	resolveThisMethodType = null,
	objectTypes = null,
) => {
	const context = makeTypeContext(
		resolveNameType,
		ast,
		floatContext,
		resolveCallType,
		wordSize,
		resolveThisFieldType,
		narrowingRegions,
		resolveThisMethodType,
		objectTypes,
	);
	return resolveExpressionType(node, context);
};

export const makeThisFieldResolver = (context) => {
	if (!context?.selfType) {
		return null;
	}
	const typeInfo = context.objectTypes?.[context.selfType];
	const fields = typeInfo?.fields;
	const capturedFieldTypes = typeInfo?.capturedFieldTypes;
	if (!fields && !capturedFieldTypes) {
		return null;
	}
	return (name) => {
		return fields?.[name]?.type ?? capturedFieldTypes?.get(name) ?? null;
	};
};

export const makeThisMethodResolver = (context) => {
	if (!context?.selfType) {
		return null;
	}
	const typeInfo = context.objectTypes?.[context.selfType];
	const classMethods = new Map();
	for (const method of typeInfo?.publicMethods ?? []) {
		classMethods.set(method.name, method.functionExpression);
	}
	for (const closure of typeInfo?.privateClosures ?? []) {
		classMethods.set(closure.name, closure.functionExpression);
	}
	for (const [name, functionExpression] of context.userObjectMethods?.get(
		context.selfType,
	) ?? []) {
		if (!classMethods.has(name)) {
			classMethods.set(name, functionExpression);
		}
	}
	return (name) => classMethods.get(name)?.returnType?.name ?? null;
};
