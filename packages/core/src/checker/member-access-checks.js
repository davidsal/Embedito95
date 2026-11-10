import { AST_NODE, DATA_TYPE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { isNumericType, NULL_TYPE } from "./types.js";
import { walk } from "./walk.js";

const UNKNOWN_MEMBER_NAME = "?";

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

const checkMemberExpression = (state, node, methodCallees) => {
	if (methodCallees.has(node)) {
		return;
	}
	const receiverType = state.context.resolveCheckExpressionType(node.object);
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
