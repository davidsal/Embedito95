import { evaluateConstant } from "../const-eval.js";
import { AST_NODE, DATA_TYPE, FLOAT_TYPES, OBJECT_TYPE } from "../constants.js";
import { resolveAssignmentTruncation } from "./expression-assignment.js";
import { resolveExpressionType } from "./expressions.js";
import { canLoseFloatPrecision } from "./numeric-conversions.js";
import { resolveObjectFieldType } from "./object-shapes.js";
import { getNonNullableType, INTEGER_TYPES, TYPE_RANGES } from "./types.js";
import { walk } from "./walk.js";

const isObjectReference = (type, objectTypes) => {
	return type && type !== OBJECT_TYPE && Boolean(objectTypes?.[type]);
};

const isNumericConversionTarget = (type) => {
	return Boolean(type) && (FLOAT_TYPES.has(type) || Boolean(TYPE_RANGES[type]));
};

// Classifies the loss an implicit numeric conversion can cause, so the hover
// can explain it: a narrower float loses precision, a float stored in an
// integer truncates toward zero, and an integer narrowing either keeps its sign
// (range) or cannot represent the source's negative values (sign). A known
// negative constant stored in an unsigned target is a sign loss even when its
// magnitude also exceeds the target range; any other known value that does not
// fit is a range loss.
export const resolveNumericLossReason = (
	rhsType,
	targetType,
	rhsNode = null,
	floatContext = null,
	ast = null,
) => {
	const source = getNonNullableType(rhsType);
	const target = getNonNullableType(targetType);

	if (!source || !target) {
		return null;
	}
	if (FLOAT_TYPES.has(target)) {
		return "precision";
	}
	if (FLOAT_TYPES.has(source) && INTEGER_TYPES.has(target)) {
		return "truncation";
	}
	if (INTEGER_TYPES.has(source) && INTEGER_TYPES.has(target)) {
		const constantValue = ast
			? evaluateConstant(ast, rhsNode, floatContext)
			: null;
		const targetRange = TYPE_RANGES[target];
		const sourceRange = TYPE_RANGES[source];
		const knownConstant =
			typeof constantValue === "number" && Number.isInteger(constantValue);
		const targetUnsigned = targetRange?.min >= 0;

		// A negative constant stored in an unsigned target loses its sign, even
		// when its magnitude also exceeds the target range. A non-negative
		// constant that does not fit is a plain range loss.
		if (knownConstant && targetUnsigned && constantValue < 0) {
			return "sign";
		}
		if (
			knownConstant &&
			targetRange &&
			(constantValue < targetRange.min || constantValue > targetRange.max)
		) {
			return "range";
		}
		if (targetUnsigned && sourceRange?.min < 0) {
			return "sign";
		}
		return "range";
	}
	return null;
};

// An integer constant is stored exactly in `f32` when it survives the float32
// round-trip (`Math.fround`). Without a known value the type-level rule still
// applies, so a wide integer variable keeps warning.
const isIntegerExactlyRepresentableInFloat = (constantValue, targetType) => {
	if (typeof constantValue !== "number" || !Number.isInteger(constantValue)) {
		return false;
	}
	if (targetType === DATA_TYPE.f32) {
		return Math.fround(constantValue) === constantValue;
	}
	return Number.isFinite(constantValue);
};

// `resolveAssignmentTruncation` handles float/integer narrowing and float
// narrowing; a wide integer stored in `f32` loses precision through the same
// existing predicate, so it reuses `canLoseFloatPrecision` instead of a new
// range rule. A known integer constant that is exactly representable in the
// destination float does not lose precision.
const warnsIntegerToFloatPrecision = (
	rhsNode,
	rhsType,
	targetType,
	floatContext,
	ast,
) => {
	const source = getNonNullableType(rhsType);
	const target = getNonNullableType(targetType);

	if (
		!INTEGER_TYPES.has(source) ||
		!FLOAT_TYPES.has(target) ||
		!canLoseFloatPrecision(source, target)
	) {
		return false;
	}
	const constantValue = ast
		? evaluateConstant(ast, rhsNode, floatContext)
		: null;

	if (isIntegerExactlyRepresentableInFloat(constantValue, target)) {
		return false;
	}
	return true;
};

const resolveCastLoss = (rhsNode, rhsType, targetType, floatContext, ast) => {
	const truncates = Boolean(
		resolveAssignmentTruncation(
			rhsNode,
			rhsType,
			targetType,
			floatContext,
			ast,
		),
	);

	return (
		truncates ||
		warnsIntegerToFloatPrecision(
			rhsNode,
			rhsType,
			targetType,
			floatContext,
			ast,
		)
	);
};

const describeCastSource = (node) => {
	if (node?.type === AST_NODE.identifier) {
		return node.name;
	}
	if (node?.type === AST_NODE.memberExpression) {
		const objectName = node.object?.name;
		const propertyName = node.property?.name;

		if (objectName && propertyName) {
			return `${objectName}.${propertyName}`;
		}
	}
	return null;
};

// Object-literal fields go through the same implicit numeric cast as
// declarations and assignments: the checker does not diagnose it and the hover
// explains the loss. Object-typed fields keep their own erasure warning.
const collectFieldObjectCastWarnings = (
	warnings,
	init,
	fields,
	resolveNameType,
	objectTypes,
	wordSize,
	ast,
) => {
	for (const property of init.properties ?? []) {
		const declaredField = fields[property.key];

		if (!declaredField?.type) {
			continue;
		}
		const targetType = declaredField.type;

		if (targetType === OBJECT_TYPE) {
			const rhsType = resolveExpressionType(
				resolveNameType,
				property.value,
				undefined,
				undefined,
				wordSize,
			);

			if (!isObjectReference(rhsType, objectTypes)) {
				continue;
			}

			warnings.push({
				kind: "object",
				name: property.value?.name ?? property.key,
				targetType,
				rhsType,
				targetLocation: property.loc ?? property.value.loc,
				location: property.value.loc ?? property.loc,
			});
			continue;
		}

		if (!isNumericConversionTarget(targetType)) {
			continue;
		}
		const floatContext = FLOAT_TYPES.has(targetType) ? targetType : null;
		const rhsType = resolveExpressionType(
			resolveNameType,
			property.value,
			floatContext,
			undefined,
			wordSize,
			objectTypes,
			ast,
		);

		if (
			!isNumericConversionTarget(rhsType) ||
			!resolveCastLoss(property.value, rhsType, targetType, floatContext, ast)
		) {
			continue;
		}
		warnings.push({
			kind: "objectField",
			name: property.key,
			sourceName: describeCastSource(property.value),
			targetType,
			rhsType,
			reason: resolveNumericLossReason(
				rhsType,
				targetType,
				property.value,
				floatContext,
				ast,
			),
			targetLocation: property.loc ?? property.value.loc,
			location: property.value.loc ?? property.loc,
		});
	}
};

export const collectObjectCastWarnings = (
	ast,
	{ variableTypes, objectTypes, wordSize },
) => {
	const warnings = [];
	const resolveNameType = (name, loc) => variableTypes.resolve(name, loc);

	walk(ast, {
		enter: (node) => {
			if (node.type !== AST_NODE.variableDeclaration) {
				return;
			}

			const declarator = node.declarations?.[0];
			const targetType = declarator?.id?.typeAnnotation?.type;
			const fields = objectTypes?.[targetType]?.fields;
			const init = declarator?.init;

			if (fields && init?.type === AST_NODE.objectLiteral) {
				collectFieldObjectCastWarnings(
					warnings,
					init,
					fields,
					resolveNameType,
					objectTypes,
					wordSize,
					ast,
				);
			}
		},
	});

	return warnings;
};

const resolveAssignmentTargetType = (
	left,
	resolveNameType,
	objectTypes,
	selfType,
) => {
	if (left?.type === AST_NODE.identifier) {
		return {
			name: left.name,
			targetType: resolveNameType(left.name, left.loc),
		};
	}
	if (left?.type === AST_NODE.memberExpression) {
		const propertyName = left.property?.name;

		if (!propertyName) {
			return { name: null, targetType: null };
		}
		if (left.object?.type === AST_NODE.thisExpression) {
			const targetType = selfType
				? resolveObjectFieldType(selfType, propertyName, objectTypes)
				: null;
			return { name: `this.${propertyName}`, targetType };
		}
		const objectName = left.object?.name;

		if (!objectName) {
			return { name: null, targetType: null };
		}
		const objectType = resolveNameType(objectName, left.object.loc);
		const targetType = objectType
			? resolveObjectFieldType(objectType, propertyName, objectTypes)
			: null;
		return { name: `${objectName}.${propertyName}`, targetType };
	}
	return { name: null, targetType: null };
};

const collectDeclarationCastWarnings = (
	warnings,
	node,
	resolveNameType,
	resolveCallType,
	wordSize,
	objectTypes,
	ast,
) => {
	for (const declarator of node.declarations ?? []) {
		const targetType = declarator?.id?.typeAnnotation?.type;
		const init = declarator?.init;

		if (!targetType || !init) {
			continue;
		}
		const floatContext = FLOAT_TYPES.has(targetType) ? targetType : null;
		const rhsType = resolveExpressionType(
			resolveNameType,
			init,
			floatContext,
			resolveCallType,
			wordSize,
			objectTypes,
			ast,
		);
		const truncates = resolveCastLoss(
			init,
			rhsType,
			targetType,
			floatContext,
			ast,
		);

		if (truncates) {
			warnings.push({
				kind: "declaration",
				name: declarator.id?.name ?? null,
				sourceName: describeCastSource(init),
				targetType,
				rhsType,
				reason: resolveNumericLossReason(
					rhsType,
					targetType,
					init,
					floatContext,
					ast,
				),
				targetLocation: declarator.id?.loc ?? init.loc,
				location: init.loc ?? declarator.loc,
			});
		}
	}
};

export const collectAssignmentCastWarnings = (
	ast,
	{ variableTypes, objectTypes, wordSize, resolveCallType },
) => {
	const warnings = [];
	const resolveNameType = (name, loc) => variableTypes.resolve(name, loc);
	const selfTypes = [];

	walk(ast, {
		enter: (node) => {
			if (node.type === AST_NODE.typeDeclaration) {
				selfTypes.push(node.name);
				return;
			}
			if (resolveObjectLiteralSelfType(node)) {
				selfTypes.push(resolveObjectLiteralSelfType(node));
			}
			if (node.type === AST_NODE.variableDeclaration) {
				collectDeclarationCastWarnings(
					warnings,
					node,
					resolveNameType,
					resolveCallType,
					wordSize,
					objectTypes,
					ast,
				);
				return;
			}
			if (
				node.type !== AST_NODE.assignmentExpression ||
				node.operator !== "="
			) {
				return;
			}
			const { name, targetType } = resolveAssignmentTargetType(
				node.left,
				resolveNameType,
				objectTypes,
				selfTypes[selfTypes.length - 1] ?? null,
			);

			if (!targetType) {
				return;
			}
			const floatContext = FLOAT_TYPES.has(targetType) ? targetType : null;
			const rhsType = resolveExpressionType(
				resolveNameType,
				node.right,
				floatContext,
				resolveCallType,
				wordSize,
				objectTypes,
				ast,
			);
			const truncates = resolveCastLoss(
				node.right,
				rhsType,
				targetType,
				floatContext,
				ast,
			);

			if (truncates) {
				warnings.push({
					kind: "assignment",
					name,
					sourceName: describeCastSource(node.right),
					targetType,
					rhsType,
					reason: resolveNumericLossReason(
						rhsType,
						targetType,
						node.right,
						floatContext,
						ast,
					),
					targetLocation: node.left.loc ?? node.loc,
					location: node.right.loc ?? node.loc,
				});
			}
		},
		exit: (node) => {
			if (node.type === AST_NODE.typeDeclaration) {
				selfTypes.pop();
				return;
			}
			if (resolveObjectLiteralSelfType(node)) {
				selfTypes.pop();
			}
		},
	});

	return warnings;
};

const mapMethodParameterTypes = (params) => {
	return (params ?? []).map((parameter) => {
		return parameter?.type ?? parameter ?? null;
	});
};

// A method's parameter list can live on the nominal type (`methods`) or on an
// inferred object-literal field (`fields` with `kind: "method"`); both shapes
// expose `params` as `{ name, type }` entries.
const resolveMethodParameterList = (objectType, methodName, objectTypes) => {
	if (!objectType || !methodName) {
		return null;
	}
	const definition = objectTypes?.[objectType];
	const method = definition?.methods?.[methodName];

	if (method) {
		return mapMethodParameterTypes(method.params);
	}
	const field = definition?.fields?.[methodName];

	if (field?.kind === "method") {
		return mapMethodParameterTypes(field.params);
	}
	return null;
};

const resolveMemberCallParameterList = (
	callee,
	resolveNameType,
	resolveCallType,
	wordSize,
	objectTypes,
	selfType,
) => {
	const receiver = callee.object;

	if (!receiver) {
		return null;
	}
	const receiverType =
		receiver.type === AST_NODE.thisExpression
			? selfType
			: resolveExpressionType(
					resolveNameType,
					receiver,
					null,
					resolveCallType,
					wordSize,
					objectTypes,
				);

	return resolveMethodParameterList(
		receiverType,
		callee.property?.name,
		objectTypes,
	);
};

const resolveCallArgumentTypes = (
	node,
	resolveNameType,
	resolveCallType,
	wordSize,
	objectTypes,
	ast,
) => {
	return (node.arguments ?? []).map((argument) => {
		return resolveExpressionType(
			resolveNameType,
			argument,
			null,
			resolveCallType,
			wordSize,
			objectTypes,
			ast,
		);
	});
};

// The parameter list of a callee is either a plain array (local functions and
// methods, which have one declaration) or a resolver that picks the width from
// the argument types through the same overload inference the checker/codegen
// use.
const resolveNamedParameterList = (
	paramTypesByName,
	calleeName,
	node,
	resolveNameType,
	resolveCallType,
	wordSize,
	objectTypes,
	ast,
) => {
	if (typeof paramTypesByName === "function") {
		const argumentTypes = resolveCallArgumentTypes(
			node,
			resolveNameType,
			resolveCallType,
			wordSize,
			objectTypes,
			ast,
		);

		return paramTypesByName(calleeName, argumentTypes) ?? null;
	}
	return paramTypesByName?.[calleeName] ?? null;
};

const resolveCallParameterList = (
	node,
	resolveNameType,
	resolveCallType,
	wordSize,
	objectTypes,
	selfType,
	paramTypesByName,
	ast,
) => {
	const callee = node.callee;

	if (callee?.type === AST_NODE.identifier) {
		return resolveNamedParameterList(
			paramTypesByName,
			callee.name,
			node,
			resolveNameType,
			resolveCallType,
			wordSize,
			objectTypes,
			ast,
		);
	}
	if (callee?.type === AST_NODE.memberExpression) {
		return resolveMemberCallParameterList(
			callee,
			resolveNameType,
			resolveCallType,
			wordSize,
			objectTypes,
			selfType,
		);
	}
	return null;
};

// An annotated object literal binds `this` to its declared type, so method
// bodies inside it can resolve `this.method(...)` the same way a type
// declaration does. Unannotated literals have no nominal self type.
const resolveObjectLiteralSelfType = (node) => {
	if (node.type !== AST_NODE.variableDeclaration) {
		return null;
	}
	const declarator = node.declarations?.[0];
	const declaredType = declarator?.id?.typeAnnotation?.type;

	if (declarator?.init?.type === AST_NODE.objectLiteral) {
		return declaredType ?? null;
	}
	return null;
};

const collectCallCastWarnings = (
	warnings,
	node,
	paramTypes,
	resolveNameType,
	resolveCallType,
	wordSize,
	objectTypes,
	ast,
) => {
	node.arguments.forEach((argument, index) => {
		const paramType = paramTypes[index];

		if (!isNumericConversionTarget(paramType)) {
			return;
		}
		const floatContext = FLOAT_TYPES.has(paramType) ? paramType : null;
		const argType = resolveExpressionType(
			resolveNameType,
			argument,
			floatContext,
			resolveCallType,
			wordSize,
			objectTypes,
			ast,
		);
		const truncates = resolveCastLoss(
			argument,
			argType,
			paramType,
			floatContext,
			ast,
		);

		if (truncates) {
			warnings.push({
				kind: "argument",
				name: describeCastSource(argument),
				targetType: paramType,
				rhsType: argType,
				reason: resolveNumericLossReason(
					argType,
					paramType,
					argument,
					floatContext,
					ast,
				),
				targetLocation: argument.loc ?? node.loc,
				location: argument.loc ?? node.loc,
			});
		}
	});
};

export const collectArgumentCastWarnings = (
	ast,
	{ variableTypes, paramTypesByName, wordSize, objectTypes, resolveCallType },
) => {
	const warnings = [];
	const resolveNameType = (name, loc) => variableTypes.resolve(name, loc);
	const selfTypes = [];

	walk(ast, {
		enter: (node) => {
			if (node.type === AST_NODE.typeDeclaration) {
				selfTypes.push(node.name);
				return;
			}
			const objectLiteralSelfType = resolveObjectLiteralSelfType(node);

			if (objectLiteralSelfType) {
				selfTypes.push(objectLiteralSelfType);
				return;
			}
			if (node.type !== AST_NODE.callExpression) {
				return;
			}
			const paramTypes = resolveCallParameterList(
				node,
				resolveNameType,
				resolveCallType,
				wordSize,
				objectTypes,
				selfTypes[selfTypes.length - 1] ?? null,
				paramTypesByName,
				ast,
			);

			if (!paramTypes) {
				return;
			}
			collectCallCastWarnings(
				warnings,
				node,
				paramTypes,
				resolveNameType,
				resolveCallType,
				wordSize,
				objectTypes,
				ast,
			);
		},
		exit: (node) => {
			if (node.type === AST_NODE.typeDeclaration) {
				selfTypes.pop();
				return;
			}
			if (resolveObjectLiteralSelfType(node)) {
				selfTypes.pop();
			}
		},
	});

	return warnings;
};
