import { DATA_TYPE } from "../constants.js";

// Array return types of the conversion surface. `Array<T>` methods resolve
// through the shared array table once a caller chains on these values.
const U8_ARRAY_TYPE = `${DATA_TYPE.u8}[]`;
const CHAR_ARRAY_TYPE = `${DATA_TYPE.char}[]`;

// The built-in `string` method surface. It mirrors the generated
// `core_string::String` C++ API and is the single source of truth shared by the
// language and the LSP, so string hovers and completions cannot drift from the
// codegen. The read accessors are const and never detach the copy-on-write
// handle; push/pop and the explicit mutators detach before writing.
export const STRING_METHODS = {
	length: { returnType: DATA_TYPE.u16, params: [] },
	// The handle already exposed push/pop before this read-only surface; keep
	// them in the single table so the codegen and editor stay in sync.
	push: {
		returnType: DATA_TYPE.void,
		params: [{ name: "value", type: DATA_TYPE.char }],
	},
	pop: { returnType: DATA_TYPE.void, params: [] },
	getCharacter: {
		returnType: DATA_TYPE.char,
		params: [{ name: "index", type: DATA_TYPE.u16 }],
	},
	getSlice: {
		returnType: DATA_TYPE.string,
		params: [
			{ name: "start", type: DATA_TYPE.u16 },
			{ name: "end", type: DATA_TYPE.u16 },
		],
	},
	findTextFrom: {
		returnType: DATA_TYPE.i16,
		params: [
			{ name: "needle", type: DATA_TYPE.string },
			{ name: "from", type: DATA_TYPE.u16 },
		],
	},
	findLastTextFrom: {
		returnType: DATA_TYPE.i16,
		params: [
			{ name: "needle", type: DATA_TYPE.string },
			{ name: "from", type: DATA_TYPE.u16 },
		],
	},
	hasPrefix: {
		returnType: DATA_TYPE.boolean,
		params: [{ name: "prefix", type: DATA_TYPE.string }],
	},
	hasSuffix: {
		returnType: DATA_TYPE.boolean,
		params: [{ name: "suffix", type: DATA_TYPE.string }],
	},
	matchesText: {
		returnType: DATA_TYPE.boolean,
		params: [{ name: "other", type: DATA_TYPE.string }],
	},
	matchesTextIgnoringCase: {
		returnType: DATA_TYPE.boolean,
		params: [{ name: "other", type: DATA_TYPE.string }],
	},
	// Mutators. They detach a shared copy-on-write handle before writing, so the
	// original stays untouched when a copy is mutated.
	setCharacter: {
		returnType: DATA_TYPE.void,
		params: [
			{ name: "index", type: DATA_TYPE.u16 },
			{ name: "value", type: DATA_TYPE.char },
		],
	},
	appendText: {
		returnType: DATA_TYPE.void,
		params: [{ name: "other", type: DATA_TYPE.string }],
	},
	replaceText: {
		returnType: DATA_TYPE.boolean,
		params: [
			{ name: "search", type: DATA_TYPE.string },
			{ name: "replacement", type: DATA_TYPE.string },
		],
	},
	removeRange: {
		returnType: DATA_TYPE.void,
		params: [
			{ name: "start", type: DATA_TYPE.u16 },
			{ name: "end", type: DATA_TYPE.u16 },
		],
	},
	trimWhitespace: { returnType: DATA_TYPE.void, params: [] },
	toUpperCase: { returnType: DATA_TYPE.void, params: [] },
	toLowerCase: { returnType: DATA_TYPE.void, params: [] },
	// Numeric conversion and buffer copies. The parsers are hand-written and
	// locale-independent, so they return the same values on every platform. A
	// parse that finds no number returns zero; `parseInteger` saturates at the
	// i32 bounds on overflow instead of wrapping.
	parseInteger: { returnType: DATA_TYPE.i32, params: [] },
	parseFloat32: { returnType: DATA_TYPE.f32, params: [] },
	parseFloat64: { returnType: DATA_TYPE.f64, params: [] },
	// `toByteArray` has one element per character (no terminator), while
	// `toCharacterArray` appends the trailing '\0' (length + 1).
	toByteArray: { returnType: U8_ARRAY_TYPE, params: [] },
	toCharacterArray: { returnType: CHAR_ARRAY_TYPE, params: [] },
	// Grow-only hint: raises the backing capacity to at least the requested
	// value and never drops below the current text length.
	reserveCapacity: {
		returnType: DATA_TYPE.void,
		params: [{ name: "minimumCapacity", type: DATA_TYPE.u16 }],
	},
};

export const resolveStringMethod = (methodName) => {
	const method = STRING_METHODS[methodName];
	if (!method) {
		return null;
	}
	return { params: method.params, returnType: method.returnType };
};
