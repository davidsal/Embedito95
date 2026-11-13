import { AST_NODE, DATA_TYPE, DATA_TYPES, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { checkMethodArgument } from "./arguments.js";
import { resolveArrayMethod } from "./array-methods.js";
import { parseArrayType } from "./arrays.js";
import { checkCallbackSignatureArgument } from "./callback-argument-checks.js";
import { getDeclaration } from "./declaration-accessors.js";
import { resolveReceiverType } from "./expressions.js";
import { endsWithReturn } from "./statement-flow.js";
import { resolveStringMethod } from "./string-methods.js";
import { typeIsKnown } from "./type-resolution.js";
import { NULL_TYPE, unwrapParentheses } from "./types.js";
import { walk } from "./walk.js";

const isPostInstallPlaceholderType = (name) => {
	return name.includes("e95.postinstall");
};

const annotationTypeNames = (annotation) => {
	if (!annotation.members) {
		return annotation ? [annotation.type] : [];
	}
	return annotation.members.map((member) => member.name);
};

const hasUnknownAnnotationType = (state, annotation) => {
	for (const typeName of annotationTypeNames(annotation)) {
		if (
			typeName !== NULL_TYPE &&
			!isPostInstallPlaceholderType(typeName) &&
			!typeIsKnown(
				typeName,
				state.enumTypes,
				state.libEnumTypeNames,
				state.libNameToType,
				state.objectTypeNames,
			)
		) {
			return true;
		}
	}
	return false;
};

const UNKNOWN_RECEIVER_LABEL = "?";
const UNKNOWN_TYPE_LABEL = "?";

const describeReceiver = (node) => {
	if (!node) {
		return UNKNOWN_RECEIVER_LABEL;
	}
	if (node.type === AST_NODE.identifier) {
		return node.name;
	}
	if (node.type === AST_NODE.thisExpression) {
		return "this";
	}
	if (node.type === AST_NODE.memberExpression) {
		return `${describeReceiver(node.object)}.${node.property?.name ?? UNKNOWN_RECEIVER_LABEL}`;
	}
	if (node.type === AST_NODE.callExpression) {
		return `${describeReceiver(node.callee)}()`;
	}
	if (node.type === AST_NODE.parenthesizedExpression) {
		return `(${describeReceiver(node.expression)})`;
	}
	if (node.type === AST_NODE.asExpression) {
		return `${describeReceiver(node.expression)} as ${node.targetType?.name ?? UNKNOWN_RECEIVER_LABEL}`;
	}
	if (node.type === AST_NODE.indexExpression) {
		return `${describeReceiver(node.object)}[...]`;
	}
	if (node.type === AST_NODE.conditionalExpression) {
		return `(${describeReceiver(node.test)} ? ${describeReceiver(node.consequent)} : ${describeReceiver(node.alternate)})`;
	}
	return node.type;
};

const resolveReceiverNameType = (state, name, loc) => {
	const variableType = state.variableTypes.resolve(name, loc);
	return variableType ?? state.libNameToType?.[name] ?? null;
};

const resolveMethodReceiverType = (state, node, selfType) => {
	return resolveReceiverType(
		node.callee.object,
		(name, loc) => resolveReceiverNameType(state, name, loc),
		state.resolveCallType,
		state.wordSize,
		state.objectTypes,
		{ selfType },
	);
};

const resolveCastReceiver = (state, node, selfType) => {
	const receiver = unwrapParentheses(node.callee.object);
	if (receiver?.type !== AST_NODE.asExpression) {
		return null;
	}
	return {
		node: receiver,
		targetType: receiver.targetType?.name ?? null,
		sourceType: resolveReceiverType(
			receiver.expression,
			(name, loc) => state.variableTypes.resolve(name, loc),
			state.resolveCallType,
			state.wordSize,
			state.objectTypes,
			{ selfType },
		),
	};
};

// The checker must resolve `this.<field>` with the type that encloses the call,
// just like the codegen does with `context.selfType`. `objectLiteralTypeMap`
// already knows the type of each typed literal (a factory return or a typed
// variable initializer); this stack carries the innermost one through the walk.
const currentSelfType = (selfTypeStack) => {
	return selfTypeStack[selfTypeStack.length - 1] ?? null;
};

const enterObjectLiteralSelfType = (state, selfTypeStack, node) => {
	if (node.type !== AST_NODE.objectLiteral) {
		return;
	}
	const typeName = state.objectLiteralTypeMap.get(node);
	if (typeName) {
		selfTypeStack.push(typeName);
	}
};

const exitObjectLiteralSelfType = (state, selfTypeStack, node) => {
	if (node.type !== AST_NODE.objectLiteral) {
		return;
	}
	const typeName = state.objectLiteralTypeMap.get(node);
	if (typeName) {
		selfTypeStack.pop();
	}
};

// A cast used as a receiver only tells the checker which handle type the call
// targets; the codegen binds the source expression directly (a declared cast
// would be a different representation). So the source must already have the
// target type, and the target must be a handle type the checker knows. Otherwise
// the checker would accept a call the codegen cannot emit.
const castReceiverIsInvalid = (state, castReceiver) => {
	if (!castReceiver.targetType) {
		return true;
	}
	if (!state.objectTypes[castReceiver.targetType]) {
		return true;
	}
	return (
		!castReceiver.sourceType ||
		castReceiver.sourceType !== castReceiver.targetType
	);
};

const pushInvalidCastReceiver = (state, castReceiver, node) => {
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.invalidReceiverCast,
			params: {
				source: castReceiver.sourceType ?? UNKNOWN_TYPE_LABEL,
				target: castReceiver.targetType ?? UNKNOWN_TYPE_LABEL,
			},
			location: castReceiver.node.loc ?? node.callee.loc ?? node.loc,
		}),
	);
};

const pushUndefinedMethod = (
	state,
	receiverLabel,
	methodName,
	typeName,
	node,
) => {
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.undefinedMethod,
			params: {
				name: `${receiverLabel}.${methodName}`,
				typeName,
			},
			location: node.callee.property?.loc ?? node.callee.loc ?? node.loc,
		}),
	);
};

const validateResolvedMethod = (
	state,
	method,
	receiverLabel,
	methodName,
	node,
) => {
	if (method.params.length !== node.arguments.length) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.wrongArgumentCount,
				params: {
					name: `${receiverLabel}.${methodName}`,
					expected: method.params.length,
					got: node.arguments.length,
				},
				location: node.callee.loc ?? node.loc,
			}),
		);
	}

	for (let index = 0; index < node.arguments.length; index++) {
		const argument = unwrapParentheses(node.arguments[index]);
		checkCallbackSignatureArgument(state, argument, method.params[index]);
		checkMethodArgument(
			argument,
			method.params[index],
			state.errors,
			state.context.resolveVariableTypeAt,
			state.libEnumMembersByType,
			state.libEnumTypeNames,
			state.context.resolveMethodArgumentType,
		);
	}
};

const validateArrayLikeMethod = (
	state,
	objectType,
	elementType,
	methodName,
	node,
) => {
	if (resolveArrayMethod(methodName, elementType)) {
		return;
	}
	pushUndefinedMethod(
		state,
		describeReceiver(node.callee.object),
		methodName,
		objectType,
		node,
	);
};

const validateStringMethod = (state, methodName, node) => {
	const receiverLabel = describeReceiver(node.callee.object);
	const method = resolveStringMethod(methodName);
	if (!method) {
		pushUndefinedMethod(
			state,
			receiverLabel,
			methodName,
			DATA_TYPE.string,
			node,
		);
		return;
	}
	validateResolvedMethod(state, method, receiverLabel, methodName, node);
};

const validateNonObjectReceiver = (state, objectType, methodName, node) => {
	const arrayType = parseArrayType(objectType);
	if (arrayType) {
		validateArrayLikeMethod(
			state,
			objectType,
			arrayType.elementType,
			methodName,
			node,
		);
		return;
	}
	if (objectType === DATA_TYPE.string) {
		validateStringMethod(state, methodName, node);
		return;
	}
	if (
		typeIsKnown(
			objectType,
			state.enumTypes,
			state.libEnumTypeNames,
			state.libNameToType,
			state.objectTypeNames,
		)
	) {
		pushUndefinedMethod(
			state,
			describeReceiver(node.callee.object),
			methodName,
			objectType,
			node,
		);
	}
};

export const checkMethodCalls = (state) => {
	const selfTypeStack = [];
	walk(state.ast, {
		enter: (node) => {
			enterObjectLiteralSelfType(state, selfTypeStack, node);
			if (
				node.type === AST_NODE.callExpression &&
				node.callee?.type === AST_NODE.memberExpression
			) {
				const methodName = node.callee.property?.name;

				if (!methodName) {
					return;
				}

				const selfType = currentSelfType(selfTypeStack);
				const castReceiver = resolveCastReceiver(state, node, selfType);
				if (castReceiver) {
					if (castReceiverIsInvalid(state, castReceiver)) {
						pushInvalidCastReceiver(state, castReceiver, node);
						return;
					}
				}

				const objectType = resolveMethodReceiverType(state, node, selfType);
				const typeDefinition = objectType
					? state.objectTypes[objectType]
					: null;
				const method = typeDefinition?.methods?.[methodName];
				const receiverLabel = describeReceiver(node.callee.object);

				if (!typeDefinition) {
					if (objectType) {
						validateNonObjectReceiver(state, objectType, methodName, node);
					}
					return;
				}

				if (!method) {
					pushUndefinedMethod(
						state,
						receiverLabel,
						methodName,
						objectType,
						node,
					);
					return;
				}

				validateResolvedMethod(state, method, receiverLabel, methodName, node);
			}
		},
		exit: (node) => {
			exitObjectLiteralSelfType(state, selfTypeStack, node);
		},
	});
};

export const checkAnnotationsAndReturns = (state) => {
	walk(state.ast, {
		enter: (node) => {
			if (node.type === AST_NODE.variableDeclaration) {
				const declaration = getDeclaration(node);
				const annotation = declaration?.id?.typeAnnotation;

				if (annotation && hasUnknownAnnotationType(state, annotation)) {
					state.errors.push(
						makeDiagnostic({
							code: ERROR_CODE.unknownType,
							params: { type: annotation.type },
							location: annotation.loc,
						}),
					);
				}

				if (
					annotation &&
					!state.isLibrary &&
					state.platformTypes &&
					DATA_TYPES.has(annotation.type) &&
					!state.platformTypes.has(annotation.type)
				) {
					state.errors.push(
						makeDiagnostic({
							code: ERROR_CODE.unsupportedType,
							params: { type: annotation.type },
							location: annotation.loc,
						}),
					);
				}
			}

			if (node.type === AST_NODE.functionExpression) {
				checkFunctionExpressionAnnotations(state, node);
			}

			if (node.type === AST_NODE.typeDeclaration) {
				checkTypeMemberAnnotations(state, node);
			}
		},
	});
};

const isKnownAnnotationType = (state, typeName) => {
	if (typeName === NULL_TYPE || isPostInstallPlaceholderType(typeName)) {
		return true;
	}
	return typeIsKnown(
		typeName,
		state.enumTypes,
		state.libEnumTypeNames,
		state.libNameToType,
		state.objectTypeNames,
	);
};

const checkAnnotationType = (state, annotation) => {
	if (!annotation?.type) {
		return;
	}
	if (annotation.functionType) {
		checkFunctionTypeAnnotationTypes(state, annotation.functionType);
		return;
	}
	if (annotation.members) {
		for (const member of annotation.members) {
			if (!isKnownAnnotationType(state, member.name)) {
				state.errors.push(
					makeDiagnostic({
						code: ERROR_CODE.unknownType,
						params: { type: member.name },
						location: member.loc,
					}),
				);
			}
		}
		return;
	}
	if (!state.isLibrary && !isKnownAnnotationType(state, annotation.type)) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.unknownType,
				params: { type: annotation.type },
				location: annotation.loc,
			}),
		);
	}
};

const checkFunctionTypeAnnotationTypes = (state, functionType) => {
	for (const param of functionType.params ?? []) {
		checkParameterAnnotation(state, param);
	}
	checkAnnotationType(state, functionType.returnTypeAnnotation);
};

const checkParameterAnnotation = (state, param) => {
	if (!param.typeAnnotation) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.missingTypeAnnotation,
				params: { name: param.name },
				location: param.loc,
			}),
		);
		return;
	}
	checkAnnotationType(state, param.typeAnnotation);
};

const checkFunctionParameterAnnotations = (state, node) => {
	for (const param of node.params) {
		checkParameterAnnotation(state, param);
	}
};

const checkTypeMemberAnnotations = (state, node) => {
	for (const member of node.members ?? []) {
		if (member.kind !== "method") {
			continue;
		}
		for (const param of member.params ?? []) {
			checkParameterAnnotation(state, param);
		}
	}
};

const checkFunctionExpressionAnnotations = (state, node) => {
	checkFunctionParameterAnnotations(state, node);

	if (
		node.returnType &&
		!(state.isLibrary && node.body.body.length === 0) &&
		!node.body.body.some(
			(statement) => statement.type === AST_NODE.returnStatement,
		)
	) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.missingReturnStatement,
				params: { type: node.returnType.name },
				location: node.returnType.loc,
			}),
		);
	}

	const methodReturnType = state.objectMethodReturnTypes.get(node);

	if (
		methodReturnType?.returnType &&
		methodReturnType.returnType !== DATA_TYPE.void &&
		!(state.isLibrary && node.body.body.length === 0) &&
		!endsWithReturn(node.body.body[node.body.body.length - 1])
	) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.missingReturnStatement,
				params: { type: methodReturnType.returnType },
				location: node.loc,
			}),
		);
	}
};
