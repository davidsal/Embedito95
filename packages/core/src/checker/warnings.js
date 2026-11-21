import { AST_NODE, FLOAT_TYPES, OBJECT_TYPE } from "../constants.js";
import { resolveAssignmentTruncation } from "./expression-assignment.js";
import { resolveExpressionType } from "./expressions.js";
import { resolveObjectFieldType } from "./object-shapes.js";
import { getNonNullableType, INTEGER_TYPES, TYPE_RANGES } from "./types.js";
import { walk } from "./walk.js";

const isObjectReference = (type, objectTypes) => {
	return type && type !== OBJECT_TYPE && Boolean(objectTypes?.[type]);
};

const isFloatToInteger = (valueType, targetType) => {
	return (
		Boolean(valueType) &&
		Boolean(targetType) &&
		FLOAT_TYPES.has(getNonNullableType(valueType)) &&
		INTEGER_TYPES.has(getNonNullableType(targetType))
	);
};

const collectFieldObjectCastWarnings = (
	warnings,
	init,
	fields,
	resolveNameType,
	objectTypes,
	wordSize,
) => {
	for (const property of init.properties ?? []) {
		const declaredField = fields[property.key];

		if (declaredField?.type !== OBJECT_TYPE) {
			continue;
		}

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
			targetType: declaredField.type,
			rhsType,
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
				);
			}
		},
	});

	return warnings;
};

const resolveAssignmentTargetType = (left, resolveNameType, objectTypes) => {
	if (left?.type === AST_NODE.identifier) {
		return {
			name: left.name,
			targetType: resolveNameType(left.name, left.loc),
		};
	}
	if (left?.type === AST_NODE.memberExpression) {
		const objectName = left.object?.name;
		const propertyName = left.property?.name;

		if (!objectName || !propertyName) {
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
		);

		if (
			resolveAssignmentTruncation(init, rhsType, targetType, floatContext, ast)
		) {
			warnings.push({
				kind: "declaration",
				name: declarator.id?.name ?? null,
				targetType,
				rhsType,
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

	walk(ast, {
		enter: (node) => {
			if (node.type === AST_NODE.variableDeclaration) {
				collectDeclarationCastWarnings(
					warnings,
					node,
					resolveNameType,
					resolveCallType,
					wordSize,
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
			);
			const truncates =
				isFloatToInteger(rhsType, targetType) ||
				Boolean(
					resolveAssignmentTruncation(
						node.right,
						rhsType,
						targetType,
						floatContext,
						ast,
					),
				);

			if (truncates) {
				warnings.push({
					kind: "assignment",
					name,
					targetType,
					rhsType,
					targetLocation: node.left.loc ?? node.loc,
					location: node.right.loc ?? node.loc,
				});
			}
		},
	});

	return warnings;
};

export const collectArgumentCastWarnings = (
	ast,
	{ variableTypes, paramTypesByName, wordSize },
) => {
	const warnings = [];
	const resolveNameType = (name, loc) => variableTypes.resolve(name, loc);

	walk(ast, {
		enter: (node) => {
			if (
				node.type !== AST_NODE.callExpression ||
				node.callee?.type !== AST_NODE.identifier
			) {
				return;
			}
			const paramTypes = paramTypesByName?.[node.callee.name];

			if (!paramTypes) {
				return;
			}
			node.arguments.forEach((argument, index) => {
				const paramType = paramTypes[index];

				if (!paramType || !TYPE_RANGES[paramType]) {
					return;
				}
				const name =
					argument.type === AST_NODE.identifier ? argument.name : null;
				const argType = resolveExpressionType(
					resolveNameType,
					argument,
					undefined,
					undefined,
					wordSize,
				);
				const truncates =
					isFloatToInteger(argType, paramType) ||
					Boolean(
						resolveAssignmentTruncation(
							argument,
							argType,
							paramType,
							undefined,
							ast,
						),
					);

				if (truncates) {
					warnings.push({
						kind: "argument",
						name,
						targetType: paramType,
						rhsType: argType,
						targetLocation: argument.loc ?? node.loc,
						location: argument.loc ?? node.loc,
					});
				}
			});
		},
	});

	return warnings;
};
