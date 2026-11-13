import {
	getNonNullableType,
	resolveMethodCallReturnType,
	resolveReceiverType,
} from "../checker/index.js";
import { AST_NODE } from "../constants.js";
import { isFloatType } from "./c-types.js";
import { renderExpression } from "./expression.js";

const FREE_METHOD_RECEIVER_TEMP_PREFIX = "_e95_receiver";

// Derive the temporary from the call site so two nested temporary receivers in
// the same expression do not shadow each other.
const makeFreeMethodReceiverTempName = (node) => {
	const line = node.loc?.start?.line ?? 0;
	const column = node.loc?.start?.column ?? 0;
	return `${FREE_METHOD_RECEIVER_TEMP_PREFIX}_${line}_${column}`;
};

// An argument initializes the parameter, so float literals must use the
// parameter type as their float context.
const resolveArgumentFloatContext = (paramType) => {
	const nonNullType = getNonNullableType(paramType);
	return isFloatType(nonNullType) ? nonNullType : null;
};

const renderArgument = (argument, index, paramTypes, context, lines) => {
	const paramType = paramTypes?.[index];
	const shouldWrap =
		argument?.type === AST_NODE.objectLiteral &&
		paramType &&
		context.isObjectHandle?.(paramType);
	const savedFloatContext = context.floatContext;
	context.floatContext = resolveArgumentFloatContext(paramType);
	const rendered = renderExpression(argument, context, lines);
	context.floatContext = savedFloatContext;
	if (!rendered) {
		return rendered;
	}
	if (shouldWrap) {
		return `${context.toCType(paramType)}(${context.objectStorageCType(paramType)}${rendered})`;
	}
	return rendered;
};

// Renders the call arguments, filling omitted trailing parameters that have a
// default value.
const renderCallArguments = (
	node,
	paramTypes,
	paramDefaults,
	context,
	lines,
) => {
	const args = node.arguments.map((argument, index) => {
		return renderArgument(argument, index, paramTypes, context, lines);
	});
	if (paramDefaults) {
		for (
			let index = node.arguments.length;
			index < paramDefaults.length;
			index++
		) {
			const defaultValue = paramDefaults[index];
			args.push(
				defaultValue ? renderExpression(defaultValue, context, lines) : "0",
			);
		}
	}
	return args.join(", ");
};

const resolveContextReceiverType = (node, context) => {
	return resolveReceiverType(
		node,
		context.resolveNameType,
		context.resolveCallType,
		context.wordSize,
		context.objectTypes,
		{
			selfType: context.selfType ?? null,
			isObjectHandle: context.isObjectHandle,
		},
	);
};

const renderMethodArguments = (node, context, lines) => {
	return node.arguments
		.map((argument, index) => {
			return renderArgument(argument, index, null, context, lines);
		})
		.join(", ");
};

const renderFreeObjectMethodCall = (
	methodName,
	receiverExpression,
	args,
	receiverType,
	context,
) => {
	const namespace = context.importNamespaces?.get(receiverType);
	const prefix = namespace ? `${namespace}::` : "";
	return `${prefix}${methodName}(${[receiverExpression, args].filter(Boolean).join(", ")})`;
};

const resolveLibraryNamespaceObject = (node, context) => {
	if (node?.type !== AST_NODE.identifier) {
		return null;
	}
	const originalName = context.resolveImportedName?.(node.name) ?? node.name;
	if (!context.importNamespaces?.has(originalName)) {
		return null;
	}
	return context.libraryNamespaceObjects?.get(originalName) ?? null;
};

const unwrapParenthesizedReceiver = (node) => {
	return node?.type === AST_NODE.parenthesizedExpression
		? unwrapParenthesizedReceiver(node.expression)
		: node;
};

// A free method binds its handle by reference, so only an lvalue receiver can
// be passed directly. Calls, casts and conditionals with a non-lvalue branch
// produce a temporary.
const isAddressableReceiver = (node) => {
	const receiver = unwrapParenthesizedReceiver(node);
	if (!receiver) {
		return false;
	}
	if (
		receiver.type === AST_NODE.identifier ||
		receiver.type === AST_NODE.thisExpression
	) {
		return true;
	}
	if (
		receiver.type === AST_NODE.memberExpression ||
		receiver.type === AST_NODE.indexExpression
	) {
		return isAddressableReceiver(receiver.object);
	}
	if (receiver.type === AST_NODE.conditionalExpression) {
		return (
			isAddressableReceiver(receiver.consequent) &&
			isAddressableReceiver(receiver.alternate)
		);
	}
	return false;
};

const isTemporaryReceiver = (node) => {
	return !isAddressableReceiver(node);
};

const renderTemporaryReceiverSource = (node, context, lines) => {
	const receiver = unwrapParenthesizedReceiver(node);
	return receiver.type === AST_NODE.asExpression
		? renderExpression(receiver.expression, context, lines)
		: renderExpression(node, context, lines);
};

// A free method takes the handle by reference, so it cannot bind a temporary
// (e.g. the result of `makeCounter(5)`). Bind it to a local first; the copy is a
// handle copy, so it still shares the same storage.
const renderTemporaryFreeMethodCall = (
	node,
	methodName,
	args,
	receiverType,
	context,
	lines,
) => {
	const receiverSource = renderTemporaryReceiverSource(node, context, lines);
	const temporaryName = makeFreeMethodReceiverTempName(node);
	const call = renderFreeObjectMethodCall(
		methodName,
		temporaryName,
		args,
		receiverType,
		context,
	);
	const capture = context.getCurrentFunctionName?.() ? "[&]" : "[]";
	return `(${capture}() { auto ${temporaryName} = ${receiverSource}; return ${call}; })()`;
};

export const renderCallExpression = (node, context, lines) => {
	const calleeName = node.callee?.name;
	const paramTypes = calleeName ? context.libParamTypes?.[calleeName] : null;
	const paramDefaults = calleeName
		? context.libParamDefaults?.[calleeName]
		: null;

	if (node.callee?.type === AST_NODE.identifier && calleeName) {
		const originalName =
			context.resolveImportedName?.(calleeName) ?? calleeName;
		const factoryType = context.closureFactoryTypes?.get(originalName);
		if (factoryType) {
			const args = renderCallArguments(
				node,
				paramTypes,
				paramDefaults,
				context,
				lines,
			);
			const namespace = context.importNamespaces?.get(originalName);
			return `${namespace ? `${namespace}::` : ""}${originalName}(${args})`;
		}
	}

	if (node.callee?.type === AST_NODE.memberExpression) {
		const methodName = node.callee.property?.name;
		const receiverNode = node.callee.object;
		const namespaceObject = resolveLibraryNamespaceObject(
			receiverNode,
			context,
		);
		if (namespaceObject) {
			const args = renderMethodArguments(node, context, lines);
			return `${namespaceObject}::${methodName}(${args})`;
		}
		if (receiverNode?.type === AST_NODE.thisExpression) {
			const args = renderMethodArguments(node, context, lines);
			if (context.isPlainFunction) {
				return `${methodName}(${args})`;
			}
			return `${methodName}(${["self", args].filter(Boolean).join(", ")})`;
		}
		const receiverType = resolveContextReceiverType(receiverNode, context);
		const isObjectMethod = Boolean(
			receiverType &&
				resolveMethodCallReturnType(
					receiverType,
					methodName,
					context.objectTypes,
				),
		);
		if (isObjectMethod) {
			const args = renderMethodArguments(node, context, lines);
			// A shared closure's (or a plain handle type's) methods are free
			// functions over the handle, so `obj.method(args)` becomes
			// `method(obj, args)`; a library-shared closure additionally prefixes
			// the library namespace. A CALLBACK RECORD handle keeps a real member
			// call, but through the handle (`obj->method(args)`); class-form
			// closures use `.`.
			if (context.usesFreeObjectMethods?.(receiverType)) {
				if (isTemporaryReceiver(receiverNode)) {
					return renderTemporaryFreeMethodCall(
						receiverNode,
						methodName,
						args,
						receiverType,
						context,
						lines,
					);
				}
				return renderFreeObjectMethodCall(
					methodName,
					renderExpression(receiverNode, context, lines),
					args,
					receiverType,
					context,
				);
			}
			const receiver = renderExpression(receiverNode, context, lines);
			if (context.isObjectHandle?.(receiverType)) {
				return `${receiver}->${methodName}(${args})`;
			}
			return `${receiver}.${methodName}(${args})`;
		}
	}

	return `${renderExpression(node.callee, context, lines)}(${renderCallArguments(
		node,
		paramTypes,
		paramDefaults,
		context,
		lines,
	)})`;
};
