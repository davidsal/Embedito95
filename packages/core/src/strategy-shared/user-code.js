import { isObjectShapeType } from "../checker/index.js";
import { AST_NODE, CONST_KIND, DATA_TYPE } from "../constants.js";
import {
	renderCallbackRecordFactory,
	renderCallbackRecordMethod,
	renderSharedObjectFactory,
	renderSharedObjectMethod,
} from "./classes.js";
import { renderParameterDeclaration } from "./function-pointer.js";
import { hasDataFields } from "./object-info.js";
import { collectObjectMethods, renderObjectMethod } from "./object-methods.js";
import { renderFunctionBody } from "./statements.js";

const collectClosureMetadata = (objectTypes) => {
	const closureTypes = new Set();
	const closureFactoryNames = new Set();
	for (const [typeName, info] of Object.entries(objectTypes)) {
		if (info.isClosureClass) {
			closureTypes.add(typeName);
			if (info.factoryName) {
				closureFactoryNames.add(info.factoryName);
			}
		}
	}
	return { closureTypes, closureFactoryNames };
};

const renderUserFunctionDeclaration = (
	statement,
	renderContext,
	userFunctionReturnTypes,
	closureFactoryNames,
	userTypeNames,
) => {
	const declaration = statement.declarations?.[0];
	if (!declaration?.id?.name) {
		return null;
	}
	if (declaration.init?.type !== AST_NODE.functionExpression) {
		return null;
	}
	if (declaration.id.name === "setup" || declaration.id.name === "main") {
		return null;
	}
	if (closureFactoryNames.has(declaration.id.name)) {
		return null;
	}
	const returnType = userFunctionReturnTypes.get(declaration.id.name);
	renderContext.setCurrentFunctionName(declaration.id.name);
	renderContext.functionReturnType = returnType ?? DATA_TYPE.void;
	const body = renderFunctionBody(declaration.init, renderContext)
		.map((line) => (line ? `\t${line}` : ""))
		.join("\n");
	const params = (declaration.init.params ?? [])
		.map((param) => {
			const paramType = param.typeAnnotation?.type;
			const isObjectParam =
				isObjectShapeType(paramType) || userTypeNames?.has(paramType);
			const isHandleParam = renderContext.isObjectHandle?.(paramType);
			const byReference = isObjectParam && !isHandleParam;
			return renderParameterDeclaration(
				param,
				renderContext.toCType,
				byReference,
			);
		})
		.join(", ");
	const returnCType = returnType ? renderContext.toCType(returnType) : "void";
	return `${returnCType} ${declaration.id.name}(${params}) {\n${body}\n}`;
};

const renderUserFunctionDeclarations = (
	ast,
	renderContext,
	userFunctionReturnTypes,
	closureFactoryNames,
	userTypeNames,
) => {
	const userFunctions = [];
	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.variableDeclaration) {
			continue;
		}
		if (statement.kind !== CONST_KIND) {
			continue;
		}
		const rendered = renderUserFunctionDeclaration(
			statement,
			renderContext,
			userFunctionReturnTypes,
			closureFactoryNames,
			userTypeNames,
		);
		if (rendered) {
			userFunctions.push(rendered);
		}
	}
	return userFunctions;
};

const renderObjectMethods = (ast, objectTypes, renderContext, closureTypes) => {
	const userFunctions = [];
	const handleFunctions = [];
	const methodsByType = collectObjectMethods(ast, objectTypes);
	for (const [typeName, methods] of methodsByType) {
		if (closureTypes.has(typeName)) {
			continue;
		}
		// A handle type's methods are free functions over `Object<T> &self`; they
		// can call each other in any order, so they need prototypes (a value
		// struct's methods keep member calls and need none). A CALLBACK RECORD
		// handle (0 fields, >=1 method) is the exception: its methods are
		// function-pointer members of the struct, not free functions.
		const isHandle = Boolean(renderContext.isObjectHandle?.(typeName));
		const isCallbackRecord =
			isHandle && !hasDataFields(objectTypes?.[typeName]);
		if (isCallbackRecord) {
			continue;
		}
		for (const [methodName, functionExpression] of methods) {
			const rendered = renderObjectMethod(
				typeName,
				methodName,
				functionExpression,
				objectTypes,
				renderContext,
				isHandle,
			);
			userFunctions.push(rendered);
			if (isHandle) {
				handleFunctions.push(rendered);
			}
		}
	}
	return { userFunctions, handleFunctions };
};

// Prototypes (`ret name(params);`) for a list of rendered free-function
// definitions, so they can call each other in any order (a shared closure's
// public method may call a hoisted private closure defined later, or a handle
// type's method may call one declared later). Mirrors what the split-library
// header already does for its exported free functions.
export const renderFunctionPrototypes = (functionDefinitions) => {
	return functionDefinitions
		.map((functionDefinition) => {
			const braceIndex = functionDefinition.indexOf("{");
			return braceIndex === -1
				? functionDefinition
				: `${functionDefinition.slice(0, braceIndex).trim()};`;
		})
		.join("\n");
};

// A closure always lowers to a shared `Object<T>` handle. A STATEFUL closure
// keeps its captured fields in the storage struct, and its methods (public and
// hoisted private) are free functions over `Object<T> &self`. A STATELESS
// closure is a CALLBACK RECORD: its methods are plain free functions (no `self`,
// since there is no state) whose addresses the factory stores in the struct's
// function-pointer slots.
const renderClosureFunctions = (closureTypes, objectTypes, renderContext) => {
	const methodFunctions = [];
	const factoryFunctions = [];
	for (const typeName of closureTypes) {
		const info = objectTypes[typeName];
		const stateful = hasDataFields(info);
		const renderClosureMethod = stateful
			? renderSharedObjectMethod
			: renderCallbackRecordMethod;
		for (const method of info.publicMethods ?? []) {
			methodFunctions.push(
				renderClosureMethod(
					typeName,
					method.name,
					method.functionExpression,
					objectTypes,
					renderContext,
				),
			);
		}
		for (const closure of info.privateClosures ?? []) {
			methodFunctions.push(
				renderClosureMethod(
					typeName,
					closure.name,
					closure.functionExpression,
					objectTypes,
					renderContext,
				),
			);
		}
		factoryFunctions.push(
			stateful
				? renderSharedObjectFactory(typeName, info, renderContext)
				: renderCallbackRecordFactory(typeName, info, renderContext),
		);
	}
	return { methodFunctions, factoryFunctions };
};

export const renderUserCode = (
	ast,
	objectTypes,
	renderContext,
	userFunctionReturnTypes,
	userTypeNames,
) => {
	const { closureTypes, closureFactoryNames } =
		collectClosureMetadata(objectTypes);

	const closureResult = renderClosureFunctions(
		closureTypes,
		objectTypes,
		renderContext,
	);

	const userFunctions = renderUserFunctionDeclarations(
		ast,
		renderContext,
		userFunctionReturnTypes,
		closureFactoryNames,
		userTypeNames,
	);

	const objectMethods = renderObjectMethods(
		ast,
		objectTypes,
		renderContext,
		closureTypes,
	);

	userFunctions.push(...objectMethods.userFunctions);

	// Hoist closure free functions ahead of every user free function: a free
	// function may call a method/factory (`increment(x)`, `makeCounter()`) that is
	// defined later in the source, and the generated C++ needs it declared before
	// that caller. Closure methods/private closures and plain handle types'
	// methods may also call each other in any order, so they get prototypes too.
	userFunctions.unshift(
		...closureResult.methodFunctions,
		...closureResult.factoryFunctions,
	);

	return {
		userFunctions,
		sharedFunctionPrototypes: renderFunctionPrototypes([
			...closureResult.methodFunctions,
			...objectMethods.handleFunctions,
		]),
	};
};
