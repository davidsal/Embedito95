import { AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { collectBoundNames } from "./references-checks.js";

// A method-only type (declares methods, no data fields) is a CALLBACK RECORD:
// its value struct holds function POINTERS. Shared by the literal check (an
// inline `functionExpression` has nowhere to live) and the method-assignment
// check (the slot IS writable, unlike a class member function).
export const isMethodOnlyType = (typeInfo) => {
	if (!typeInfo) {
		return false;
	}
	return (
		Object.keys(typeInfo.methods ?? {}).length > 0 &&
		Object.keys(typeInfo.fields ?? {}).length === 0
	);
};

// Keys whose identifiers are NOT value references (they name a type or bind a
// parameter), so they must not be counted as free variables of a function.
const NON_REFERENCE_KEYS = new Set([
	"loc",
	"typeAnnotation",
	"returnType",
	"params",
]);

export const collectFreeNames = (node, boundNames, freeNames) => {
	if (!node || typeof node !== "object") {
		return;
	}
	if (node.type === AST_NODE.identifier) {
		if (!boundNames.has(node.name)) {
			freeNames.add(node.name);
		}
		return;
	}
	if (node.type === AST_NODE.memberExpression) {
		collectFreeNames(node.object, boundNames, freeNames);
		if (node.computed) {
			collectFreeNames(node.property, boundNames, freeNames);
		}
		return;
	}
	if (node.type === AST_NODE.objectLiteral) {
		for (const property of node.properties ?? []) {
			collectFreeNames(property.value, boundNames, freeNames);
		}
		return;
	}
	for (const [key, value] of Object.entries(node)) {
		if (NON_REFERENCE_KEYS.has(key)) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				collectFreeNames(item, boundNames, freeNames);
			}
		} else {
			collectFreeNames(value, boundNames, freeNames);
		}
	}
};

// An inline method becomes a plain C++ function (a captureless lambda that
// converts to the slot's function pointer), so it can only reference its own
// parameters/locals, globals, and builtins. Referencing a name bound by an
// enclosing function (`localNames`) would need a real closure and is rejected.
export const capturesLocalState = (functionExpression, localNames) => {
	if (!localNames || localNames.size === 0) {
		return false;
	}
	const boundNames = collectBoundNames(functionExpression);
	const freeNames = new Set();
	collectFreeNames(functionExpression, boundNames, freeNames);
	for (const name of freeNames) {
		if (localNames.has(name)) {
			return true;
		}
	}
	return false;
};

// A method-only type (declares methods, no data fields) is a callback record:
// its value struct holds function POINTERS. An inline `functionExpression` may be
// stored only when it captures no enclosing state, because it lowers to a plain
// function (captureless lambda) whose address is stored in the slot. A method
// that captures state needs a factory (closure) instead. Factory returns are
// exempt (they become closures), so this is only checked for direct assignment
// literals.
export const checkMethodOnlyObjectLiteral = (
	objectNode,
	targetType,
	objectTypes,
	localNames = null,
) => {
	const info = objectTypes?.[targetType];
	if (!isMethodOnlyType(info)) {
		return [];
	}
	const errors = [];
	for (const property of objectNode.properties ?? []) {
		if (property.value?.type !== AST_NODE.functionExpression) {
			continue;
		}
		if (!capturesLocalState(property.value, localNames)) {
			continue;
		}
		errors.push(
			makeDiagnostic({
				code: ERROR_CODE.methodOnlyObjectLiteral,
				params: { type: targetType, method: property.key },
				location: property.loc ?? objectNode.loc,
			}),
		);
	}
	return errors;
};
