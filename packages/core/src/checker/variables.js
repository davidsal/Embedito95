import { AST_NODE } from "../constants.js";
import { getDeclaration } from "./declaration-accessors.js";
import { isBefore } from "./types.js";
import { resolveInitializerType } from "./variable-initializers.js";
import { SCOPE_NODE_TYPES, walk } from "./walk.js";

export const resolveVariableType = (
	ast,
	statement,
	wordType,
	resolveNameType,
	resolveCallType,
	wordSize,
	objectTypes,
) => {
	const declaration = getDeclaration(statement);
	if (!declaration) {
		return null;
	}

	const annotation = declaration.id?.typeAnnotation?.type;
	if (annotation) {
		return annotation;
	}

	return resolveInitializerType(
		ast,
		declaration.init,
		statement.kind === "let",
		wordType,
		resolveNameType,
		resolveCallType,
		wordSize,
		objectTypes,
	);
};

const VARIABLE_SCOPE_NODE_TYPES = new Set([
	...SCOPE_NODE_TYPES,
	AST_NODE.functionExpression,
]);

const createScope = (parent, location) => {
	return { parent, location, types: new Map(), children: [] };
};

const locationContains = (outer, inner) => {
	if (!outer || !inner) {
		return false;
	}
	return !isBefore(inner.start, outer.start) && !isBefore(outer.end, inner.end);
};

const findInnermostScope = (scope, location) => {
	for (const child of scope.children) {
		if (locationContains(child.location, location)) {
			return findInnermostScope(child, location);
		}
	}
	return scope;
};

const resolveTypeInStack = (scopeStack, name) => {
	for (let index = scopeStack.length - 1; index >= 0; index--) {
		const scope = scopeStack[index];
		if (scope.types.has(name)) {
			return scope.types.get(name);
		}
	}
	return undefined;
};

const resolveTypeInChain = (scope, name) => {
	if (!scope) {
		return undefined;
	}
	if (scope.types.has(name)) {
		return scope.types.get(name);
	}
	return resolveTypeInChain(scope.parent, name);
};

const registerScopedType = (state, name, type) => {
	if (!name || !type) {
		return;
	}
	state.flatTypes.set(name, type);
	state.scopeStack[state.scopeStack.length - 1].types.set(name, type);
};

const handleCollectEnter = (state, node) => {
	if (VARIABLE_SCOPE_NODE_TYPES.has(node.type)) {
		const parentScope = state.scopeStack[state.scopeStack.length - 1];
		const scope = createScope(parentScope, node.loc);
		parentScope.children.push(scope);
		state.scopeStack.push(scope);
	}
	if (node.type === AST_NODE.variableDeclaration) {
		const name = node.declarations?.[0]?.id?.name;
		const type = resolveVariableType(
			state.ast,
			node,
			state.wordType,
			(resolvedName) => {
				return resolveTypeInStack(state.scopeStack, resolvedName);
			},
			state.resolveCallType,
			state.wordSize,
			state.objectTypes,
		);
		registerScopedType(state, name, type);
	}
	if (node.type === AST_NODE.functionExpression) {
		for (const param of node.params) {
			if (param?.typeAnnotation?.type) {
				registerScopedType(state, param.name, param.typeAnnotation.type);
			}
		}
	}
};

const handleCollectExit = (state, node) => {
	if (VARIABLE_SCOPE_NODE_TYPES.has(node.type)) {
		state.scopeStack.pop();
	}
};

const resolveScopedType = (state, name, location) => {
	if (location) {
		const innermost = findInnermostScope(state.rootScope, location);
		const scoped = resolveTypeInChain(innermost, name);
		if (scoped !== undefined) {
			return scoped;
		}
	}
	return state.flatTypes.get(name);
};

export const collectVariableTypes = (
	ast,
	wordType,
	resolveCallType,
	wordSize,
	objectTypes,
) => {
	const state = {
		ast,
		wordType,
		resolveCallType,
		wordSize,
		objectTypes,
		flatTypes: new Map(),
		rootScope: createScope(null, ast.loc ?? null),
		scopeStack: [],
	};
	state.scopeStack.push(state.rootScope);

	walk(ast, {
		enter: (node) => {
			handleCollectEnter(state, node);
		},
		exit: (node) => {
			handleCollectExit(state, node);
		},
	});

	return {
		get: (name) => {
			return state.flatTypes.get(name);
		},
		has: (name) => {
			return state.flatTypes.has(name);
		},
		resolve: (name, location) => {
			return resolveScopedType(state, name, location);
		},
	};
};
