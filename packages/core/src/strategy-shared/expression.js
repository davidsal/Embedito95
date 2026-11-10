import {
	getNonNullableType,
	isNarrowedAt,
	isNullableType,
	resolveReceiverType,
} from "../checker/index.js";
import { AST_NODE, DATA_TYPE, OBJECT_TYPE } from "../constants.js";
import { renderCondition } from "./condition-render.js";
import { renderCallExpression } from "./expression-call-render.js";
import { formatFloat32Value, formatFloat64Literal } from "./float-format.js";
import { renderObjectLiteral } from "./object-literal-render.js";
import {
	renderBinaryExpression,
	renderGroupedExpression,
	renderLiteral,
	renderTemplateLiteral,
	renderUnaryExpression,
} from "./render-delegates.js";
import {
	expressionDataType,
	makeThisFieldResolver,
	makeThisMethodResolver,
} from "./type-resolve.js";

const EXPONENT_TEXT_PATTERN = /[eE]/;

const renderMemberProperty = (node, context, lines) => {
	if (node?.type === AST_NODE.identifier) {
		return node.name;
	}
	return renderExpression(node, context, lines);
};

export const resolveMemberReceiverType = (node, context) => {
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

const isObjectHandleReceiver = (node, context) => {
	const receiverType = resolveMemberReceiverType(node, context);
	return Boolean(receiverType && context.isObjectHandle?.(receiverType));
};

export const renderFoldedValue = (value, variableType, float64Software) => {
	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}
	if (typeof value === "string") {
		return JSON.stringify(value);
	}
	if (typeof value !== "number") {
		return String(value);
	}
	if (variableType === DATA_TYPE.f32) {
		return Number.isInteger(value)
			? `${String(value)}.0f`
			: `${formatFloat32Value(value)}f`;
	}
	if (variableType === DATA_TYPE.f64) {
		if (float64Software) {
			return formatFloat64Literal(value, true);
		}
		const text = String(value);
		return Number.isInteger(value) && !EXPONENT_TEXT_PATTERN.test(text)
			? `${text}.0`
			: formatFloat64Literal(value, false);
	}
	return String(value);
};

// Renders `Enum.MEMBER` for a local enum (`Enum::MEMBER`) or an imported one
// (resolved to its library symbol when the platform maps it, else
// `namespace::Enum::MEMBER`).
const renderEnumMemberAccess = (node, context, lines) => {
	const receiver = renderExpression(node.object, context, lines);
	const propertyName = renderMemberProperty(node.property, context, lines);
	if (!context.importNamespaces?.has(node.object.name)) {
		return `${receiver}::${propertyName}`;
	}
	const importedEnumName =
		context.resolveImportedName?.(node.object.name) ?? node.object.name;
	const importedSymbol = context.resolveLibraryEnumMember?.(
		importedEnumName,
		propertyName,
	);
	return importedSymbol ?? `${receiver}::${propertyName}`;
};

const renderMemberChain = (node, context, lines) => {
	if (node.object?.type === AST_NODE.thisExpression) {
		const propertyName = renderMemberProperty(node.property, context, lines);
		if (context.isPlainFunction) {
			return propertyName;
		}
		if (context.isHandleMethod) {
			return `self->${propertyName}`;
		}
		return `self.${propertyName}`;
	}
	if (
		node.object?.type === AST_NODE.identifier &&
		context.enumNames?.has(node.object.name)
	) {
		return renderEnumMemberAccess(node, context, lines);
	}
	const renderedReceiver = renderExpression(node.object, context, lines);
	const propertyName = renderMemberProperty(node.property, context, lines);
	if (
		node.object?.type === AST_NODE.identifier &&
		context.resolveLibraryEnumMember
	) {
		const moduleName =
			context.resolveImportedName?.(node.object.name) ?? node.object.name;
		const symbol = context.resolveLibraryEnumMember(moduleName, propertyName);
		if (symbol != null) {
			return symbol;
		}
	}
	const receiver = isOptionalMemberExpression(node.object, context)
		? `${renderedReceiver}.value`
		: renderedReceiver;
	if (isObjectHandleReceiver(node.object, context)) {
		return `${receiver}->${propertyName}`;
	}
	return `${receiver}.${propertyName}`;
};

// An optional object field is stored as `nullable<T>` but its declared type is
// the bare `T` (the `?` lives in the field's `optional` flag), so
// `expressionDataType` alone cannot tell us the rendered value is wrapped.
const isOptionalMemberExpression = (node, context) => {
	if (node?.type !== AST_NODE.memberExpression) {
		return false;
	}
	const receiverType = resolveMemberReceiverType(node.object, context);
	if (!receiverType) {
		return false;
	}
	const field =
		context.objectTypes?.[receiverType]?.fields?.[node.property?.name];
	return Boolean(field?.optional);
};

// `value as T` where `T` is a shared object handle: the storage pointer cast
// used by the async runtime to mutate type-erased task data in place.
export const isObjectHandleCast = (node, context) => {
	return (
		node?.type === AST_NODE.asExpression &&
		Boolean(context.isObjectHandle?.(node.targetType?.name))
	);
};

// `value as T` for a shared object handle `T` yields a pointer to the storage
// struct (`T*`) rather than the handle: the async runtime stores task data
// type-erased as a `core_mem::AnyObject` and each handler reinterprets its
// storage pointer to mutate the shared fields in place. Primitive casts keep
// their value semantics.
const renderAsExpression = (node, context, lines) => {
	const targetName = node.targetType.name;
	const rendered = renderGroupedExpression(node.expression, context, lines);

	const sourceType = expressionDataType(
		node.expression,
		context.resolveNameType,
		context.ast,
		context.floatContext,
		context.resolveCallType,
		context.wordSize,
		makeThisFieldResolver(context),
		context.narrowingRegions,
		makeThisMethodResolver(context),
		context.objectTypes,
	);
	const sourceIsNullable =
		isNullableType(sourceType) ||
		isOptionalMemberExpression(node.expression, context);
	const value =
		sourceIsNullable && !rendered.endsWith(".value")
			? `${rendered}.value`
			: rendered;

	if (!isObjectHandleCast(node, context)) {
		return `(${context.toCType(targetName)})(${value})`;
	}

	const storageValue =
		getNonNullableType(sourceType) === OBJECT_TYPE
			? `${value}.pointer()`
			: value;
	return `(${context.objectStorageCType(targetName)}*)(${storageValue})`;
};

export const renderExpression = (node, context, lines) => {
	switch (node?.type) {
		case AST_NODE.identifier: {
			const originalName =
				context.resolveImportedName?.(node.name) ?? node.name;
			if (
				context.narrowingRegions &&
				isNarrowedAt(node.name, node.loc, context.narrowingRegions)
			) {
				const declaredType = context.resolveNameType?.(node.name, node.loc);
				if (declaredType && isNullableType(declaredType)) {
					return `${originalName}.value`;
				}
			}
			const namespace = context.importNamespaces?.get(originalName);
			if (namespace) {
				return `${namespace}::${originalName}`;
			}
			return originalName;
		}
		case AST_NODE.literal:
			return renderLiteral(node, context);
		case AST_NODE.templateLiteral:
			return renderTemplateLiteral(node, context, lines);
		case AST_NODE.arrayLiteral:
			return `{ ${node.elements.map((element) => renderExpression(element, context, lines)).join(", ")} }`;
		case AST_NODE.objectLiteral:
			return renderObjectLiteral(node, context, lines);
		case AST_NODE.memberExpression:
			return renderMemberChain(node, context, lines);
		case AST_NODE.thisExpression:
			return "self";
		case AST_NODE.indexExpression:
			return `${renderExpression(node.object, context, lines)}[${renderExpression(node.index, context, lines)}]`;
		case AST_NODE.callExpression:
			return renderCallExpression(node, context, lines);
		case AST_NODE.parenthesizedExpression:
			return `(${renderGroupedExpression(node.expression, context, lines)})`;
		case AST_NODE.asExpression:
			return renderAsExpression(node, context, lines);
		case AST_NODE.unaryExpression:
			return renderUnaryExpression(node, context, lines);
		case AST_NODE.awaitExpression:
			return renderExpression(node.argument, context, lines);
		case AST_NODE.updateExpression:
			return node.prefix
				? `${node.operator}${renderExpression(node.argument, context, lines)}`
				: `${renderExpression(node.argument, context, lines)}${node.operator}`;
		case AST_NODE.binaryExpression:
			return renderBinaryExpression(node, context, lines);
		case AST_NODE.conditionalExpression:
			return `${renderCondition(node.test, context, lines)} ? ${renderExpression(node.consequent, context, lines)} : ${renderExpression(node.alternate, context, lines)}`;
		case AST_NODE.assignmentExpression:
			return `${renderExpression(node.left, context, lines)} ${node.operator} ${renderExpression(node.right, context, lines)}`;
		default:
			return "";
	}
};
