import { parseArrayType } from "../checker/index.js";
import { INDENT } from "../constants.js";
import {
	ADD_TASK_FUNCTION_NAME,
	ASYNC_ENUM_NAME,
	ASYNC_TASK_ITEM_TYPE_NAME,
	TASK_CHILD_PARAMETER_NAME,
	TASK_PARAMETER_NAME,
	toChildFieldName,
	UNUSED_TASK_FIELD_NAME,
} from "./async-constants.js";

export const buildTypeMembers = (params, fields, childNames, childType) => {
	const members = [];

	for (const childName of childNames) {
		members.push({
			name: toChildFieldName(childName),
			type: childType,
			optional: true,
			isParam: false,
		});
	}

	for (const param of params) {
		members.push({
			name: param.name,
			type: param.type,
			optional: false,
			isParam: true,
		});
	}

	for (const field of fields) {
		members.push({
			name: field.name,
			type: field.type,
			optional: false,
			isParam: false,
		});
	}

	if (members.length === 0) {
		// An async task with nothing to store (only zero-duration awaits, no
		// locals/children) still needs a non-empty shape: a zero-field type is
		// treated as a stateless callback record and would not lower to a shared
		// `Object<T>` handle, so it could not be carried as the task payload.
		members.push({
			name: UNUSED_TASK_FIELD_NAME,
			type: "u8",
			optional: false,
			isParam: false,
		});
	}

	return members;
};

export const ASYNC_TYPE_SOURCE = (typeName, members) => {
	const body = members
		.map((member) => {
			const optional = member.optional ? "?" : "";
			return `${INDENT}${member.name}${optional}: ${member.type}`;
		})
		.join("\n");
	return `type ${typeName} = {\n${body}\n}\n`;
};

const isArrayType = (type) => {
	return typeof type === "string" && parseArrayType(type) !== null;
};

const isUnionType = (type) => {
	return typeof type === "string" && type.includes("|");
};

const defaultObjectValue = (typeName, objectTypes, visited) => {
	const info = objectTypes?.[typeName];
	if (!info || visited.has(typeName)) {
		return "null";
	}
	const nextVisited = new Set(visited);
	nextVisited.add(typeName);
	const values = Object.entries(info.fields)
		.filter(([, definition]) => {
			return !definition.optional;
		})
		.map(([fieldName, definition]) => {
			return `${fieldName}: ${defaultFieldValue(definition.type, objectTypes, nextVisited)}`;
		});
	return `{ ${values.join(", ")} }`;
};

const defaultFieldValue = (type, objectTypes, visited) => {
	if (type === "boolean") {
		return "false";
	}
	if (type === "string") {
		return '""';
	}
	if (objectTypes?.[type]) {
		return defaultObjectValue(type, objectTypes, visited);
	}
	if (isArrayType(type)) {
		return "[]";
	}
	if (isUnionType(type)) {
		return "null";
	}
	return "0";
};

const buildWrapperObject = (members, objectTypes) => {
	const values = members.map((member) => {
		if (member.optional) {
			return `${member.name}: null`;
		}
		const value = member.isParam
			? member.name
			: defaultFieldValue(member.type, objectTypes, new Set());
		return `${member.name}: ${value}`;
	});

	return `{ ${values.join(", ")} }`;
};

export const makeWrapperSource = (
	name,
	typeName,
	members,
	memberName,
	objectTypes,
) => {
	const parameterSignature = members
		.filter((member) => {
			return member.isParam;
		})
		.map((member) => {
			return `${member.name}: ${member.type}`;
		})
		.join(", ");
	const signature =
		parameterSignature.length > 0
			? `${parameterSignature}, ${TASK_CHILD_PARAMETER_NAME}: boolean`
			: `${TASK_CHILD_PARAMETER_NAME}: boolean`;
	const object = buildWrapperObject(members, objectTypes);
	return `const ${name} = (${signature}): ${ASYNC_TASK_ITEM_TYPE_NAME} => {\n${INDENT}const ${TASK_PARAMETER_NAME}: ${typeName} = ${object}\n${INDENT}return ${ADD_TASK_FUNCTION_NAME}(${TASK_PARAMETER_NAME}, ${ASYNC_ENUM_NAME}.${memberName}, ${TASK_CHILD_PARAMETER_NAME})\n}\n`;
};
