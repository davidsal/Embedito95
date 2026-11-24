import { evaluateConstant } from "../const-eval.js";
import { FLOAT_TYPES } from "../constants.js";
import { shouldWarnNumericConversion } from "./numeric-conversions.js";
import {
	getNonNullableType,
	INTEGER_TYPES,
	rangeFitsWithin,
	TYPE_RANGES,
} from "./types.js";

// A truncation warning is only emitted when the stored value can actually lose
// information: a float with a fractional part narrowed into an integer, or an
// integer whose range does not fit the target. An exact float constant (e.g.
// `500.0`) is stored losslessly and stays warning-free here; arguments and
// member assignments keep a separate, unconditional float -> integer warning
// because the conversion there is implicit.
export const resolveAssignmentTruncation = (
	rhsNode,
	rhsType,
	targetType,
	floatContext,
	ast,
) => {
	if (!targetType || !rhsNode || !rhsType) {
		return null;
	}
	const nonNullTarget = getNonNullableType(targetType);
	const nonNullRhs = getNonNullableType(rhsType);
	const targetIsInteger = INTEGER_TYPES.has(nonNullTarget);
	const targetIsFloat = FLOAT_TYPES.has(nonNullTarget);
	const rhsIsInteger = INTEGER_TYPES.has(nonNullRhs);
	const rhsIsFloat = FLOAT_TYPES.has(nonNullRhs);

	if (!targetIsInteger && !targetIsFloat) {
		return null;
	}
	if (rhsIsFloat && targetIsInteger) {
		const constantValue = evaluateConstant(ast, rhsNode, floatContext);

		if (typeof constantValue === "number") {
			return Number.isInteger(constantValue) ? null : rhsType;
		}
		return rhsType;
	}
	if (rhsIsFloat && targetIsFloat) {
		return shouldWarnNumericConversion(nonNullRhs, nonNullTarget)
			? rhsType
			: null;
	}
	if (rhsIsInteger && targetIsInteger) {
		const constantValue = evaluateConstant(ast, rhsNode, floatContext);

		if (typeof constantValue === "number" && Number.isInteger(constantValue)) {
			const targetRange = TYPE_RANGES[nonNullTarget];
			const fits =
				constantValue >= targetRange.min && constantValue <= targetRange.max;

			return fits ? null : rhsType;
		}
		const targetRange = TYPE_RANGES[nonNullTarget];
		const rhsRange = TYPE_RANGES[nonNullRhs];

		return rangeFitsWithin(rhsRange, targetRange) ? null : rhsType;
	}
	return null;
};
