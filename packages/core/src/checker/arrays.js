import { evaluateConstant } from "../const-eval.js";
import {
	AST_NODE,
	DATA_TYPE,
	FLOAT_TYPES,
	INTEGER_WIDTHS,
	UNRESOLVED_TYPE,
} from "../constants.js";
import { resolveFloatType, resolveIntegerType } from "./type-resolution.js";
import { INTEGER_TYPES } from "./types.js";

export const parseArrayType = (type) => {
	if (!type) {
		return null;
	}
	const match = type.match(/^(.+)\[(\d*)\]$/);
	if (!match) {
		return null;
	}
	return {
		elementType: match[1],
		capacity: match[2] ? Number(match[2]) : null,
	};
};

export const parseArrayElementType = (type) => {
	const arrayType = parseArrayType(type);
	return arrayType ? arrayType.elementType : null;
};

// A literal element is folded directly; any other node needs the surrounding
// AST for constant folding (identifiers, folded expressions). When the AST is
// not available the element simply cannot be folded here.
const evaluateElementConstant = (ast, element) => {
	if (element?.type === AST_NODE.literal) {
		return element.value;
	}
	if (!ast) {
		return null;
	}
	return evaluateConstant(ast, element);
};

export const inferArrayElementType = (
	ast,
	elements,
	resolveNameType,
	wordType,
	resolveElementType = null,
	widenToWord = true,
) => {
	const intValues = [];
	const floatValues = [];
	let nonNumeric = null;
	let hasNumeric = false;
	let hasUnknown = false;

	for (const element of elements ?? []) {
		const value = evaluateElementConstant(ast, element);
		if (typeof value === "number") {
			hasNumeric = true;
			if (Number.isInteger(value)) {
				intValues.push(value);
			} else {
				floatValues.push(value);
			}
			continue;
		}
		if (element?.type === AST_NODE.arrayLiteral) {
			const nested = inferArrayElementType(
				ast,
				element.elements,
				resolveNameType,
				wordType,
				resolveElementType,
				widenToWord,
			);
			if (!nested) {
				hasUnknown = true;
				continue;
			}
			const nestedArrayType = `${nested}[]`;
			if (nonNumeric && nonNumeric !== nestedArrayType) {
				return null;
			}
			nonNumeric = nestedArrayType;
			continue;
		}
		let type = null;
		if (element?.type === AST_NODE.identifier && resolveNameType) {
			type = resolveNameType(element.name);
		}
		if (!type && resolveElementType) {
			type = resolveElementType(element);
		}
		if (type === UNRESOLVED_TYPE) {
			hasUnknown = true;
			continue;
		}
		if (type && (INTEGER_TYPES.has(type) || FLOAT_TYPES.has(type))) {
			hasNumeric = true;
			if (FLOAT_TYPES.has(type)) {
				floatValues.push(0);
			} else {
				intValues.push(0);
			}
			continue;
		}
		if (typeof value === "string" || type === DATA_TYPE.string) {
			if (nonNumeric && nonNumeric !== DATA_TYPE.string) {
				return null;
			}
			nonNumeric = DATA_TYPE.string;
			continue;
		}
		if (typeof value === "boolean" || type === DATA_TYPE.boolean) {
			if (nonNumeric && nonNumeric !== DATA_TYPE.boolean) {
				return null;
			}
			nonNumeric = DATA_TYPE.boolean;
			continue;
		}
		if (type) {
			if (nonNumeric && nonNumeric !== type) {
				return null;
			}
			nonNumeric = type;
			continue;
		}
		hasUnknown = true;
	}

	if (hasUnknown) {
		return null;
	}
	if (hasNumeric && nonNumeric) {
		return null;
	}
	if (intValues.length > 0 && floatValues.length > 0) {
		return null;
	}
	if (floatValues.length > 0) {
		return resolveFloatType(Math.max(...floatValues));
	}
	if (intValues.length > 0) {
		const min = Math.min(...intValues);
		const max = Math.max(...intValues);
		const resolved = resolveIntegerType(min, max, true);
		if (!widenToWord) {
			return resolved;
		}
		const wordWidth = INTEGER_WIDTHS[wordType];
		const resolvedWidth = INTEGER_WIDTHS[resolved];
		return resolvedWidth < wordWidth ? wordType : resolved;
	}
	return nonNumeric;
};
