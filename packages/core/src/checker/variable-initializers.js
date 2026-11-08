import { evaluateConstant } from "../const-eval.js";
import {
	AST_NODE,
	DATA_TYPE,
	FLOAT_TYPES,
	UNRESOLVED_TYPE,
} from "../constants.js";
import { inferArrayElementType } from "./arrays.js";
import {
	inferObjectFields,
	resolveSelfFieldForType,
} from "./expression-objects.js";
import { resolveExpressionType } from "./expressions.js";
import { encodeObjectShape } from "./object-shapes.js";
import {
	resolveConstIntegerType,
	resolveFoldedNaturalType,
	resolveLetIntegerType,
	resolveLiteralDataType,
} from "./type-resolution.js";
import { INTEGER_TYPES } from "./types.js";

const resolveElementExpressionType = (context, element) => {
	return resolveExpressionType(
		context.resolveNameType,
		element,
		null,
		context.resolveCallType,
		context.wordSize,
		context.objectTypes,
		context.ast,
		context.wordType,
		context.resolveElementType,
		context.isLet,
	);
};

export const resolveInitializerType = (
	ast,
	initializer,
	isLet,
	wordType,
	resolveNameType,
	resolveCallType,
	wordSize,
	objectTypes,
) => {
	if (!initializer) {
		return isLet ? wordType : null;
	}
	if (initializer.type === AST_NODE.functionExpression) {
		return null;
	}
	if (initializer.type === AST_NODE.memberExpression) {
		if (initializer.object?.type === AST_NODE.thisExpression) {
			return (
				resolveSelfFieldForType(initializer.property?.name, objectTypes)
					?.type ?? null
			);
		}
		return initializer.object?.type === AST_NODE.identifier
			? UNRESOLVED_TYPE
			: null;
	}
	if (initializer.type === AST_NODE.asExpression) {
		return initializer.targetType.name;
	}
	if (initializer.type === AST_NODE.templateLiteral) {
		return DATA_TYPE.string;
	}
	const elementContext = {
		resolveNameType,
		resolveCallType,
		wordSize,
		objectTypes,
		ast,
		wordType,
		isLet,
		resolveElementType: null,
	};
	elementContext.resolveElementType = resolveElementExpressionType.bind(
		null,
		elementContext,
	);
	if (initializer.type === AST_NODE.arrayLiteral) {
		const elementType = inferArrayElementType(
			ast,
			initializer.elements,
			resolveNameType,
			wordType,
			elementContext.resolveElementType,
			isLet,
		);
		return elementType ? `${elementType}[]` : null;
	}
	if (initializer.type === AST_NODE.objectLiteral) {
		const fields = inferObjectFields(
			initializer,
			resolveNameType,
			resolveCallType,
			objectTypes,
			wordSize,
			ast,
			wordType,
			elementContext.resolveElementType,
			isLet,
		);
		return encodeObjectShape(fields);
	}
	if (initializer.type === AST_NODE.parenthesizedExpression) {
		return resolveInitializerType(
			ast,
			initializer.expression,
			isLet,
			wordType,
			resolveNameType,
			resolveCallType,
			wordSize,
			objectTypes,
		);
	}
	if (initializer.type === AST_NODE.literal) {
		const type = resolveLiteralDataType(initializer);

		if (!type) {
			return isLet ? wordType : null;
		}
		if (FLOAT_TYPES.has(type)) {
			return type;
		}
		if (isLet) {
			const naturalType = INTEGER_TYPES.has(type)
				? resolveConstIntegerType(initializer.value)
				: type;
			return resolveLetIntegerType(naturalType, wordType);
		}
		if (INTEGER_TYPES.has(type)) {
			return resolveConstIntegerType(initializer.value);
		}
		return type;
	}

	const expressionType = resolveExpressionType(
		resolveNameType,
		initializer,
		undefined,
		resolveCallType,
		wordSize,
		objectTypes,
	);

	if (expressionType) {
		if (FLOAT_TYPES.has(expressionType)) {
			return expressionType;
		}
		if (INTEGER_TYPES.has(expressionType)) {
			const naturalType = resolveFoldedNaturalType(
				ast,
				initializer,
				expressionType,
			);
			return isLet ? resolveLetIntegerType(naturalType, wordType) : naturalType;
		}
		return expressionType;
	}

	const resolvedValue = evaluateConstant(ast, initializer);

	if (typeof resolvedValue === "number") {
		if (Number.isInteger(resolvedValue)) {
			const type = resolveConstIntegerType(resolvedValue);
			return isLet ? resolveLetIntegerType(type, wordType) : type;
		}
		return DATA_TYPE.f32;
	}
	if (typeof resolvedValue === "boolean") {
		return DATA_TYPE.boolean;
	}
	if (typeof resolvedValue === "string") {
		return resolvedValue.length === 1 ? DATA_TYPE.char : DATA_TYPE.string;
	}

	return isLet ? wordType : null;
};
