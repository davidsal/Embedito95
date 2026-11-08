import { DATA_TYPE } from "../constants.js";

// Placeholder for a parameter typed as the array's element type, substituted by
// `resolveArrayMethod` with the concrete element type at the call site.
const ARRAY_ELEMENT_TYPE = "element";

// The built-in `Array<T>` method surface. It mirrors the generated
// `core_array::Array<T>` C++ API and is the single source of truth shared by the
// language and the LSP, so array hovers cannot drift from the codegen.
export const ARRAY_METHODS = {
	length: { returnType: DATA_TYPE.u16, params: [] },
	capacity: { returnType: DATA_TYPE.u16, params: [] },
	pop: { returnType: DATA_TYPE.void, params: [] },
	push: {
		returnType: DATA_TYPE.void,
		params: [{ name: "value", type: ARRAY_ELEMENT_TYPE }],
	},
	reserve: {
		returnType: DATA_TYPE.void,
		params: [{ name: "newCapacity", type: DATA_TYPE.u16 }],
	},
	shrink: {
		returnType: DATA_TYPE.void,
		params: [{ name: "newCapacity", type: DATA_TYPE.u16 }],
	},
	truncate: {
		returnType: DATA_TYPE.void,
		params: [{ name: "newSize", type: DATA_TYPE.u16 }],
	},
};

export const resolveArrayMethod = (methodName, elementType) => {
	const method = ARRAY_METHODS[methodName];
	if (!method) {
		return null;
	}
	const params = method.params.map((param) => {
		return {
			name: param.name,
			type: param.type === ARRAY_ELEMENT_TYPE ? elementType : param.type,
		};
	});
	return { params, returnType: method.returnType };
};
