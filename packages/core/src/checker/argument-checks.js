import {
	AST_NODE,
	DATA_TYPE,
	ERROR_CODE,
	FLOAT_TYPES,
	QUOTE_DOUBLE,
	QUOTE_SINGLE,
	SEVERITY,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { checkAllowedArgumentValue } from "./allowed-values.js";
import { checkArrayArgument, describeExpression } from "./arguments.js";
import { parseAsyncTaskType } from "./async-task-type.js";
import {
	checkIdentifierArgument,
	checkMemberArgument,
} from "./identifier-argument-checks.js";
import {
	canLoseFloatPrecision,
	shouldWarnNumericConversion,
} from "./numeric-conversions.js";
import { inferLiteralType, resolveLiteralDataType } from "./type-resolution.js";
import {
	CHARACTER_TYPES,
	INTEGER_TYPES,
	isNumericType,
	TYPE_RANGES,
} from "./types.js";

// An `AsyncTask<T>` argument only becomes its payload after `await`. Passing the
// wrapper to a parameter that expects the payload (nominal or inferred shape)
// would otherwise be rejected late by the lowered intermediate, where the task
// handle is an integer. Reporting it here keeps the diagnostic on the source
// argument and points at the missing `await`. Parameters that declare
// `AsyncTask`/`AsyncTask<T>` are the correct way to hand a task around, so they
// are skipped.
export const checkAsyncTaskArgument = (state, argument, param) => {
	const argumentType = state.context.resolveCheckExpressionType(argument);
	if (parseAsyncTaskType(argumentType) === null) {
		return false;
	}
	if (parseAsyncTaskType(param.type) !== null) {
		return false;
	}
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.asyncTaskArgument,
			params: {
				name: param.name,
				expected: param.type,
				actual: argumentType,
			},
			location: argument.loc,
		}),
	);
	return true;
};

export const checkArgumentAgainstParam = (state, argument, param) => {
	checkAllowedArgumentValue(state.errors, argument, param);
	if (!param?.type) return;

	if (checkAsyncTaskArgument(state, argument, param)) {
		return;
	}

	if (
		checkArrayArgument(
			argument,
			param,
			state.errors,
			state.context.resolveVariableTypeAt,
			state.context.resolveCheckExpressionType,
		)
	) {
		return;
	}

	if (argument.type === AST_NODE.literal) {
		checkLiteralArgument(state, argument, param);
		return;
	}

	if (argument.type === AST_NODE.identifier) {
		checkIdentifierArgument(state, argument, param);
		return;
	}

	if (argument.type === AST_NODE.memberExpression) {
		checkMemberArgument(state, argument, param);
		return;
	}

	if (argument.type === AST_NODE.conditionalExpression) {
		state.context.checkTernaryAgainstParam(argument, param);
		return;
	}

	if (argument.type === AST_NODE.asExpression && TYPE_RANGES[param.type]) {
		checkCastArgument(state, argument, param);
		return;
	}

	if (isNumericType(param.type)) {
		checkExpressionNumericArgument(state, argument, param);
	}
};

// Expressions that are not a plain literal/identifier/member (e.g. `u32 * i16`)
// still follow the numeric conversion rule. Integer narrowing is only judged on
// a declared type (identifier/member): a promoted expression (`getCapacity()-1`
// is i32) would warn even when the value cannot truncate, so expressions only
// warn on float precision loss, which the operand types do determine.
const checkExpressionNumericArgument = (state, argument, param) => {
	const argumentType = state.context?.resolveCheckExpressionType?.(argument);
	if (!argumentType || !isNumericType(argumentType)) {
		return;
	}
	if (canLoseFloatPrecision(argumentType, param.type)) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual: argumentType,
					value: describeExpression(argument),
				},
				location: argument.loc,
				severity: SEVERITY.warning,
			}),
		);
	}
};

const checkCastArgument = (state, argument, param) => {
	const castType = argument.targetType.name;

	if (
		castType &&
		castType !== param.type &&
		(INTEGER_TYPES.has(castType) || FLOAT_TYPES.has(castType))
	) {
		if (FLOAT_TYPES.has(castType) && INTEGER_TYPES.has(param.type)) {
			// `funI(500 as f32)` truncates the float argument; the hover warning
			// reports it instead of an error, matching declarations and members.
			return;
		}
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual: castType,
					value: describeExpression(argument),
				},
				location: argument.loc,
			}),
		);
	}
};

const checkLiteralArgument = (state, argument, param) => {
	if (state.libEnumTypeNames.has(param.type)) {
		checkLiteralEnumArgument(state, argument, param);
		return;
	}

	if (CHARACTER_TYPES.has(param.type)) {
		checkLiteralCharacterArgument(state, argument, param);
		return;
	}

	if (FLOAT_TYPES.has(param.type)) {
		checkLiteralFloatArgument(state, argument, param);
		return;
	}

	checkLiteralRangeArgument(state, argument, param);
};

const checkLiteralFloatArgument = (state, argument, param) => {
	if (typeof argument.value === "number") {
		const literalType = resolveLiteralDataType(argument);
		if (shouldWarnNumericConversion(literalType, param.type)) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.argumentTypeMismatch,
					params: {
						name: param.name,
						expected: param.type,
						actual: literalType,
						value: argument.value,
					},
					location: argument.loc,
					severity: SEVERITY.warning,
				}),
			);
		}
		return;
	}
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.argumentTypeMismatch,
			params: {
				name: param.name,
				expected: param.type,
				actual: resolveLiteralDataType(argument),
				value: argument.value,
			},
			location: argument.loc,
		}),
	);
};

const checkLiteralEnumArgument = (state, argument, param) => {
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.argumentTypeMismatch,
			params: {
				name: param.name,
				expected: param.type,
				actual:
					typeof argument.value === "number"
						? inferLiteralType(argument.value)
						: typeof argument.value,
				value: argument.value,
			},
			location: argument.loc,
		}),
	);
};

const checkLiteralCharacterArgument = (state, argument, param) => {
	if (typeof argument.value !== "string") {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual:
						typeof argument.value === "number"
							? inferLiteralType(argument.value)
							: typeof argument.value,
					value: argument.value,
				},
				location: argument.loc,
			}),
		);
	} else if (
		argument.quote === QUOTE_SINGLE &&
		argument.value.length === 1 &&
		param.type !== DATA_TYPE.char
	) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual: DATA_TYPE.char,
					value: argument.value,
				},
				location: argument.loc,
			}),
		);
	} else if (
		argument.quote === QUOTE_DOUBLE &&
		param.type !== DATA_TYPE.string
	) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual: DATA_TYPE.string,
					value: argument.value,
				},
				location: argument.loc,
			}),
		);
	}
};

const checkLiteralRangeArgument = (state, argument, param) => {
	const range = TYPE_RANGES[param.type];
	if (!range) return;

	const literalValue = argument.value;
	if (typeof literalValue !== "number") {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual:
						typeof literalValue === "string"
							? resolveLiteralDataType(argument)
							: typeof literalValue,
					value: literalValue,
				},
				location: argument.loc,
			}),
		);
		return;
	}

	if (literalValue < range.min || literalValue > range.max) {
		const literalType = inferLiteralType(literalValue);
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.argumentTypeMismatch,
				params: {
					name: param.name,
					expected: param.type,
					actual: literalType,
					value: literalValue,
				},
				location: argument.loc,
			}),
		);
	}
};
