import { AST_NODE, DATA_TYPE } from "../constants.js";
import { inferArrayElementType } from "./arrays.js";
import { resolveExpressionType } from "./expressions.js";
import { resolveWordDataType } from "./type-resolution.js";
import { walk } from "./walk.js";

export const selfContextStack = [];

export const collectObjectLiteralTypes = (ast, objectTypes) => {
	const typeMap = new Map();
	const typeStack = [];

	walk(ast, {
		enter: (node) => {
			if (node.type === AST_NODE.variableDeclaration) {
				const annotation = node.declarations?.[0]?.id?.typeAnnotation?.type;
				if (annotation && objectTypes?.[annotation]) {
					typeStack.push(annotation);
				}
			}
			if (node.type === AST_NODE.functionExpression) {
				const returnType = node.returnType?.name;
				if (returnType && objectTypes?.[returnType]) {
					typeStack.push(returnType);
				}
			}
			if (node.type === AST_NODE.objectLiteral) {
				const typeName = typeStack[typeStack.length - 1];
				if (typeName) {
					typeMap.set(node, typeName);
				}
			}
		},
		exit: (node) => {
			if (node.type === AST_NODE.variableDeclaration) {
				const annotation = node.declarations?.[0]?.id?.typeAnnotation?.type;
				if (annotation && objectTypes?.[annotation]) {
					typeStack.pop();
				}
			}
			if (node.type === AST_NODE.functionExpression) {
				const returnType = node.returnType?.name;
				if (returnType && objectTypes?.[returnType]) {
					typeStack.pop();
				}
			}
		},
	});
	return typeMap;
};

export const resolveSelfFieldForType = (name, objectTypes) => {
	for (let index = selfContextStack.length - 1; index >= 0; index--) {
		const typeName = selfContextStack[index];
		const fields = objectTypes?.[typeName]?.fields;
		const field = fields?.[name];
		if (field) {
			return field;
		}
		const capturedType = objectTypes?.[typeName]?.capturedFieldTypes?.get(name);
		if (capturedType) {
			return { type: capturedType };
		}
	}
	return null;
};

export const inferObjectFields = (
	objectNode,
	resolveNameType,
	resolveCallType,
	objectTypes,
	wordSize,
	ast = null,
	wordType = null,
	resolveElementType = null,
	widenToWord = true,
) => {
	const fields = {};
	for (const property of objectNode.properties ?? []) {
		if (property.value?.type === AST_NODE.functionExpression) {
			const functionExpression = property.value;
			fields[property.key] = {
				kind: "method",
				params: functionExpression.params.map((param) => ({
					name: param.name,
					type: param.typeAnnotation?.type ?? null,
				})),
				returnType: functionExpression.returnType?.name ?? DATA_TYPE.void,
			};
			continue;
		}
		if (property.value?.type === AST_NODE.arrayLiteral) {
			const elementType = inferArrayElementType(
				ast,
				property.value.elements,
				resolveNameType,
				wordType ?? resolveWordDataType(wordSize),
				resolveElementType,
				widenToWord,
			);
			fields[property.key] = elementType
				? { type: `${elementType}[]` }
				: { type: null };
			continue;
		}
		const fieldType = resolveExpressionType(
			resolveNameType,
			property.value,
			null,
			resolveCallType,
			wordSize,
			objectTypes,
			ast,
			wordType,
			resolveElementType,
			widenToWord,
		);
		fields[property.key] = fieldType ? { type: fieldType } : { type: null };
	}
	return fields;
};
