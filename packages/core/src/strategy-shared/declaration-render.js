import {
	decodeObjectShape,
	isNarrowedAt,
	isNullableType,
	isNullLiteralNode,
	isObjectShapeType,
	parseArrayType,
	resolveVariableType,
} from "../checker/index.js";
import { evaluateConstant } from "../const-eval.js";
import {
	AST_NODE,
	CONST_KIND,
	DATA_TYPE,
	UNRESOLVED_TYPE,
} from "../constants.js";
import { isFloatType } from "./c-types.js";
import { storageCast } from "./cast.js";
import {
	renderArrayDeclaration,
	resolveArrayElementType,
} from "./collections.js";
import {
	isObjectHandleCast,
	renderExpression,
	renderFoldedValue,
	resolveMemberReceiverType,
} from "./expression.js";
import { formatFloat64Literal } from "./float-format.js";
import { renderTypedObjectLiteral } from "./object-literal-render.js";
import {
	renderOptionalNull,
	renderOptionalWrap,
	resolveOptionalEntry,
} from "./optional-value.js";
import { renderGroupedExpression } from "./render-delegates.js";
import {
	expressionDataType,
	makeThisFieldResolver,
	makeThisMethodResolver,
} from "./type-resolve.js";

const renderDefaultInitializer = (variableType, context) => {
	if (variableType === DATA_TYPE.f64 && context.float64Software) {
		return formatFloat64Literal(0, true);
	}
	return "0";
};

const resolveObjectAssignmentHandleTarget = (
	targetType,
	leftIsIdentifier,
	node,
	context,
) => {
	if (context.isObjectHandle?.(targetType)) {
		return targetType;
	}
	if (leftIsIdentifier || node.operator !== "=") {
		return null;
	}
	const memberType = resolveMemberReceiverType(node.left, context);
	if (memberType && context.isObjectHandle?.(memberType)) {
		return memberType;
	}
	return null;
};

const renderNullableStoredValue = (
	targetType,
	initNode,
	rhsType,
	stored,
	context,
) => {
	const wrapsNonNullValue =
		isNullableType(targetType) &&
		initNode &&
		!isNullLiteralNode(initNode) &&
		rhsType &&
		!isNullableType(rhsType);
	return wrapsNonNullValue
		? renderOptionalWrap(
				resolveOptionalEntry(targetType, context),
				stored,
				context.float64Software,
			)
		: null;
};

export const renderVariableDeclaration = (node, context, lines) => {
	const declaration = node.declarations?.[0];
	const name = declaration?.id?.name;
	const annotation = declaration?.id?.typeAnnotation?.type;
	const init = declaration?.init;
	const annotationArray = parseArrayType(annotation);
	if (annotationArray || init?.type === AST_NODE.arrayLiteral) {
		const arrayInfo = annotationArray ?? {
			elementType: resolveArrayElementType(
				annotation,
				init,
				context,
				node.kind === "let",
			),
			capacity: null,
		};
		renderArrayDeclaration(declaration, arrayInfo, context, lines);
		return;
	}

	const resolvedType = resolveVariableType(
		context.ast,
		node,
		context.wordType,
		context.resolveNameType,
		context.resolveCallType,
		context.wordSize,
		context.objectTypes,
	);
	const memberEnum =
		resolvedType === UNRESOLVED_TYPE &&
		declaration?.init?.type === AST_NODE.memberExpression
			? context.libEnumMemberToType?.[declaration.init.property?.name]
			: null;
	const variableType = memberEnum ?? resolvedType;
	const isHandleCast = isObjectHandleCast(declaration?.init, context);
	const cType = isHandleCast
		? `${context.objectStorageCType(variableType)}*`
		: context.toCType(variableType);
	const isObjectType =
		Boolean(context.objectTypes?.[variableType]) ||
		Boolean(context.isObjectHandle?.(variableType));
	const isHandleType = isObjectType || variableType === DATA_TYPE.string;
	const kindPrefix = node.kind === CONST_KIND && !isHandleType ? "const " : "";
	const floatContext = isFloatType(variableType) ? variableType : null;
	context.floatContext = floatContext;
	const foldedValue =
		declaration?.init &&
		declaration.init.type !== AST_NODE.literal &&
		declaration.init.type !== AST_NODE.functionExpression
			? evaluateConstant(context.ast, declaration.init, floatContext)
			: null;
	const rhsType = declaration?.init
		? expressionDataType(
				declaration.init,
				context.resolveNameType,
				context.ast,
				context.floatContext,
				context.resolveCallType,
				context.wordSize,
				makeThisFieldResolver(context),
				context.narrowingRegions,
				makeThisMethodResolver(context),
				context.objectTypes,
			)
		: null;
	const nullInit =
		isNullLiteralNode(declaration?.init) && isNullableType(variableType)
			? renderOptionalNull(
					resolveOptionalEntry(variableType, context),
					context.float64Software,
				)
			: null;
	const objectStorageFields = isObjectShapeType(variableType)
		? (decodeObjectShape(variableType) ?? null)
		: (context.objectTypes?.[variableType]?.fields ?? null);
	const typedObjectLiteralInit =
		declaration?.init?.type === AST_NODE.objectLiteral && objectStorageFields
			? renderTypedObjectLiteral(declaration.init, variableType, context, lines)
			: null;
	const renderedInit =
		nullInit ??
		(typedObjectLiteralInit !== null
			? typedObjectLiteralInit
			: declaration?.init
				? foldedValue !== null
					? renderFoldedValue(
							foldedValue,
							variableType,
							context.float64Software,
						)
					: renderGroupedExpression(declaration.init, context, lines)
				: renderDefaultInitializer(variableType, context));
	const handleWrappedInit =
		typedObjectLiteralInit !== null && context.isObjectHandle?.(variableType)
			? `${context.toCType(variableType)}(${context.objectStorageCType(variableType)}${typedObjectLiteralInit})`
			: renderedInit;
	const storedInit =
		declaration?.init?.type === AST_NODE.literal || foldedValue !== null
			? handleWrappedInit
			: storageCast(
					handleWrappedInit,
					variableType,
					rhsType,
					context.wordCType,
					context.toCType,
				);
	const nullableStoredInit = renderNullableStoredValue(
		variableType,
		declaration?.init,
		rhsType,
		storedInit,
		context,
	);
	lines.push(
		`${kindPrefix}${cType} ${name} = ${nullableStoredInit ?? storedInit};`,
	);
};

export const renderForInit = (node, context, lines) => {
	if (node.type === AST_NODE.assignmentExpression) {
		return renderAssignmentExpression(node, context, lines);
	}
	if (node.type === AST_NODE.variableDeclaration) {
		const declaration = node.declarations?.[0];
		const resolvedType = resolveVariableType(
			context.ast,
			node,
			context.wordType,
			context.resolveNameType,
			context.resolveCallType,
			context.wordSize,
			context.objectTypes,
		);
		const memberEnum =
			resolvedType === UNRESOLVED_TYPE &&
			declaration?.init?.type === AST_NODE.memberExpression
				? context.libEnumMemberToType?.[declaration.init.property?.name]
				: null;
		const variableType = memberEnum ?? resolvedType;
		const renderedInit = declaration?.init
			? renderGroupedExpression(declaration.init, context, lines)
			: renderDefaultInitializer(variableType, context);
		const rhsType = declaration?.init
			? expressionDataType(
					declaration.init,
					context.resolveNameType,
					context.ast,
					context.floatContext,
					context.resolveCallType,
					context.wordSize,
					makeThisFieldResolver(context),
					context.narrowingRegions,
					makeThisMethodResolver(context),
					context.objectTypes,
				)
			: null;
		const nullableInit = renderNullableStoredValue(
			variableType,
			declaration?.init,
			rhsType,
			renderedInit,
			context,
		);
		return `${context.toCType(variableType)} ${declaration?.id?.name} = ${nullableInit ?? renderedInit}`;
	}
	return renderExpression(node, context, lines);
};

// Resolves the declared type of an assignment target when it is nullable: an
// identifier whose type is nullable, or an optional object field (stored as
// `nullable<T>`). Lets `x = null` / `obj.field = null` emit the correctly typed
// `nullable<T>{ true, zero }` instead of the generic null literal.
const resolveNullableTargetType = (node, context) => {
	if (node?.type === AST_NODE.identifier) {
		const type = context.resolveNameType?.(node.name, node.loc) ?? null;
		return isNullableType(type) ? type : null;
	}
	if (node?.type === AST_NODE.memberExpression) {
		const receiverType =
			node.object?.type === AST_NODE.thisExpression
				? context.selfType
				: resolveMemberReceiverType(node.object, context);
		const field =
			context.objectTypes?.[receiverType]?.fields?.[node.property?.name];
		return field?.optional ? field.type : null;
	}
	return null;
};

// Wraps/unwraps the RHS of `target = value` when the target is nullable: a null
// RHS becomes `nullable<T>{ true, zero }`, a non-null value into a nullable
// target becomes `nullable<T>{ false, value }`.
const renderNullableAssignmentValue = (node, stored, rhsType, context) => {
	if (node.operator !== "=") {
		return null;
	}
	const targetType = resolveNullableTargetType(node.left, context);
	if (!targetType) {
		return null;
	}
	const entry = resolveOptionalEntry(targetType, context);
	if (isNullLiteralNode(node.right)) {
		return renderOptionalNull(entry, context.float64Software);
	}
	if (!rhsType || isNullableType(rhsType)) {
		return null;
	}
	return renderOptionalWrap(entry, stored, context.float64Software);
};

// Renders `target <op> value` using the declared type of the target. A plain
// `=` on a narrowed nullable must assign through the declared `nullable<T>`
// name (the RHS is wrapped by renderNullableAssignmentValue); only compound
// operators read the narrowed `.value`. Reused by expression statements and by
// the for init/update clauses so neither emits `<name>.value = nullable<T>{…}`.
export const renderAssignmentExpression = (node, context, lines) => {
	const leftIsIdentifier = node.left?.type === AST_NODE.identifier;
	const thisFieldType =
		node.left?.type === AST_NODE.memberExpression &&
		node.left.object?.type === AST_NODE.thisExpression
			? (context.objectTypes?.[context.selfType]?.fields?.[
					node.left.property?.name
				]?.type ?? null)
			: null;
	const targetName = leftIsIdentifier ? node.left?.name : null;
	const targetType = targetName
		? (context.resolveNameType(targetName) ?? null)
		: thisFieldType;
	context.floatContext = isFloatType(targetType) ? targetType : null;
	const isLiteral = node.right?.type === AST_NODE.literal;
	const rhsType = expressionDataType(
		node.right,
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
	const renderedLeft = leftIsIdentifier
		? node.operator !== "=" &&
			isNarrowedAt(node.left.name, node.left.loc, context.narrowingRegions) &&
			isNullableType(targetType)
			? `${targetName}.value`
			: targetName
		: renderExpression(node.left, context, lines);
	const rendered = renderGroupedExpression(node.right, context, lines);
	const handleTargetType = resolveObjectAssignmentHandleTarget(
		targetType,
		leftIsIdentifier,
		node,
		context,
	);
	const objectLiteralInit =
		node.right?.type === AST_NODE.objectLiteral &&
		node.operator === "=" &&
		handleTargetType
			? `${context.toCType(handleTargetType)}(${context.objectStorageCType(handleTargetType)}${rendered})`
			: null;
	const stored =
		isLiteral || objectLiteralInit
			? (objectLiteralInit ?? rendered)
			: storageCast(
					rendered,
					targetType,
					rhsType,
					context.wordCType,
					context.toCType,
				);
	const nullableStored = renderNullableAssignmentValue(
		node,
		stored,
		rhsType,
		context,
	);
	return `${renderedLeft} ${node.operator} ${nullableStored ?? stored}`;
};

export const renderExpressionStatement = (node, context, lines) => {
	if (node.type === AST_NODE.assignmentExpression) {
		lines.push(`${renderAssignmentExpression(node, context, lines)};`);
		return;
	}
	const rendered = renderExpression(node, context, lines);
	lines.push(`${rendered};`);
};
