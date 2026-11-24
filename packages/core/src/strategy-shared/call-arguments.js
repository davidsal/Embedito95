import {
	getNonNullableType,
	isNumericType,
	rangeFitsWithin,
	resolveOverloadSignature,
	TYPE_RANGES,
} from "../checker/index.js";
import { INTEGER_TYPES } from "../checker/types.js";
import { AST_NODE, DATA_TYPE, FLOAT_TYPES } from "../constants.js";
import { isFloatType } from "./c-types.js";
import { isFloatToIntegerCast } from "./cast.js";
import { renderExpression } from "./expression.js";
import {
	expressionDataType,
	makeThisFieldResolver,
	makeThisMethodResolver,
} from "./type-resolve.js";

const resolveArgumentType = (argument, context) => {
	return expressionDataType(
		argument,
		context.resolveNameType,
		context.ast,
		context.floatContext,
		context.resolveCallType,
		context.wordSize,
		makeThisFieldResolver(context),
		context.narrowingRegions,
		makeThisMethodResolver(context),
		context.objectTypes,
	);
};

export const resolveSignatureParamTypes = (signature) => {
	return signature ? signature.params.map((param) => param.type) : null;
};

export const resolveSignatureParamDefaults = (signature) => {
	if (!signature) {
		return null;
	}
	return signature.params.map((param) => param.defaultValue ?? null);
};

// Resolves the overload the checker selected for this call site. Only library
// definitions carry `signatures`; local functions fall back to their single
// declared parameter list.
export const resolveCallSignature = (node, calleeName, context) => {
	const originalName = context.resolveImportedName?.(calleeName) ?? calleeName;
	const definition = context.libFunctionDefinitions?.[originalName];
	if (!definition) {
		return null;
	}
	const argumentTypes = (node.arguments ?? []).map((argument) => {
		return resolveArgumentType(argument, context);
	});
	return resolveOverloadSignature(definition, argumentTypes, context.wordSize);
};

// An argument initializes the parameter, so float literals must use the
// parameter type as their float context.
const resolveArgumentFloatContext = (paramType) => {
	const nonNullType = getNonNullableType(paramType);
	return isFloatType(nonNullType) ? nonNullType : null;
};

const FLOAT_LITERAL_TEXT_PATTERN = /[.eE]/;

// A literal whose source text carries a decimal point or an exponent is already
// a floating-point literal in C++, so it never creates the float/double
// ambiguity that an integer-looking `2` does. The numeric value alone is not
// enough: `0.0` and `100.0` are integers by value but float by text.
const isIntegerLiteral = (argument) => {
	if (
		argument?.type !== AST_NODE.literal ||
		typeof argument.value !== "number" ||
		!Number.isInteger(argument.value)
	) {
		return false;
	}
	return (
		typeof argument.raw !== "string" ||
		!FLOAT_LITERAL_TEXT_PATTERN.test(argument.raw)
	);
};

// A literal with a decimal point or exponent is rendered in the parameter's
// float context, so in an `f64` signature it is already an `f64` value and
// needs no widening cast (casting it would only duplicate the conversion).
const isFloatLiteral = (argument) => {
	if (
		argument?.type !== AST_NODE.literal ||
		typeof argument.value !== "number"
	) {
		return false;
	}
	return (
		typeof argument.raw === "string" &&
		FLOAT_LITERAL_TEXT_PATTERN.test(argument.raw)
	);
};

const integerLiteralFitsParameter = (argument, paramType) => {
	const range = TYPE_RANGES[paramType];
	return Boolean(
		range && argument.value >= range.min && argument.value <= range.max,
	);
};

// An integer narrowing converts implicitly in C++ and stays visible in the
// generated call without an explicit cast; the e95 parameter type may be
// narrower than the native implementation the platform ships, so casting to it
// would truncate before the ABI. Widening and sign-changing conversions keep
// their visible cast.
const isUnsignedInteger = (type) => {
	const range = TYPE_RANGES[type];
	return Boolean(range) && range.min >= 0;
};

const isIntegerNarrowing = (argumentType, paramType) => {
	if (!INTEGER_TYPES.has(argumentType) || !INTEGER_TYPES.has(paramType)) {
		return false;
	}
	const argumentRange = TYPE_RANGES[argumentType];
	const parameterRange = TYPE_RANGES[paramType];
	if (!argumentRange || !parameterRange) {
		return false;
	}
	if (isUnsignedInteger(argumentType) !== isUnsignedInteger(paramType)) {
		return false;
	}
	return (
		parameterRange.max - parameterRange.min <
		argumentRange.max - argumentRange.min
	);
};

// Decides whether the emitted argument needs an explicit cast. Same type needs
// none; an integer literal that already fits an integer parameter gets none,
// but an integer literal into a float parameter always does, because C++ would
// otherwise see an ambiguous `float`/`double` conversion. Narrowing and
// int<->float conversions keep the conversion visible in the generated C++.
const needsArgumentCast = (
	argument,
	argumentType,
	paramType,
	wideIntegerCast,
) => {
	if (!argumentType || !paramType || argumentType === paramType) {
		return false;
	}
	if (!isNumericType(argumentType) || !isNumericType(paramType)) {
		return false;
	}
	if (isIntegerLiteral(argument)) {
		if (FLOAT_TYPES.has(paramType)) {
			return true;
		}
		return !integerLiteralFitsParameter(argument, paramType);
	}
	if (FLOAT_TYPES.has(paramType) && FLOAT_TYPES.has(argumentType)) {
		// A mixed float call selects one uniform width, so an `f32` value in an
		// `f64` signature is widened with a visible cast: without it, overloads
		// declared for `f32` and `f64` make the bare C++ call ambiguous. Float
		// literals are already rendered in the parameter's context, so they need
		// no extra cast. The reverse direction keeps its narrowing cast.
		if (paramType === DATA_TYPE.f64 && isFloatLiteral(argument)) {
			return false;
		}
		return true;
	}
	if (FLOAT_TYPES.has(paramType) !== FLOAT_TYPES.has(argumentType)) {
		return true;
	}
	// When the callee has an i32 and an i64 overload, a wide integer that does
	// not fit `i32` (a `u32` above 2^31) is widened to the i64 parameter with a
	// visible cast, so the width the checker selected is also the width the
	// generated C++ call spells out. A single i64 signature keeps the plain
	// widening, with no cast.
	if (
		wideIntegerCast &&
		paramType === DATA_TYPE.i64 &&
		TYPE_RANGES[argumentType] &&
		!rangeFitsWithin(TYPE_RANGES[argumentType], TYPE_RANGES[DATA_TYPE.i32])
	) {
		return true;
	}
	if (isIntegerNarrowing(argumentType, paramType)) {
		return false;
	}
	return !rangeFitsWithin(TYPE_RANGES[argumentType], TYPE_RANGES[paramType]);
};

const castArgument = (
	rendered,
	argument,
	paramType,
	castArguments,
	wideIntegerCast,
	context,
) => {
	const argumentType = resolveArgumentType(argument, context);
	// A float flowing into an integer parameter is a truncation the generated
	// C++ makes visible on every call, library or local, independently of the
	// signature-driven casts.
	if (isFloatToIntegerCast(argumentType, paramType)) {
		return `(${context.toCType(getNonNullableType(paramType))})(${rendered})`;
	}
	if (!castArguments) {
		return rendered;
	}
	if (!needsArgumentCast(argument, argumentType, paramType, wideIntegerCast)) {
		return rendered;
	}
	return `(${context.toCType(paramType)})(${rendered})`;
};

const renderArgument = (
	argument,
	index,
	paramTypes,
	castArguments,
	wideIntegerCast,
	context,
	lines,
) => {
	const paramType = paramTypes?.[index];
	const shouldWrap =
		argument?.type === AST_NODE.objectLiteral &&
		paramType &&
		context.isObjectHandle?.(paramType);
	const savedFloatContext = context.floatContext;
	context.floatContext = resolveArgumentFloatContext(paramType);
	const rendered = renderExpression(argument, context, lines);
	context.floatContext = savedFloatContext;
	if (!rendered) {
		return rendered;
	}
	if (shouldWrap) {
		return `${context.toCType(paramType)}(${context.objectStorageCType(paramType)}${rendered})`;
	}
	return castArgument(
		rendered,
		argument,
		paramType,
		castArguments,
		wideIntegerCast,
		context,
	);
};

// Renders the call arguments, filling omitted trailing parameters that have a
// default value.
export const renderCallArguments = (
	node,
	paramTypes,
	paramDefaults,
	castArguments,
	context,
	lines,
	wideIntegerCast = false,
) => {
	const args = node.arguments.map((argument, index) => {
		return renderArgument(
			argument,
			index,
			paramTypes,
			castArguments,
			wideIntegerCast,
			context,
			lines,
		);
	});
	if (paramDefaults) {
		for (
			let index = node.arguments.length;
			index < paramDefaults.length;
			index++
		) {
			const defaultValue = paramDefaults[index];
			args.push(
				defaultValue ? renderExpression(defaultValue, context, lines) : "0",
			);
		}
	}
	return args.join(", ");
};

export const renderMethodArguments = (node, context, lines) => {
	return node.arguments
		.map((argument, index) => {
			return renderArgument(
				argument,
				index,
				null,
				false,
				false,
				context,
				lines,
			);
		})
		.join(", ");
};
