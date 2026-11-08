import { decodeObjectShape, isObjectShapeType } from "./object-shapes.js";
import {
	containsType,
	isAssignableTo,
	isValueAssignable,
} from "./operators.js";
import { splitUnionTypes } from "./types.js";

// A return value is assignable when every member of its (possibly union) type
// fits some member of the declared union. Splitting the actual type matters for
// nullable returns: `_X | null` into `_X | null` must be accepted, while
// `u8 | null` into `u8` must still be rejected.
const isValueAssignableToType = (annotation, type, value, objectTypes) => {
	const declaredMembers = splitUnionTypes(annotation);
	const isLiteral =
		value !== null && (typeof value === "number" || typeof value === "boolean");

	if (isLiteral) {
		return declaredMembers.some((member) => {
			return isValueAssignable(value, member);
		});
	}

	const actualMembers = type ? splitUnionTypes(type) : [];
	const candidates = actualMembers.length > 0 ? actualMembers : [type];
	return candidates.every((actualMember) => {
		return declaredMembers.some((declaredMember) => {
			return isReturnAssignable(declaredMember, actualMember, objectTypes);
		});
	});
};

const isReturnAssignable = (annotation, actualType, objectTypes) => {
	if (containsType(annotation, actualType)) {
		return true;
	}
	const declaredFields = objectTypes?.[annotation]?.fields;
	if (!declaredFields || !isObjectShapeType(actualType)) {
		return false;
	}
	const actualFields = decodeObjectShape(actualType) ?? {};
	for (const [fieldName, definition] of Object.entries(declaredFields)) {
		if (definition?.optional) {
			continue;
		}
		const actualField = actualFields[fieldName];
		if (!actualField || actualField?.kind === "method") {
			return false;
		}
		const expected = definition?.type;
		const actual = actualField?.type;
		if (expected && actual && !isAssignableTo(expected, actual)) {
			return false;
		}
	}
	return true;
};

export const findInvalidReturns = (annotation, inferred, objectTypes) => {
	const invalid = [];

	for (const entry of inferred.returns) {
		const { type, value } = entry;
		const assignable = isValueAssignableToType(
			annotation,
			type,
			value,
			objectTypes,
		);
		if (!assignable) {
			invalid.push(entry);
		}
	}

	return invalid;
};
