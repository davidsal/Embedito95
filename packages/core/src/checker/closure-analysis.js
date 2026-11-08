import { AST_NODE, CONST_KIND } from "../constants.js";
import { collectBoundNames } from "./references-checks.js";
import { walk } from "./walk.js";

export const findReturnObjectLiteral = (functionExpression) => {
	let found = null;
	walk(functionExpression, {
		enter: (node) => {
			if (node.type === AST_NODE.returnStatement) {
				if (node.argument?.type === AST_NODE.objectLiteral) {
					found = node.argument;
					return false;
				}
			}
		},
	});
	return found;
};

export const collectLocalClosureDeclarations = (functionNode) => {
	const declarations = [];
	for (const statement of functionNode.body?.body ?? []) {
		if (statement.type !== AST_NODE.variableDeclaration) {
			continue;
		}
		const declaration = statement.declarations?.[0];
		if (
			declaration?.init?.type === AST_NODE.functionExpression &&
			declaration.id?.name
		) {
			declarations.push(statement);
		}
	}
	return declarations;
};

const findLocalClosureExpression = (closureDeclarations, name) => {
	for (const statement of closureDeclarations) {
		const declaration = statement.declarations[0];
		if (declaration.id?.name === name) {
			return declaration.init;
		}
	}
	return null;
};

// A returned property is a method either because it holds an inline
// `functionExpression` or because it references a closure declared with `const`
// in the factory body (`return { paint: paint }` / `{ paint: doPaint }`). The
// property key names the public method; the resolved expression carries the body.
export const resolveReturnedMethodExpression = (
	property,
	closureDeclarations,
) => {
	if (property.value?.type === AST_NODE.functionExpression) {
		return property.value;
	}
	if (property.value?.type === AST_NODE.identifier) {
		return findLocalClosureExpression(closureDeclarations, property.value.name);
	}
	return null;
};

// The declared return type of a `const name = (…): T => {…}` declaration lives
// in the function expression; a declaration-level annotation is the fallback.
export const resolveDeclaredReturnType = (declaration) => {
	return (
		declaration?.init?.returnType?.name ??
		declaration?.id?.typeAnnotation?.type ??
		null
	);
};

const resolveReturnedMethodSourceName = (property) => {
	return property.value?.type === AST_NODE.identifier
		? property.value.name
		: null;
};

// A closure factory is `const makeX = (...): T => { ... return { ...methods...
// } }` where `T` is an object type with methods and the returned literal has at
// least one method property (inline or a reference to a local closure). A
// factory that returns a pure data object is NOT a closure (it stays a shared
// data-object handle), so it returns null.
const toClosureFactory = (statement, objectTypes) => {
	if (statement.type !== AST_NODE.variableDeclaration) {
		return null;
	}
	if (statement.kind !== CONST_KIND) {
		return null;
	}
	const declaration = statement.declarations?.[0];
	if (declaration?.init?.type !== AST_NODE.functionExpression) {
		return null;
	}
	const functionNode = declaration.init;
	const returnType = resolveDeclaredReturnType(declaration);
	if (!returnType || !objectTypes?.[returnType]?.methods) {
		return null;
	}
	const returnObj = findReturnObjectLiteral(functionNode);
	if (!returnObj) {
		return null;
	}
	const closureDeclarations = collectLocalClosureDeclarations(functionNode);
	const isClosureReturn = (returnObj.properties ?? []).some((property) => {
		return Boolean(
			resolveReturnedMethodExpression(property, closureDeclarations),
		);
	});
	if (!isClosureReturn) {
		return null;
	}
	return { statement, declaration, functionNode, returnType, returnObj };
};

export const collectClosureFactories = (ast, objectTypes) => {
	const factories = [];
	for (const statement of ast.body) {
		const factory = toClosureFactory(statement, objectTypes);
		if (factory) {
			factories.push(factory);
		}
	}
	return factories;
};

const collectFactoryScopeNames = (factory) => {
	const scope = new Map();
	for (const param of factory.functionNode.params ?? []) {
		scope.set(param.name, param.typeAnnotation?.type ?? null);
	}
	for (const statement of factory.functionNode.body?.body ?? []) {
		if (statement.type !== AST_NODE.variableDeclaration) {
			continue;
		}
		const declaration = statement.declarations?.[0];
		if (declaration?.id?.name) {
			scope.set(
				declaration.id.name,
				declaration.id.typeAnnotation?.type ?? null,
			);
		}
	}
	return scope;
};

const collectCaptured = (targetNode, scopeNames, captured) => {
	const bound = collectBoundNames(targetNode);
	walk(targetNode, {
		enter: (node) => {
			if (node.type === AST_NODE.identifier) {
				if (scopeNames.has(node.name) && !bound.has(node.name)) {
					captured.add(node.name);
				}
			}
		},
	});
};

const PRIVATE_CLOSURE_SUFFIX = "PrivateClosure";

const makePrivateClosureName = (sourceName, usedNames) => {
	if (!usedNames.has(sourceName)) {
		return sourceName;
	}
	const baseName = `${sourceName}${PRIVATE_CLOSURE_SUFFIX}`;
	if (!usedNames.has(baseName)) {
		return baseName;
	}
	let suffix = 1;
	let candidate = `${baseName}${suffix}`;
	while (usedNames.has(candidate)) {
		suffix += 1;
		candidate = `${baseName}${suffix}`;
	}
	return candidate;
};

// Decomposes a closure factory into the pieces both the checker (privacy of
// captured fields) and the codegen (lowering to a shared handle) need, so the two
// stay in sync. `fieldOrder` is the captured names that become struct fields:
// captured by a method/private closure and not a hoisted private closure.
export const analyzeClosureFactory = (factory) => {
	const scopeNames = collectFactoryScopeNames(factory);

	const closureDeclarations = collectLocalClosureDeclarations(
		factory.functionNode,
	);
	const hoisted = new Set();
	for (const statement of closureDeclarations) {
		hoisted.add(statement.declarations[0].id.name);
	}

	const publicMethods = [];
	const returnedClosureNames = new Set();
	for (const property of factory.returnObj.properties ?? []) {
		const functionExpression = resolveReturnedMethodExpression(
			property,
			closureDeclarations,
		);
		if (!functionExpression) {
			continue;
		}
		const sourceName = resolveReturnedMethodSourceName(property);
		if (sourceName) {
			returnedClosureNames.add(sourceName);
		}
		publicMethods.push({
			name: property.key,
			functionExpression,
			sourceName,
		});
	}
	const methodExpressions = publicMethods.map(
		(method) => method.functionExpression,
	);

	const captured = new Set();
	for (const method of methodExpressions) {
		collectCaptured(method, scopeNames, captured);
	}
	for (const statement of closureDeclarations) {
		collectCaptured(statement.declarations[0].init, scopeNames, captured);
	}

	const fieldOrder = [];
	for (const name of scopeNames.keys()) {
		if (captured.has(name) && !hoisted.has(name)) {
			fieldOrder.push(name);
		}
	}

	// A local closure returned as a method is emitted ONCE, under the property
	// key. Only the non-returned closures stay private helpers, and they are
	// renamed deterministically when their source name would collide with a
	// public method (otherwise two free functions share a name and calls from
	// the public method recurse into itself).
	const publicMethodNames = new Set(publicMethods.map((method) => method.name));
	const usedNames = new Set(publicMethodNames);
	const hoistedNames = new Map();
	for (const method of publicMethods) {
		if (method.sourceName && !hoistedNames.has(method.sourceName)) {
			hoistedNames.set(method.sourceName, method.name);
		}
	}
	const privateClosureDeclarations = closureDeclarations.filter((statement) => {
		return !returnedClosureNames.has(statement.declarations[0].id.name);
	});
	for (const statement of privateClosureDeclarations) {
		const sourceName = statement.declarations[0].id.name;
		const emittedName = makePrivateClosureName(sourceName, usedNames);
		usedNames.add(emittedName);
		hoistedNames.set(sourceName, emittedName);
	}

	return {
		scopeNames,
		hoisted,
		closureDeclarations,
		privateClosureDeclarations,
		hoistedNames,
		methodExpressions,
		publicMethods,
		captured,
		fieldOrder,
	};
};

// Captured field types per closure type. A factory method may name one of the
// captured values through `this.<name>`; the type is not declared on the type
// (the codegen injects it as a struct field), so the checker needs this map to
// resolve `this.<name>` the same way the codegen does.
export const collectClosureCapturedFieldTypes = (ast, objectTypes) => {
	const capturedFieldTypes = new Map();
	for (const factory of collectClosureFactories(ast, objectTypes)) {
		const { scopeNames, fieldOrder } = analyzeClosureFactory(factory);
		const fields = new Map();
		for (const name of fieldOrder) {
			const type = scopeNames.get(name);
			if (type) {
				fields.set(name, type);
			}
		}
		if (fields.size > 0) {
			capturedFieldTypes.set(factory.returnType, fields);
		}
	}
	return capturedFieldTypes;
};

// Captured field names per closure type. The checker uses this to reject an
// external `instance.field` that would read the closure's private state. A name
// that is ALSO declared as a field of the type is public (the factory returned
// it), so it is excluded: only names the type never declared become private
// injected state.
export const collectClosureCapturedFields = (ast, objectTypes) => {
	const capturedFields = new Map();
	for (const factory of collectClosureFactories(ast, objectTypes)) {
		const { fieldOrder } = analyzeClosureFactory(factory);
		const declaredFields = objectTypes?.[factory.returnType]?.fields ?? {};
		const privateFields = new Set();
		for (const name of fieldOrder) {
			if (!declaredFields[name]) {
				privateFields.add(name);
			}
		}
		capturedFields.set(factory.returnType, privateFields);
	}
	return capturedFields;
};
