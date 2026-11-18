import {
	isNumericType,
	rangeFitsWithin,
	TYPE_RANGES,
} from "../checker/index.js";
import { DATA_TYPE } from "../constants.js";
import { dataTypeToCType, isFloatType } from "./c-types.js";

const fitsInTargetRange = (rhsType, targetType) => {
	return rangeFitsWithin(TYPE_RANGES[rhsType], TYPE_RANGES[targetType]);
};

const needsNumericCast = (valueType, targetType) => {
	if (!targetType || !valueType) {
		return false;
	}
	const targetIsFloat = isFloatType(targetType);
	const valueIsFloat = isFloatType(valueType);

	if (targetIsFloat !== valueIsFloat) {
		return true;
	}
	if (targetIsFloat) {
		// Widen `f32 -> f64` implicitly; narrow `f64 -> f32` with an explicit
		// cast so the precision loss is visible in the generated C++.
		return valueType === DATA_TYPE.f64 && targetType === DATA_TYPE.f32;
	}
	return (
		isNumericType(targetType) &&
		isNumericType(valueType) &&
		!fitsInTargetRange(valueType, targetType)
	);
};

export const storageCast = (
	rendered,
	targetType,
	rhsType,
	wordCType,
	toCType,
) => {
	if (!targetType || !rendered) {
		return rendered;
	}
	if (needsNumericCast(rhsType, targetType)) {
		return `(${toCType ? toCType(targetType) : dataTypeToCType(targetType, wordCType)})(${rendered})`;
	}
	return rendered;
};

export const castOperand = (rendered, operandType, commonType) => {
	if (!operandType || !commonType || operandType === commonType) {
		return rendered;
	}
	return `(${dataTypeToCType(commonType, "")})(${rendered})`;
};
