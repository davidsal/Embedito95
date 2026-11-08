import { AST_NODE, DATA_TYPE, FLOAT_TYPES } from "../constants.js";

export const RESERVED_NAMES = ["loop"];
export const REQUIRED_FUNCTIONS = ["setup", "main"];
export const FLOAT32_SIGNIFICANT_DIGITS = 7;

export const TYPE_RANGES = {
	u8: { min: 0, max: 255 },
	i8: { min: -128, max: 127 },
	u16: { min: 0, max: 65535 },
	i16: { min: -32768, max: 32767 },
	u32: { min: 0, max: 4294967295 },
	i32: { min: -2147483648, max: 2147483647 },
	u64: { min: 0, max: Number.MAX_SAFE_INTEGER },
	i64: { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
	i128: { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER },
	u128: { min: 0, max: Number.MAX_SAFE_INTEGER },
};

export const COMPARISON_OPERATORS = new Set(["<", "<=", ">", ">=", "==", "!="]);
export const LOGICAL_OPERATORS = new Set(["??", "||", "&&"]);
export const CHARACTER_TYPES = new Set([DATA_TYPE.char, DATA_TYPE.string]);
export const NEGATIVE_CAPABLE_OPERATORS = new Set(["-"]);
export const NULL_TYPE = "null";

export const INTEGER_TYPES = new Set([
	DATA_TYPE.u8,
	DATA_TYPE.i8,
	DATA_TYPE.u16,
	DATA_TYPE.i16,
	DATA_TYPE.u32,
	DATA_TYPE.i32,
	DATA_TYPE.u64,
	DATA_TYPE.i64,
	DATA_TYPE.i128,
	DATA_TYPE.u128,
]);

export const SIGNED_INTEGER_TYPES = new Set([
	DATA_TYPE.i8,
	DATA_TYPE.i16,
	DATA_TYPE.i32,
	DATA_TYPE.i64,
	DATA_TYPE.i128,
]);

export const SIGNED_INTEGER_FOR_WIDTH = {
	8: DATA_TYPE.i8,
	16: DATA_TYPE.i16,
	32: DATA_TYPE.i32,
	64: DATA_TYPE.i64,
	128: DATA_TYPE.i128,
};

export const WORD_TYPES = {
	signed: { 16: DATA_TYPE.i16, 32: DATA_TYPE.i32, 64: DATA_TYPE.i64 },
	unsigned: { 16: DATA_TYPE.u16, 32: DATA_TYPE.u32, 64: DATA_TYPE.u64 },
};

export const splitUnionTypes = (type) => {
	return type.includes(" | ")
		? type.split(" | ").map((member) => member.trim())
		: [type];
};

const NULLABLE_UNION_SIZE = 2;

export const isArbitraryUnionType = (type) => {
	if (typeof type !== "string") {
		return false;
	}
	const members = splitUnionTypes(type);
	if (members.length <= 1) {
		return false;
	}
	if (members.length === NULLABLE_UNION_SIZE) {
		return members.filter((member) => member === NULL_TYPE).length !== 1;
	}
	return true;
};

export const isNullableType = (type) => {
	if (typeof type !== "string" || !type) {
		return false;
	}
	return splitUnionTypes(type).includes(NULL_TYPE);
};

export const getNonNullableType = (type) => {
	if (typeof type !== "string" || !isNullableType(type)) {
		return type;
	}
	const members = splitUnionTypes(type).filter(
		(member) => member !== NULL_TYPE,
	);
	return members.length > 0 ? members.join(" | ") : NULL_TYPE;
};

export const isNullLiteralNode = (node) => {
	return node?.type === AST_NODE.literal && node.value === null;
};

export const isNumericType = (type) => {
	return INTEGER_TYPES.has(type) || FLOAT_TYPES.has(type);
};

export const rangeFitsWithin = (sourceRange, targetRange) => {
	return Boolean(
		sourceRange &&
			targetRange &&
			sourceRange.min >= targetRange.min &&
			sourceRange.max <= targetRange.max,
	);
};

export const isBefore = (leftLocation, rightLocation) =>
	leftLocation.line < rightLocation.line ||
	(leftLocation.line === rightLocation.line &&
		leftLocation.column < rightLocation.column);

export const getRootName = (node) => {
	let current = node;
	while (
		current?.type === AST_NODE.memberExpression ||
		current?.type === AST_NODE.indexExpression
	) {
		current = current.object;
	}
	return current?.name;
};

export const unwrapParentheses = (node) => {
	while (node?.type === AST_NODE.parenthesizedExpression) {
		node = node.expression;
	}
	return node;
};

export const unwrapToIdentifier = (node) => {
	node = unwrapParentheses(node);
	return node?.type === AST_NODE.identifier ? node : null;
};
