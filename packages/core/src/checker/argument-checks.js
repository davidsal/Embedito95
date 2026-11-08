import {
	AST_NODE,
	DATA_TYPE,
	ERROR_CODE,
	FLOAT_TYPES,
	QUOTE_DOUBLE,
	QUOTE_SINGLE,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { checkAllowedArgumentValue } from "./allowed-values.js";
import { checkArrayArgument, describeExpression } from "./arguments.js";
import {
	checkIdentifierArgument,
	checkMemberArgument,
} from "./identifier-argument-checks.js";
import { inferLiteralType, resolveLiteralDataType } from "./type-resolution.js";
import { CHARACTER_TYPES, INTEGER_TYPES, TYPE_RANGES } from "./types.js";

export const checkArgumentAgainstParam = (state, argument, param) => {
	checkAllowedArgumentValue(state.errors, argument, param);
	if (!param?.type) return;

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
	}
};

const checkCastArgument = (state, argument, param) => {
	const castType = argument.targetType.name;

	if (
		castType &&
		castType !== param.type &&
		(INTEGER_TYPES.has(castType) || FLOAT_TYPES.has(castType))
	) {
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
