import { resolveDefinitionReturnType } from "./overloads.js";

// A core library may declare one signature per numeric-width family instead of
// repeating the same function once per width. The family is the set of widths
// in the union; every family annotation in the signature (parameters and
// return type) is replaced by the same width, so N widths produce N signatures
// and never a cartesian product.
const WIDTH_FAMILIES = [
	["f32", "f64"],
	["i32", "i64", "u32"],
];

const sameWidthSet = (left, right) => {
	if (left.length !== right.length) {
		return false;
	}
	const rightSet = new Set(right);
	return left.every((width) => {
		return rightSet.has(width);
	});
};

// Returns the family widths in the order the union wrote them, or null when the
// type is not a width-family union.
export const parseWidthFamily = (type) => {
	if (typeof type !== "string" || !type.includes("|")) {
		return null;
	}
	const widths = type
		.split("|")
		.map((width) => {
			return width.trim();
		})
		.filter(Boolean);
	if (widths.length < 2) {
		return null;
	}
	const isFamily = WIDTH_FAMILIES.some((family) => {
		return sameWidthSet(family, widths);
	});
	return isFamily ? widths : null;
};

const replaceFamilyWidth = (type, widths, width) => {
	const parsed = parseWidthFamily(type);
	if (!parsed || !sameWidthSet(parsed, widths)) {
		return type;
	}
	return width;
};

// Expands one signature with width-family annotations into one signature per
// width. A signature without family unions is returned unchanged, and a
// signature whose unions name different families is left alone so the checker
// reports it instead of inventing widths.
export const expandWidthFamilySignature = (signature) => {
	const paramFamilies = signature.params
		.map((param) => {
			return parseWidthFamily(param.type);
		})
		.filter(Boolean);
	const returnFamily = parseWidthFamily(signature.returnType);
	const families = returnFamily
		? [...paramFamilies, returnFamily]
		: paramFamilies;
	if (families.length === 0) {
		return [signature];
	}
	const widths = families[0];
	if (
		!families.every((family) => {
			return sameWidthSet(family, widths);
		})
	) {
		return [signature];
	}
	return widths.map((width) => {
		return {
			params: signature.params.map((param) => {
				return {
					...param,
					type: replaceFamilyWidth(param.type, widths, width),
				};
			}),
			returnType: returnFamily
				? replaceFamilyWidth(signature.returnType, widths, width)
				: signature.returnType,
		};
	});
};

export const expandWidthFamilySignatures = (signatures) => {
	return signatures.flatMap((signature) => {
		return expandWidthFamilySignature(signature);
	});
};

const collectLibraryFunctions = (libraryFunctions) => {
	const definitions = {};
	for (const functions of Object.values(libraryFunctions)) {
		for (const [name, definition] of Object.entries(functions)) {
			definitions[name] = definition;
		}
	}
	return definitions;
};

// Flattened `name -> definition` view across every known library. Overloaded
// definitions keep their `signatures` list, so callers can resolve the chosen
// signature from the argument types.
export const buildLibraryFunctionDefinitions = (libraryFunctions) => {
	return collectLibraryFunctions(libraryFunctions);
};

export const buildLibraryFunctionReturnTypes = (libraryFunctions) => {
	const libFunctionReturnTypes = {};
	for (const [name, definition] of Object.entries(
		collectLibraryFunctions(libraryFunctions),
	)) {
		if (definition?.returnType) {
			libFunctionReturnTypes[name] = definition.returnType;
		}
	}
	return libFunctionReturnTypes;
};

export const buildLibraryFunctionReturnTypeResolver = (libraryFunctions) => {
	const definitions = collectLibraryFunctions(libraryFunctions);
	return (name, argumentTypes = [], wordSize = 0) => {
		return resolveDefinitionReturnType(
			definitions[name],
			argumentTypes,
			wordSize,
		);
	};
};

export const flattenLibraryObjectTypes = (libraryObjectTypes) => {
	const objectTypes = {};
	for (const types of Object.values(libraryObjectTypes)) {
		for (const [typeName, definition] of Object.entries(types)) {
			objectTypes[typeName] = definition;
		}
	}
	return objectTypes;
};
