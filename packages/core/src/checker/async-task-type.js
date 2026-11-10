import { AST_NODE, DATA_TYPE } from "../constants.js";
import { TASK_STATE_COMPLETED_KEY } from "../strategy-shared/async-constants.js";
import { NULL_TYPE } from "./types.js";

// `AsyncTask` is the only type in e95 that accepts type arguments. It is not a
// user generic: the language knows how to build, parse and unwrap it so the
// checker never has to concatenate or inspect the printable type string.
export const ASYNC_TASK_TYPE_NAME = "AsyncTask";

export const ASYNC_TASK_TYPE_PARAMETER_NAME = "T";

const TYPE_ARGUMENT_OPEN = "<";
const TYPE_ARGUMENT_CLOSE = ">";
const TYPE_ARGUMENT_PREFIX = `${ASYNC_TASK_TYPE_NAME}${TYPE_ARGUMENT_OPEN}`;

// Parses `AsyncTask` or `AsyncTask<T>` (with balanced `<...>` for a nested
// argument). Anything else, including a union or an array suffix, returns null.
export const parseAsyncTaskType = (type) => {
	if (typeof type !== "string") {
		return null;
	}
	const trimmedType = type.trim();
	if (trimmedType === ASYNC_TASK_TYPE_NAME) {
		return { argumentType: null };
	}
	if (!trimmedType.startsWith(TYPE_ARGUMENT_PREFIX)) {
		return null;
	}
	const openIndex = ASYNC_TASK_TYPE_NAME.length;
	let depth = 0;
	let closeIndex = -1;
	for (let index = openIndex; index < trimmedType.length; index++) {
		const character = trimmedType[index];
		if (character === TYPE_ARGUMENT_OPEN) {
			depth++;
			continue;
		}
		if (character !== TYPE_ARGUMENT_CLOSE) {
			continue;
		}
		depth--;
		if (depth === 0) {
			closeIndex = index;
			break;
		}
	}
	if (closeIndex !== trimmedType.length - 1) {
		return null;
	}
	const argumentType = trimmedType.slice(openIndex + 1, closeIndex).trim();
	if (!argumentType) {
		return null;
	}
	return { argumentType };
};

export const isAsyncTaskType = (type) => {
	return parseAsyncTaskType(type) !== null;
};

const isEmptyPayloadType = (type) => {
	return !type || type === DATA_TYPE.void || type === NULL_TYPE;
};

// Builds the call type of an async function. A declared `AsyncTask` annotation
// is reused instead of being wrapped again (`AsyncTask<i8>` stays
// `AsyncTask<i8>`), and an empty/void/null payload erases to plain `AsyncTask`.
export const createAsyncTaskType = (argumentType) => {
	if (isEmptyPayloadType(argumentType)) {
		return ASYNC_TASK_TYPE_NAME;
	}
	const existing = parseAsyncTaskType(argumentType);
	if (existing) {
		return createAsyncTaskType(existing.argumentType);
	}
	return `${ASYNC_TASK_TYPE_NAME}${TYPE_ARGUMENT_OPEN}${argumentType}${TYPE_ARGUMENT_CLOSE}`;
};

// `await AsyncTask<T>` yields `T`; `await AsyncTask` yields null. A type that is
// not `AsyncTask` also yields null here; the checker reports it separately.
export const unwrapAsyncTaskType = (type) => {
	const parsed = parseAsyncTaskType(type);
	if (!parsed) {
		return null;
	}
	return parsed.argumentType ?? NULL_TYPE;
};

// Removes a balanced `<...>` suffix so lookups such as `typeIsKnown` can match
// the declaration name (`AsyncTask<i8>` -> `AsyncTask`). Keeps array suffixes.
export const stripTypeArguments = (type) => {
	if (typeof type !== "string") {
		return type;
	}
	const openIndex = type.indexOf(TYPE_ARGUMENT_OPEN);
	if (openIndex === -1) {
		return type;
	}
	let depth = 0;
	for (let index = openIndex; index < type.length; index++) {
		const character = type[index];
		if (character === TYPE_ARGUMENT_OPEN) {
			depth++;
			continue;
		}
		if (character !== TYPE_ARGUMENT_CLOSE) {
			continue;
		}
		depth--;
		if (depth === 0) {
			return `${type.slice(0, openIndex)}${type.slice(index + 1)}`;
		}
	}
	return type;
};

// Resolves a field of an `AsyncTask<T>` value. The declared field types live in
// `objectTypes["AsyncTask"]`, where the payload field uses the type parameter
// name (`T`). Substituting it here keeps the checker from parsing the printable
// type string by hand. Without a type argument the payload erases to null (the
// `T = null` default).
export const resolveAsyncTaskFieldType = (type, fieldName, objectTypes) => {
	const parsed = parseAsyncTaskType(type);
	if (!parsed) {
		return null;
	}
	const declaredField =
		objectTypes?.[ASYNC_TASK_TYPE_NAME]?.fields?.[fieldName];
	const declaredType = declaredField?.type;
	if (!declaredType) {
		return null;
	}
	if (declaredType !== ASYNC_TASK_TYPE_PARAMETER_NAME) {
		return declaredType;
	}
	return parsed.argumentType ?? NULL_TYPE;
};

// A task-state literal reports progress instead of a payload (`{ completed:
// false }`), so it must not be validated against the payload type.
export const isAsyncTaskStateLiteral = (node) => {
	return (
		node?.type === AST_NODE.objectLiteral &&
		(node.properties ?? []).some((property) => {
			return property.key === TASK_STATE_COMPLETED_KEY;
		})
	);
};
