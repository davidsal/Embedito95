import { parseArrayType, walk } from "../checker/index.js";
import { AST_NODE, DATA_TYPE } from "../constants.js";
import { renderFunctionBody } from "./statements.js";

const recordObjectMethods = (
	methodsByType,
	objectTypes,
	objectNode,
	typeName,
) => {
	if (!objectTypes?.[typeName]?.methods) {
		return;
	}
	if (!methodsByType.has(typeName)) {
		methodsByType.set(typeName, new Map());
	}
	for (const property of objectNode.properties ?? []) {
		if (property.value?.type === AST_NODE.functionExpression) {
			methodsByType.get(typeName).set(property.key, property.value);
		}
	}
};

const visitTypedValue = (methodsByType, objectTypes, node, typeName) => {
	if (!node || !typeName) {
		return;
	}
	if (node.type === AST_NODE.objectLiteral) {
		recordObjectMethods(methodsByType, objectTypes, node, typeName);
		const fields = objectTypes?.[typeName]?.fields ?? {};
		for (const property of node.properties ?? []) {
			visitTypedValue(
				methodsByType,
				objectTypes,
				property.value,
				fields[property.key]?.type,
			);
		}
		return;
	}
	const elementType = parseArrayType(typeName)?.elementType;
	if (node.type === AST_NODE.arrayLiteral && elementType) {
		for (const element of node.elements ?? []) {
			visitTypedValue(methodsByType, objectTypes, element, elementType);
		}
	}
};

const visitFunctionReturns = (
	methodsByType,
	objectTypes,
	functionNode,
	returnType,
) => {
	walk(functionNode.body, {
		enter: (node) => {
			if (node.type === AST_NODE.functionExpression) {
				return false;
			}
			if (node.type === AST_NODE.returnStatement && node.argument) {
				visitTypedValue(methodsByType, objectTypes, node.argument, returnType);
			}
		},
	});
};

// Collects the inline method implementations of every object literal, keyed by
// the type the literal actually has. A literal's type comes from the declaration
// it initializes (`const x: T = {...}`), a function's return type, or the
// enclosing field/element type when the literal is NESTED — so a callback record
// inside another object's field is attributed to the callback record, not to the
// outer type.
export const collectObjectMethods = (ast, objectTypes) => {
	const methodsByType = new Map();

	walk(ast, {
		enter: (node) => {
			if (node.type === AST_NODE.variableDeclaration) {
				const declaration = node.declarations?.[0];
				const annotation = declaration?.id?.typeAnnotation?.type;
				if (annotation && declaration?.init) {
					visitTypedValue(
						methodsByType,
						objectTypes,
						declaration.init,
						annotation,
					);
				}
			}
			if (node.type === AST_NODE.functionExpression && node.returnType?.name) {
				visitFunctionReturns(
					methodsByType,
					objectTypes,
					node,
					node.returnType.name,
				);
			}
		},
	});

	return methodsByType;
};

export const renderMethod = (
	baseContext,
	typeName,
	methodName,
	functionExpression,
	objectTypes,
	isHandleMethod = false,
	isPlainFunction = false,
) => {
	const methodContext = {
		...baseContext,
		selfFields: null,
		selfType: typeName,
		isHandleMethod,
		isPlainFunction,
	};
	const returnType =
		functionExpression.returnType?.name ??
		objectTypes[typeName]?.methods?.[methodName]?.returnType ??
		DATA_TYPE.void;
	methodContext.functionReturnType = returnType;
	methodContext.setCurrentFunctionName?.(methodName);
	const body = renderFunctionBody(functionExpression, methodContext)
		.map((line) => (line ? `\t${line}` : ""))
		.join("\n");
	const params = (functionExpression.params ?? [])
		.map((param) => {
			const paramType = param.typeAnnotation?.type;
			return `${methodContext.toCType(paramType)} ${param.name}`;
		})
		.join(", ");
	const returnCType = methodContext.toCType(returnType);
	const signature = isPlainFunction
		? `${returnCType} ${methodName}(${params})`
		: `${returnCType} ${methodName}(${methodContext.toCType(
				typeName,
			)} &self${params ? `, ${params}` : ""})`;
	return `${signature} {\n${body}\n}`;
};

export const renderObjectMethod = (
	typeName,
	methodName,
	functionExpression,
	objectTypes,
	renderContext,
	isHandleMethod = false,
) => {
	const rendered = renderMethod(
		renderContext,
		typeName,
		methodName,
		functionExpression,
		objectTypes,
		isHandleMethod,
	);
	return rendered;
};
