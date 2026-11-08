import { AST_NODE, FLOAT_TYPES, OBJECT_TYPE } from "../constants.js";
import { resolveAssignmentTruncation } from "./expression-assignment.js";
import { resolveExpressionType } from "./expressions.js";
import { TYPE_RANGES } from "./types.js";
import { walk } from "./walk.js";

const isObjectReference = (type, objectTypes) => {
	return type && type !== OBJECT_TYPE && Boolean(objectTypes?.[type]);
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

export const collectAssignmentCastWarnings = (
	ast,
	{ variableTypes, wordSize, resolveCallType },
) => {
	const warnings = [];
	const resolveNameType = (name, loc) => variableTypes.resolve(name, loc);

	walk(ast, {
		enter: (node) => {
			if (
				node.type === AST_NODE.assignmentExpression &&
				node.operator === "="
			) {
				const name = node.left?.name;
				const targetType = name ? resolveNameType(name, node.left?.loc) : null;

				if (name && targetType) {
					const floatContext = FLOAT_TYPES.has(targetType) ? targetType : null;
					const rhsType = resolveExpressionType(
						resolveNameType,
						node.right,
						floatContext,
						resolveCallType,
						wordSize,
					);

					if (
						resolveAssignmentTruncation(
							node.right,
							rhsType,
							targetType,
							floatContext,
							ast,
						)
					) {
						warnings.push({
							kind: "assignment",
							name,
							targetType,
							rhsType,
							targetLocation: node.left.loc ?? node.loc,
							location: node.right.loc ?? node.loc,
						});
					}
				}
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
				node.type === AST_NODE.callExpression &&
				node.callee?.type === AST_NODE.identifier
			) {
				const paramTypes = paramTypesByName?.[node.callee.name];

				if (paramTypes) {
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

						if (
							resolveAssignmentTruncation(
								argument,
								argType,
								paramType,
								undefined,
								ast,
							)
						) {
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
				}
			}
		},
	});

	return warnings;
};
