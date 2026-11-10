import { AST_NODE } from "../constants.js";
import { createAsyncTaskType } from "./async-task-type.js";
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

const wrapAsyncCallTypes = (ast, userFunctionReturnTypes) => {
	const callTypes = new Map();
	for (const { declaration } of collectFunctionDeclarations(ast)) {
		const name = declaration.id?.name;
		const returnType = name ? userFunctionReturnTypes.get(name) : null;
		if (!name || !returnType) {
			continue;
		}
		callTypes.set(
			name,
			declaration.init.async === true
				? createAsyncTaskType(returnType)
				: returnType,
		);
	}
	return callTypes;
};

// `userFunctionReturnTypes` stays raw because the async lowering reads the
// payload type from it. `resolveCallType` (what the checker and the expression
// resolvers see) reports `AsyncTask<T>` for async functions instead.
export const resolveProjectTypes = (
	ast,
	wordType,
	resolveLibraryCallType,
	wordSize,
	objectTypes,
) => {
	const makeResolver = (callTypes) => {
		return (name) => callTypes.get(name) ?? resolveLibraryCallType(name);
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
	let callTypes = wrapAsyncCallTypes(ast, userFunctionReturnTypes);
	variableTypes = collectVariableTypes(
		ast,
		wordType,
		makeResolver(callTypes),
		wordSize,
		objectTypes,
	);
	userFunctionReturnTypes = collectUserFunctionReturnTypes(
		ast,
		(name, loc) => variableTypes.resolve(name, loc),
		makeResolver(callTypes),
		wordSize,
		objectTypes,
	);
	callTypes = wrapAsyncCallTypes(ast, userFunctionReturnTypes);
	variableTypes = collectVariableTypes(
		ast,
		wordType,
		makeResolver(callTypes),
		wordSize,
		objectTypes,
	);

	return {
		variableTypes,
		userFunctionReturnTypes,
		resolveCallType: makeResolver(callTypes),
	};
};
