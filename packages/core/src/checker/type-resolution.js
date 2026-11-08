import { evaluateConstant } from "../const-eval.js";
import {
	AST_NODE,
	DATA_TYPE,
	DATA_TYPES,
	INTEGER_WIDTHS,
	OBJECT_TYPE,
	QUOTE_DOUBLE,
	QUOTE_SINGLE,
} from "../constants.js";
import { parseArrayType } from "./arrays.js";
import { getDeclaration } from "./declaration-accessors.js";
import {
	FLOAT32_SIGNIFICANT_DIGITS,
	INTEGER_TYPES,
	NULL_TYPE,
	rangeFitsWithin,
	SIGNED_INTEGER_FOR_WIDTH,
	SIGNED_INTEGER_TYPES,
	TYPE_RANGES,
	WORD_TYPES,
} from "./types.js";

export const resolveWordDataType = (wordSize) => {
	return wordSize >= 32 ? DATA_TYPE.i32 : DATA_TYPE.i16;
};

export const resolveIntegerType = (min, max, preferSigned = false) => {
	if (min < 0) {
		const limit = Math.max(Math.abs(min), Math.abs(max));

		if (limit <= -TYPE_RANGES.i8.min) {
			return DATA_TYPE.i8;
		}
		if (limit <= -TYPE_RANGES.i16.min) {
			return DATA_TYPE.i16;
		}
		if (limit <= -TYPE_RANGES.i32.min) {
			return DATA_TYPE.i32;
		}
		return DATA_TYPE.i64;
	}

	if (preferSigned) {
		if (max <= TYPE_RANGES.i8.max) {
			return DATA_TYPE.i8;
		}
		if (max <= TYPE_RANGES.u8.max) {
			return DATA_TYPE.u8;
		}
		if (max <= TYPE_RANGES.i16.max) {
			return DATA_TYPE.i16;
		}
		if (max <= TYPE_RANGES.u16.max) {
			return DATA_TYPE.u16;
		}
		if (max <= TYPE_RANGES.i32.max) {
			return DATA_TYPE.i32;
		}
		if (max <= TYPE_RANGES.u32.max) {
			return DATA_TYPE.u32;
		}
		return DATA_TYPE.i64;
	}

	if (max <= TYPE_RANGES.u8.max) {
		return DATA_TYPE.u8;
	}
	if (max <= TYPE_RANGES.u16.max) {
		return DATA_TYPE.u16;
	}
	if (max <= TYPE_RANGES.u32.max) {
		return DATA_TYPE.u32;
	}
	return DATA_TYPE.u64;
};

const countSignificantDigits = (value) => {
	const mantissa = value.toExponential().split("e")[0];
	return mantissa.replace(".", "").replace(/^0+/, "").length;
};

export const resolveFloatType = (value) => {
	if (value === 0) {
		return DATA_TYPE.f32;
	}
	const rounded = Math.fround(value);
	if (!Number.isFinite(rounded) || rounded === 0) {
		return DATA_TYPE.f64;
	}
	return countSignificantDigits(value) <= FLOAT32_SIGNIFICANT_DIGITS
		? DATA_TYPE.f32
		: DATA_TYPE.f64;
};

export const inferLiteralType = (value) => {
	if (value === null) {
		return NULL_TYPE;
	}
	if (typeof value === "boolean") {
		return DATA_TYPE.boolean;
	}
	if (typeof value === "string") {
		return value.length === 1 ? DATA_TYPE.char : DATA_TYPE.string;
	}
	if (typeof value === "number") {
		if (Number.isInteger(value)) {
			return resolveIntegerType(value, value);
		}
		return resolveFloatType(value);
	}
	return null;
};

export const resolveLiteralDataType = (node) => {
	if (node.quote === QUOTE_SINGLE) {
		return DATA_TYPE.char;
	}
	if (node.quote === QUOTE_DOUBLE) {
		return DATA_TYPE.string;
	}
	if (
		typeof node.value === "number" &&
		typeof node.raw === "string" &&
		node.raw.includes(".") &&
		Number.isInteger(node.value)
	) {
		return DATA_TYPE.f32;
	}
	if (typeof node.value === "number" && Number.isInteger(node.value)) {
		return resolveConstIntegerType(node.value);
	}
	return inferLiteralType(node.value);
};

export const resolveConstIntegerType = (value) => {
	return resolveIntegerType(value, value, true);
};

export const truncateFloatToInteger = (type) => {
	if (type === DATA_TYPE.f32) {
		return DATA_TYPE.i32;
	}
	if (type === DATA_TYPE.f64) {
		return DATA_TYPE.i64;
	}
	return type;
};

const MAX_SIGNED_INTEGER_WIDTH = Math.max(
	...Object.keys(SIGNED_INTEGER_FOR_WIDTH).map(Number),
);

export const promoteUnsignedToSigned = (type) => {
	if (!INTEGER_TYPES.has(type) || SIGNED_INTEGER_TYPES.has(type)) {
		return type;
	}
	const targetWidth = Math.min(
		INTEGER_WIDTHS[type] * 2,
		MAX_SIGNED_INTEGER_WIDTH,
	);
	return SIGNED_INTEGER_FOR_WIDTH[targetWidth];
};

export const applyWordMinimum = (type, wordSize) => {
	if (!wordSize || !INTEGER_TYPES.has(type)) {
		return type;
	}
	const signedWord = WORD_TYPES.signed[wordSize];
	const unsignedWord = WORD_TYPES.unsigned[wordSize];
	const fitsInSignedWord =
		signedWord && INTEGER_WIDTHS[signedWord] > INTEGER_WIDTHS[type];
	const wordType =
		SIGNED_INTEGER_TYPES.has(type) || fitsInSignedWord
			? signedWord
			: unsignedWord;

	if (!wordType) {
		return type;
	}
	return INTEGER_WIDTHS[wordType] >= INTEGER_WIDTHS[type] ? wordType : type;
};

export const resolveNegationType = (operandType, wordSize) => {
	if (
		!INTEGER_TYPES.has(operandType) ||
		SIGNED_INTEGER_TYPES.has(operandType)
	) {
		return operandType;
	}
	return applyWordMinimum(promoteUnsignedToSigned(operandType), wordSize);
};

export const resolveLetIntegerType = (naturalType, wordType) => {
	const wordRange = TYPE_RANGES[wordType];
	const naturalRange = TYPE_RANGES[naturalType];
	const fitsInWord = rangeFitsWithin(naturalRange, wordRange);

	if (fitsInWord) {
		return wordType;
	}
	return SIGNED_INTEGER_TYPES.has(naturalType)
		? naturalType
		: promoteUnsignedToSigned(naturalType);
};

export const typeIsKnown = (
	type,
	enumTypes,
	libEnumTypeNames,
	libNameToType,
	objectTypeNames,
) => {
	let base = type;
	while (true) {
		const arrayType = parseArrayType(base);
		if (!arrayType) {
			break;
		}
		base = arrayType.elementType;
	}
	return (
		DATA_TYPES.has(base) ||
		base === OBJECT_TYPE ||
		enumTypes.has(base) ||
		libEnumTypeNames.has(base) ||
		libNameToType[base] !== undefined ||
		objectTypeNames?.has(base)
	);
};

export const resolveFoldedNaturalType = (ast, initializer, expressionType) => {
	const resolvedValue = evaluateConstant(ast, initializer);

	return typeof resolvedValue === "number" && Number.isInteger(resolvedValue)
		? resolveConstIntegerType(resolvedValue)
		: expressionType;
};

export const resolveEnumType = (
	name,
	paramType,
	defined,
	libEnumMembersByType,
) => {
	if (libEnumMembersByType[paramType]?.has(name)) {
		return paramType;
	}

	const statement = defined.get(name);

	if (!statement) {
		return null;
	}

	const declaration = getDeclaration(statement);

	if (!declaration?.init) {
		return null;
	}

	if (declaration.init.type === AST_NODE.memberExpression) {
		const property = declaration.init.property?.name;

		if (property && libEnumMembersByType[paramType]?.has(property)) {
			return paramType;
		}
	}

	return null;
};
