import { DATA_TYPE, FLOAT_TYPES, INTEGER_WIDTHS } from "../constants.js";
import { parseArrayType } from "./arrays.js";
import {
	applyWordMinimum,
	promoteUnsignedToSigned,
	truncateFloatToInteger,
} from "./type-resolution.js";
import {
	COMPARISON_OPERATORS,
	INTEGER_TYPES,
	isNumericType,
	NEGATIVE_CAPABLE_OPERATORS,
	rangeFitsWithin,
	SIGNED_INTEGER_TYPES,
	TYPE_RANGES,
} from "./types.js";

const normalizeIntegerPair = (leftType, rightType, operator, wordSize) => {
	const leftSigned = SIGNED_INTEGER_TYPES.has(leftType);
	const rightSigned = SIGNED_INTEGER_TYPES.has(rightType);

	if (
		!leftSigned &&
		!rightSigned &&
		!NEGATIVE_CAPABLE_OPERATORS.has(operator)
	) {
		return applyWordMinimum(
			INTEGER_WIDTHS[leftType] >= INTEGER_WIDTHS[rightType]
				? leftType
				: rightType,
			wordSize,
		);
	}

	const promotedLeft = promoteUnsignedToSigned(leftType);
	const promotedRight = promoteUnsignedToSigned(rightType);

	return applyWordMinimum(
		INTEGER_WIDTHS[promotedLeft] >= INTEGER_WIDTHS[promotedRight]
			? promotedLeft
			: promotedRight,
		wordSize,
	);
};

export const normalizeOperandTypes = (
	leftType,
	rightType,
	operator,
	wordSize,
) => {
	if (!leftType || !rightType) {
		return null;
	}

	if (FLOAT_TYPES.has(leftType) && FLOAT_TYPES.has(rightType)) {
		return leftType === DATA_TYPE.f64 || rightType === DATA_TYPE.f64
			? DATA_TYPE.f64
			: DATA_TYPE.f32;
	}

	const leftInteger = truncateFloatToInteger(leftType);
	const rightInteger = truncateFloatToInteger(rightType);

	if (!INTEGER_TYPES.has(leftInteger) || !INTEGER_TYPES.has(rightInteger)) {
		return FLOAT_TYPES.has(leftType)
			? leftType
			: FLOAT_TYPES.has(rightType)
				? rightType
				: (leftInteger ?? rightInteger);
	}

	return normalizeIntegerPair(leftInteger, rightInteger, operator, wordSize);
};

export const resolveBinaryOperationType = (
	operator,
	leftType,
	rightType,
	wordSize,
) => {
	if (COMPARISON_OPERATORS.has(operator)) {
		return isNumericType(leftType) && isNumericType(rightType)
			? DATA_TYPE.boolean
			: null;
	}

	if (!isNumericType(leftType) || !isNumericType(rightType)) {
		return null;
	}

	if (
		operator === "%" &&
		(FLOAT_TYPES.has(leftType) || FLOAT_TYPES.has(rightType))
	) {
		return null;
	}

	return normalizeOperandTypes(leftType, rightType, operator, wordSize);
};

export const isAssignableTo = (targetType, sourceType) => {
	if (targetType === sourceType) {
		return true;
	}
	const targetArray = parseArrayType(targetType);
	const sourceArray = parseArrayType(sourceType);
	if (targetArray || sourceArray) {
		return targetArray && sourceArray
			? isAssignableTo(targetArray.elementType, sourceArray.elementType)
			: false;
	}
	if (INTEGER_TYPES.has(targetType) && INTEGER_TYPES.has(sourceType)) {
		return rangeFitsWithin(TYPE_RANGES[sourceType], TYPE_RANGES[targetType]);
	}
	if (FLOAT_TYPES.has(targetType) && FLOAT_TYPES.has(sourceType)) {
		return true;
	}
	if (
		FLOAT_TYPES.has(targetType) &&
		INTEGER_TYPES.has(sourceType) &&
		TYPE_RANGES[sourceType]
	) {
		return true;
	}
	return false;
};

export const isValueAssignable = (value, type) => {
	if (typeof value === "boolean") {
		return type === DATA_TYPE.boolean;
	}
	if (typeof value !== "number") {
		return false;
	}
	if (type === DATA_TYPE.f32 || type === DATA_TYPE.f64) {
		return true;
	}
	const range = TYPE_RANGES[type];
	return Boolean(range && value >= range.min && value <= range.max);
};

export const containsType = (container, type) => {
	if (container === type) {
		return true;
	}
	if (container === DATA_TYPE.f64) {
		return isNumericType(type) || type === DATA_TYPE.f32;
	}
	if (container === DATA_TYPE.f32) {
		return isNumericType(type) && type !== DATA_TYPE.f64;
	}
	const containerRange = TYPE_RANGES[container];
	const typeRange = TYPE_RANGES[type];
	return rangeFitsWithin(typeRange, containerRange);
};
