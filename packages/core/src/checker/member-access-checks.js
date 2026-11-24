import { AST_NODE, DATA_TYPE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import {
	TASK_STATE_COMPLETED_KEY,
	TASK_STATE_VALUE_KEY,
} from "../strategy-shared/async-constants.js";
import {
	parseAsyncTaskType,
	resolveAsyncTaskFieldType,
} from "./async-task-type.js";
import { decodeObjectShape } from "./object-shapes.js";
import { isNumericType, NULL_TYPE } from "./types.js";
import { walk } from "./walk.js";

const UNKNOWN_MEMBER_NAME = "?";
const IDENTIFIER_NAME_PATTERN = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

// The public `AsyncTask` API is fixed: `completed` and `value`. The async
// constants are the single source of truth for those field names, so the
// checker can accept them even before the library declaration is loaded. The
// declared field type still comes from `resolveAsyncTaskFieldType`, which
// substitutes `T` with the type argument.
const ASYNC_TASK_PUBLIC_FIELD_NAMES = new Set([
	TASK_STATE_COMPLETED_KEY,
	TASK_STATE_VALUE_KEY,
]);

// A scalar primitive has no fields or methods. Strings, arrays, enums, object
// types and shapes are excluded on purpose: they either expose members or are
// validated by their own passes.
const isMemberlessScalarType = (type) => {
	if (!type) {
		return false;
	}
	if (type === DATA_TYPE.char) {
		return true;
	}
	return (
		isNumericType(type) ||
		type === DATA_TYPE.boolean ||
		type === DATA_TYPE.void ||
		type === NULL_TYPE
	);
};

// Method calls (`receiver.method()`) are validated by `checkMethodCalls`, so
// their callee member expressions are skipped here to avoid duplicate or
// spurious diagnostics (`s.length()`, `arr.length()`, `this.method()`).
const collectMethodCallees = (ast) => {
	const callees = new Set();
	walk(ast, {
		enter: (node) => {
			if (
				node.type === AST_NODE.callExpression &&
				node.callee?.type === AST_NODE.memberExpression
			) {
				callees.add(node.callee);
			}
		},
	});
	return callees;
};

const pushInvalidMemberAccess = (state, node, receiverType) => {
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.invalidMemberAccess,
			params: {
				name: node.property?.name ?? UNKNOWN_MEMBER_NAME,
				type: receiverType,
			},
			location: node.property?.loc ?? node.loc,
		}),
	);
};

const pushUnknownMember = (state, node, receiverType) => {
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.unknownMember,
			params: {
				name: node.property?.name ?? UNKNOWN_MEMBER_NAME,
				type: receiverType,
			},
			location: node.property?.loc ?? node.loc,
		}),
	);
};

// A field is data (`fields`), a method exposed by the type, or a value captured
// by a closure factory. Checking all three keeps valid member access from being
// reported while still rejecting names the type does not declare.
const isKnownObjectMember = (objectTypeDefinition, memberName) => {
	return (
		Object.hasOwn(objectTypeDefinition.fields ?? {}, memberName) ||
		Object.hasOwn(objectTypeDefinition.methods ?? {}, memberName) ||
		objectTypeDefinition.capturedFieldTypes?.has(memberName) === true
	);
};

// `AsyncTask<T>` wraps a payload that only becomes the task value after
// `await`; it is not the payload type itself. Only the public task fields
// (`completed`/`value`) are accessible on the wrapper. Any other member means
// the user forgot the `await`, which the lowered intermediate would otherwise
// reject late as an `i8` task-handle field assignment. This is why the access is
// reported here, at the source property, with `asyncTaskMemberAccess`.
const isKnownAsyncTaskField = (state, receiverType, memberName) => {
	const declaredFieldType = resolveAsyncTaskFieldType(
		receiverType,
		memberName,
		state.objectTypes,
	);
	if (declaredFieldType !== null) {
		return true;
	}
	return ASYNC_TASK_PUBLIC_FIELD_NAMES.has(memberName);
};

const pushAsyncTaskMemberAccess = (state, node, receiverType) => {
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.asyncTaskMemberAccess,
			params: {
				name: node.property?.name ?? UNKNOWN_MEMBER_NAME,
				type: receiverType,
			},
			location: node.property?.loc ?? node.loc,
		}),
	);
};

// Returns true when the receiver is an `AsyncTask` wrapper, so the caller stops
// before the object and scalar checks. `await` already unwraps the type, so
// `(await task).member` arrives here with the payload type and follows the
// regular member checks instead.
const checkAsyncTaskMemberAccess = (state, node, receiverType) => {
	if (parseAsyncTaskType(receiverType) === null) {
		return false;
	}
	const memberName = node.property?.name;
	if (!memberName || !IDENTIFIER_NAME_PATTERN.test(memberName)) {
		return true;
	}
	if (!isKnownAsyncTaskField(state, receiverType, memberName)) {
		pushAsyncTaskMemberAccess(state, node, receiverType);
	}
	return true;
};

// Returns true when the receiver is an object type the checker understands, so
// the caller stops before the primitive-scalar check. Nominal types look up
// their declaration in `objectTypes`; inferred anonymous shapes
// (`object:{…}`) have no entry there and are validated through their decoded
// fields instead.
const checkObjectMemberAccess = (state, node, receiverType) => {
	const objectTypeDefinition = receiverType
		? state.objectTypes?.[receiverType]
		: null;
	const anonymousFields = objectTypeDefinition
		? null
		: decodeObjectShape(receiverType);
	if (!objectTypeDefinition && !anonymousFields) {
		return false;
	}
	const memberName = node.property?.name;
	if (!memberName || !IDENTIFIER_NAME_PATTERN.test(memberName)) {
		return true;
	}
	const isKnownMember = objectTypeDefinition
		? isKnownObjectMember(objectTypeDefinition, memberName)
		: Object.hasOwn(anonymousFields, memberName);
	if (!isKnownMember) {
		pushUnknownMember(state, node, receiverType);
	}
	return true;
};

const checkMemberExpression = (state, node, methodCallees) => {
	if (methodCallees.has(node)) {
		return;
	}
	const receiverType = state.context.resolveCheckExpressionType(node.object);
	if (checkAsyncTaskMemberAccess(state, node, receiverType)) {
		return;
	}
	if (checkObjectMemberAccess(state, node, receiverType)) {
		return;
	}
	if (!isMemberlessScalarType(receiverType)) {
		return;
	}
	pushInvalidMemberAccess(state, node, receiverType);
};

// Reports property access on a primitive scalar receiver, e.g.
// `(await getNumberAsync()).value` where the awaited task yields `i8`.
export const checkMemberAccess = (state) => {
	const methodCallees = collectMethodCallees(state.ast);
	walk(state.ast, {
		enter: (node) => {
			if (node.type === AST_NODE.memberExpression) {
				checkMemberExpression(state, node, methodCallees);
			}
		},
	});
};
