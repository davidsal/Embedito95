import {
	inferLiteralType,
	resolveConstIntegerType,
	resolveWordDataType,
} from "../checker/index.js";
import {
	DATA_TYPE,
	DATA_TYPE_TO_C_TYPE,
	DEFAULT_WORD_SIZE,
	FLOAT_TYPES,
} from "../constants.js";

export const resolveWordCType = (platform) => {
	const wordSize = platform?.specs?.wordSize ?? DEFAULT_WORD_SIZE;
	return resolveWordDataType(wordSize);
};

export const resolveLiteralCType = (value) => {
	if (Number.isInteger(value) && typeof value === "number") {
		const type = resolveConstIntegerType(value);
		return DATA_TYPE_TO_C_TYPE[type] ?? DATA_TYPE.i32;
	}
	const type = inferLiteralType(value);
	return DATA_TYPE_TO_C_TYPE[type] ?? DATA_TYPE.i32;
};

export const dataTypeToCType = (type, wordCType) => {
	if (!type) {
		return wordCType;
	}
	return DATA_TYPE_TO_C_TYPE[type] ?? wordCType;
};

export const isFloatType = (type) => FLOAT_TYPES.has(type);

export const optionalName = (ctype) => {
	return `nullable<${ctype}>`;
};

// A value whose type is exactly `null` has no payload type of its own. It is
// represented like the `null` literal (`nullable<u8>{ true, 0 }`) so the field
// can be stored and compared with `== null` without inventing a new C type.
export const NULL_ONLY_C_TYPE = optionalName(DATA_TYPE.u8);
