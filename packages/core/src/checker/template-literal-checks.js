import {
	AST_NODE,
	DATA_TYPE,
	ERROR_CODE,
	UNRESOLVED_TYPE,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { resolveReceiverType } from "./expressions.js";
import {
	currentSelfType,
	enterObjectLiteralSelfType,
	exitObjectLiteralSelfType,
} from "./method-checks.js";
import {
	getNonNullableType,
	isNullableType,
	isNumericType,
	NULL_TYPE,
} from "./types.js";
import { walk } from "./walk.js";

const FUNCTION_TYPE = "function";

// The string runtime only exposes constructors for these primitives (and their
// nullable variants). Everything else — objects, anonymous shapes, arrays,
// functions, void — has no `String(...)` overload and would fail in C++.
const isConvertiblePrimitive = (type) => {
	return (
		type === DATA_TYPE.string ||
		type === DATA_TYPE.char ||
		type === DATA_TYPE.boolean ||
		isNumericType(type)
	);
};

// Local enums are emitted as `typedef enum : underlying`, so they convert to
// their underlying integer. Library enums behave the same way.
const isKnownEnum = (state, type) => {
	return state.enumTypes.has(type) || state.libEnumTypeNames.has(type);
};

// Strict allow-list: only primitives (and their nullable variants) and enums
// can be interpolated. Anything that cannot be proven convertible is rejected,
// so an unresolved type (`null`/`undefined`) is NOT treated as convertible: a
// false negative here would let the codegen emit `String(...)` for a value with
// no overload and fail later in C++. The only legitimate exception is
// `UNRESOLVED_TYPE` ("Pin"), a platform handle resolved during code generation.
// A `null`-literal (`NULL_TYPE`) still has its dedicated nullable rendering.
const isConvertibleType = (state, type) => {
	if (type === UNRESOLVED_TYPE || type === NULL_TYPE) {
		return true;
	}
	if (!type) {
		return false;
	}
	if (isNullableType(type)) {
		return isConvertibleType(state, getNonNullableType(type));
	}
	return isConvertiblePrimitive(type) || isKnownEnum(state, type);
};

// Compound literals (`[]`, `{ ... }`, and their nested forms) are never
// convertible, even when inference returns no type for them. Checking the node
// category (not just the inferred type) closes the false negative where an
// unannotated array/object literal slipped through with a `null` type.
const COMPOUND_LITERAL_NODES = new Set([
	AST_NODE.arrayLiteral,
	AST_NODE.objectLiteral,
]);

const describeCompoundLiteral = (expression, type) => {
	if (type) {
		return type;
	}
	return expression.type === AST_NODE.arrayLiteral ? "array" : "object";
};

// Functions are not tracked in `variableTypes` (an identifier that names a
// function resolves to no type), so they are detected through the function
// definitions table instead. Import aliases resolve to the declared name.
const isFunctionIdentifier = (state, expression) => {
	if (expression?.type !== AST_NODE.identifier) {
		return false;
	}
	const name = state.resolveImportedName(expression.name);
	return Object.hasOwn(state.functionDefinitions, name);
};

// Walks the receiver chain of a member/index/call expression looking for a
// `this` root. A chain like `this.inner.city` or `this.inner.sub()` is rooted at
// `this` even though the outermost receiver is not the `thisExpression` itself.
const isRootedAtThis = (expression) => {
	if (expression?.type === AST_NODE.thisExpression) {
		return true;
	}
	if (expression?.type === AST_NODE.memberExpression) {
		return isRootedAtThis(expression.object);
	}
	if (expression?.type === AST_NODE.indexExpression) {
		return isRootedAtThis(expression.object);
	}
	if (expression?.type === AST_NODE.parenthesizedExpression) {
		return isRootedAtThis(expression.expression);
	}
	if (expression?.type === AST_NODE.asExpression) {
		return isRootedAtThis(expression.expression);
	}
	if (expression?.type === AST_NODE.callExpression) {
		return (
			expression.callee?.type === AST_NODE.memberExpression &&
			isRootedAtThis(expression.callee.object)
		);
	}
	return false;
};

// `this.<field>`, `this.<method>()` and their nested chains (`this.inner.city`,
// `this.inner.sub()`) are resolved by the checker context only when the receiver
// is a named object. Inside an object literal (a factory result or a typed
// initializer) the enclosing type lives in `objectLiteralTypeMap`, so this pass
// walks with its own `selfType` stack and delegates to the same receiver
// resolver the method checks use. A bare `this` stays out: it is the object
// itself, not a receiver, and must keep reporting as unconvertible.
const isSelfReceiverExpression = (expression) => {
	if (!expression || expression.type === AST_NODE.thisExpression) {
		return false;
	}
	return isRootedAtThis(expression);
};

const resolveSelfReceiverType = (state, expression, selfTypeStack) => {
	if (!isSelfReceiverExpression(expression)) {
		return null;
	}
	const selfType = currentSelfType(selfTypeStack);
	if (!selfType) {
		return null;
	}
	return resolveReceiverType(
		expression,
		(name, loc) => state.variableTypes.resolve(name, loc),
		state.resolveCallType,
		state.wordSize,
		state.objectTypes,
		{ selfType, ast: state.ast },
	);
};

// Resolve the expression type first: a parameter or local that shadows a
// function name must be classified by its declared type, not by the function
// table. Only when no type is resolvable does the function heuristic apply.
const resolveInterpolatedType = (state, expression, selfTypeStack) => {
	const resolvedType = state.context.resolveCheckExpressionType(expression);
	if (resolvedType) {
		return resolvedType;
	}
	const selfType = resolveSelfReceiverType(state, expression, selfTypeStack);
	if (selfType) {
		return selfType;
	}
	return isFunctionIdentifier(state, expression) ? FUNCTION_TYPE : null;
};

const pushUnconvertibleExpression = (state, expression, type) => {
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.unconvertibleTemplateExpression,
			params: { type },
			location: expression.loc,
		}),
	);
};

const checkTemplateExpression = (state, expression, selfTypeStack) => {
	const type = resolveInterpolatedType(state, expression, selfTypeStack);
	if (COMPOUND_LITERAL_NODES.has(expression?.type)) {
		pushUnconvertibleExpression(
			state,
			expression,
			describeCompoundLiteral(expression, type),
		);
		return;
	}
	if (isConvertibleType(state, type)) {
		return;
	}
	pushUnconvertibleExpression(state, expression, type ?? "unknown");
};

// Rejects interpolated values that have no `String(...)` overload, e.g.
// `${persona}` (an object) or `${peekBufferedByte}` (a function). Without this
// pass the generated C++ fails to compile instead of reporting an e95 error.
export const checkTemplateLiteralExpressions = (state) => {
	const selfTypeStack = [];
	walk(state.ast, {
		enter: (node) => {
			enterObjectLiteralSelfType(state, selfTypeStack, node);
			if (node.type !== AST_NODE.templateLiteral) {
				return;
			}
			for (const expression of node.expressions ?? []) {
				checkTemplateExpression(state, expression, selfTypeStack);
			}
		},
		exit: (node) => {
			exitObjectLiteralSelfType(state, selfTypeStack, node);
		},
	});
};
