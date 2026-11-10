import { getNonNullableType, isObjectShapeType } from "../checker/index.js";
import { AST_NODE, DATA_TYPE, OBJECT_TYPE } from "../constants.js";
import { resolveAnonymousObjectTypeName } from "./anonymous-type-names.js";
import { optionalName } from "./c-types.js";

const isEnumType = (type, context) => {
	if (context.enumNames?.has(type) || context.enumTypeNames?.has(type)) {
		return true;
	}
	for (const statement of context.ast?.body ?? []) {
		if (
			statement.type === AST_NODE.enumDeclaration &&
			statement.name === type
		) {
			return true;
		}
	}
	return false;
};

export const renderOptionalZero = (entry, float64Software) => {
	if (entry.isHandle || entry.isStructHandle || entry.isString) {
		return `${entry.ctype}::null()`;
	}
	if (entry.isObject || entry.isStruct || entry.isAnyObject) {
		return "{}";
	}
	if (entry.isEnum) {
		return `static_cast<${entry.ctype}>(0)`;
	}
	if (entry.ctype === DATA_TYPE.f32) {
		return "0.0f";
	}
	if (entry.ctype === DATA_TYPE.f64) {
		return float64Software ? "f64::fromBits(0x00000000u, 0x00000000u)" : "0.0";
	}
	if (entry.ctype === DATA_TYPE.boolean) {
		return "false";
	}
	return "0";
};

// A null stored into a `nullable<T>` is the engaged-with-zero payload; any other
// value is the disengaged-with-value payload.
export const renderOptionalNull = (entry, float64Software) => {
	return `${optionalName(entry.ctype)}{ true, ${renderOptionalZero(entry, float64Software)} }`;
};

export const renderOptionalWrap = (entry, rendered) => {
	return `${optionalName(entry.ctype)}{ false, ${rendered} }`;
};

export const resolveOptionalEntry = (type, context) => {
	const nonNullType = getNonNullableType(type);
	const isObject = isObjectShapeType(nonNullType);
	const isHandle = isObject && Boolean(context.isObjectHandle?.(nonNullType));
	const isString = nonNullType === DATA_TYPE.string;
	const isEnum = isEnumType(nonNullType, context);
	const isAnyObject = nonNullType === OBJECT_TYPE;
	const isStruct =
		Boolean(context.userTypeNames?.has(nonNullType)) ||
		Boolean(context.objectTypes?.[nonNullType]);
	const isStructHandle =
		isStruct && Boolean(context.isObjectHandle?.(nonNullType));
	const ctype = isObject
		? isHandle
			? context.toCType(nonNullType)
			: resolveAnonymousObjectTypeName(
					nonNullType,
					context.anonymousObjectTypes,
					context.getCurrentFunctionName?.(),
				)
		: context.toCType(nonNullType);
	return {
		ctype,
		isObject,
		isHandle,
		isStructHandle,
		isEnum,
		isString,
		isStruct,
		isAnyObject,
	};
};
