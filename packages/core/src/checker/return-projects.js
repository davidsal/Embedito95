import { AST_NODE } from "../constants.js";
import { collectFunctionDeclarations } from "./declaration-accessors.js";
import { inferFunctionReturnType } from "./return-inference.js";
import { collectVariableTypes } from "./variables.js";
import { walk } from "./walk.js";

export const collectUserFunctionReturnTypes = (
	ast,
	resolveNameType,
	resolveCallType,
	wordSize,
	objectTypes,
) => {
	const returnTypes = new Map();

	for (const { declaration } of collectFunctionDeclarations(ast)) {
		const name = declaration.id?.name;
		const inferred = inferFunctionReturnType(
			declaration.init,
			resolveNameType,
			resolveCallType,
			wordSize,
			ast,
			objectTypes,
		);
		const declaredType = declaration.init.returnType?.name;
		const type = declaredType ?? inferred.type;
		if (name && type) {
			returnTypes.set(name, type);
		}
	}

	return returnTypes;
};

export const collectObjectMethodReturnTypes = (ast, objectTypes) => {
	const methodTypes = new Map();
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
				const methods = typeName ? objectTypes?.[typeName]?.methods : null;
				if (methods) {
					for (const property of node.properties ?? []) {
						if (property.value?.type !== AST_NODE.functionExpression) {
							continue;
						}
						const method = methods[property.key];
						if (method?.returnType) {
							methodTypes.set(property.value, {
								name: property.key,
								returnType: method.returnType,
							});
						}
					}
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

	return methodTypes;
};

export const resolveProjectTypes = (
	ast,
	wordType,
	resolveLibraryCallType,
	wordSize,
	objectTypes,
) => {
	const makeResolver = (userFunctionReturnTypes) => {
		return (name) =>
			userFunctionReturnTypes.get(name) ?? resolveLibraryCallType(name);
	};

	let variableTypes = collectVariableTypes(
		ast,
		wordType,
		resolveLibraryCallType,
		wordSize,
		objectTypes,
	);
	let userFunctionReturnTypes = collectUserFunctionReturnTypes(
		ast,
		(name, loc) => variableTypes.resolve(name, loc),
		resolveLibraryCallType,
		wordSize,
		objectTypes,
	);
	variableTypes = collectVariableTypes(
		ast,
		wordType,
		makeResolver(userFunctionReturnTypes),
		wordSize,
		objectTypes,
	);
	userFunctionReturnTypes = collectUserFunctionReturnTypes(
		ast,
		(name, loc) => variableTypes.resolve(name, loc),
		makeResolver(userFunctionReturnTypes),
		wordSize,
		objectTypes,
	);
	variableTypes = collectVariableTypes(
		ast,
		wordType,
		makeResolver(userFunctionReturnTypes),
		wordSize,
		objectTypes,
	);

	return {
		variableTypes,
		userFunctionReturnTypes,
		resolveCallType: makeResolver(userFunctionReturnTypes),
	};
};
