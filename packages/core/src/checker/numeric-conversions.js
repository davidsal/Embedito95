import { DATA_TYPE } from "../constants.js";
import { resolveFloatTypeForIntegerType } from "./overloads.js";
import { INTEGER_TYPES, rangeFitsWithin, TYPE_RANGES } from "./types.js";

// A numeric conversion is allowed in every direction; the checker only warns
// when the value can lose precision or range. Nothing here produces an error.
export const canLoseFloatPrecision = (sourceType, targetType) => {
	if (targetType === DATA_TYPE.f32) {
		if (sourceType === DATA_TYPE.f64) {
			return true;
		}
		if (INTEGER_TYPES.has(sourceType)) {
			return resolveFloatTypeForIntegerType(sourceType) !== DATA_TYPE.f32;
		}
	}
	return false;
};

export const canTruncateInteger = (sourceType, targetType) => {
	if (!INTEGER_TYPES.has(sourceType) || !INTEGER_TYPES.has(targetType)) {
		return false;
	}
	return !rangeFitsWithin(TYPE_RANGES[sourceType], TYPE_RANGES[targetType]);
};

export const shouldWarnNumericConversion = (sourceType, targetType) => {
	return (
		canLoseFloatPrecision(sourceType, targetType) ||
		canTruncateInteger(sourceType, targetType)
	);
};
