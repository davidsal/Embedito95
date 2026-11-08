import { OBJECT_SHAPE_PREFIX } from "../constants.js";

export const encodeObjectShape = (fields) => {
	return `${OBJECT_SHAPE_PREFIX}{${Object.entries(fields)
		.map(([name, definition]) => {
			const type = definition?.type ?? null;
			if (!type) {
				return name;
			}
			return `${name}:${type}${definition?.optional ? "?" : ""}`;
		})
		.join(";")}}`;
};

export const isObjectShapeType = (type) => {
	return typeof type === "string" && type.startsWith(OBJECT_SHAPE_PREFIX);
};

// A field type can itself be a NESTED anonymous shape (`object:{…}`) or an
// `Array<…>`/`Array<object:{…}>`, so the flat `;`/`:` separators of a shape
// string also appear *inside* a value. Splitting must only cut on separators
// at nesting depth zero, where `{`/`}` (object shapes) and `<`/`>` (arrays)
// are balanced. Every type string here is well-formed, so one depth counter
// over the brace/angle delimiters is enough.
const isOpeningBalancer = (char) => char === "{" || char === "<";
const isClosingBalancer = (char) => char === "}" || char === ">";

const splitTopLevelSegments = (text) => {
	const segments = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (isOpeningBalancer(char)) {
			depth += 1;
		} else if (isClosingBalancer(char)) {
			depth -= 1;
		} else if (char === ";" && depth === 0) {
			segments.push(text.slice(start, index));
			start = index + 1;
		}
	}
	segments.push(text.slice(start));
	return segments;
};

const findTopLevelColon = (segment) => {
	let depth = 0;
	for (let index = 0; index < segment.length; index += 1) {
		const char = segment[index];
		if (isOpeningBalancer(char)) {
			depth += 1;
		} else if (isClosingBalancer(char)) {
			depth -= 1;
		} else if (char === ":" && depth === 0) {
			return index;
		}
	}
	return -1;
};

export const decodeObjectShape = (type) => {
	if (!isObjectShapeType(type)) {
		return null;
	}
	const inner = type.slice(OBJECT_SHAPE_PREFIX.length + 1, -1);
	if (!inner) {
		return {};
	}
	const fields = {};
	for (const segment of splitTopLevelSegments(inner)) {
		const separatorIndex = findTopLevelColon(segment);
		if (separatorIndex === -1) {
			fields[segment] = { type: null, optional: false };
			continue;
		}
		const name = segment.slice(0, separatorIndex);
		let fieldType = segment.slice(separatorIndex + 1);
		const optional = fieldType.endsWith("?");
		if (optional) {
			fieldType = fieldType.slice(0, -1);
		}
		fields[name] = { type: fieldType, optional };
	}
	return fields;
};

const getObjectFieldDefinition = (objectType, fieldName, objectTypes) => {
	const declared = objectTypes?.[objectType]?.fields?.[fieldName];
	if (declared) {
		return declared;
	}
	const inferred = decodeObjectShape(objectType);
	if (inferred) {
		return inferred[fieldName] ?? null;
	}
	return null;
};

export const resolveObjectFieldType = (objectType, fieldName, objectTypes) => {
	return (
		getObjectFieldDefinition(objectType, fieldName, objectTypes)?.type ?? null
	);
};
