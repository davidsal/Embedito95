import {
	analyzeClosureFactory,
	collectBoundNames,
	collectClosureFactories,
} from "../checker/index.js";
import { AST_NODE } from "../constants.js";

const makeMemberExpression = (object, propertyName, loc) => {
	return {
		type: AST_NODE.memberExpression,
		object,
		property: { type: AST_NODE.identifier, name: propertyName },
		loc: loc ?? object?.loc ?? null,
	};
};

const transformClosureBody = (node, context) => {
	if (!node || typeof node !== "object") {
		return node;
	}
	if (node.type === AST_NODE.functionExpression) {
		const innerBound = collectBoundNames(node);
		const innerContext = { ...context, bound: innerBound };
		const newBody = transformClosureBody(node.body, innerContext);
		return { ...node, body: newBody };
	}
	if (node.type === AST_NODE.identifier) {
		if (
			context.hasState &&
			context.captured.has(node.name) &&
			!context.bound.has(node.name)
		) {
			return makeMemberExpression(context.selfExpression, node.name, node.loc);
		}
		return node;
	}
	// A member's property name is not a variable reference: rewriting it would
	// turn `this.writer` into `this.self.writer` (rendered as `self->self->writer`).
	if (node.type === AST_NODE.memberExpression) {
		return {
			...node,
			object: transformClosureBody(node.object, context),
			property: node.computed
				? transformClosureBody(node.property, context)
				: node.property,
		};
	}
	if (node.type === AST_NODE.callExpression) {
		const calleeName = node.callee?.name;
		if (context.hoisted?.has(calleeName) && !context.bound.has(calleeName)) {
			const emittedName = context.hoisted.get(calleeName);
			const callee = context.hasState
				? makeMemberExpression(context.selfExpression, emittedName, node.loc)
				: { type: AST_NODE.identifier, name: emittedName, loc: node.loc };
			return {
				...node,
				callee,
				arguments: (node.arguments ?? []).map((argument) =>
					transformClosureBody(argument, context),
				),
			};
		}
	}
	const next = {};
	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			next[key] = value;
			continue;
		}
		if (Array.isArray(value)) {
			next[key] = value.map((item) => transformClosureBody(item, context));
		} else if (value && typeof value === "object") {
			next[key] = transformClosureBody(value, context);
		} else {
			next[key] = value;
		}
	}
	return next;
};

const closureBodyKey = (functionExpression) => {
	return JSON.stringify(functionExpression.body, (key, value) => {
		return key === "loc" ? undefined : value;
	});
};

// Both inline function expressions and identifiers that reference a local
// closure are lowered to the same free function, so both must be compared: two
// factories of the same type that return different bodies would otherwise
// collapse into one symbol (only one of the bodies would run).
const collectFactoryMethodBodies = (factory) => {
	const methodBodies = new Map();
	for (const method of analyzeClosureFactory(factory).publicMethods) {
		methodBodies.set(method.name, closureBodyKey(method.functionExpression));
	}
	return methodBodies;
};

const validateClosureFactoryConflicts = (factories) => {
	const byType = new Map();
	for (const factory of factories) {
		if (!byType.has(factory.returnType)) {
			byType.set(factory.returnType, []);
		}
		byType.get(factory.returnType).push(factory);
	}
	for (const [returnType, typeFactories] of byType) {
		if (typeFactories.length < 2) {
			continue;
		}
		const methodBodies = new Map();
		for (const factory of typeFactories) {
			for (const [methodName, bodyKey] of collectFactoryMethodBodies(factory)) {
				if (methodBodies.has(methodName)) {
					if (methodBodies.get(methodName) !== bodyKey) {
						throw new Error(
							`Closure factory conflict: '${methodName}' of type '${returnType}' is defined with different bodies by multiple factories. Factories of the same object type must share identical method logic.`,
						);
					}
				} else {
					methodBodies.set(methodName, bodyKey);
				}
			}
		}
	}
};

const transformClosureFactory = (ast, objectTypes, factory) => {
	const { returnType, functionNode } = factory;
	const {
		scopeNames,
		privateClosureDeclarations,
		hoistedNames,
		publicMethods,
		captured,
		fieldOrder,
	} = analyzeClosureFactory(factory);

	// A closure WITH captured state becomes a shared `Object<T>` handle: its
	// captured names are rewritten to `this.<name>` and its methods/private
	// closures are rendered as free functions over `Object<T> &self`. A STATELESS
	// closure has nothing to capture: it is a callback record (0 fields), so its
	// methods and helpers stay plain free functions and are wired into the struct
	// as function-pointer members by the factory. Renamed private closures are
	// still rewritten in both cases so calls never hit a duplicate symbol.
	const hasState = fieldOrder.length > 0;
	const selfExpressionForMethod = { type: AST_NODE.thisExpression };
	const transformContext = {
		captured,
		selfExpression: selfExpressionForMethod,
		hoisted: hoistedNames,
		hasState,
	};
	for (const method of publicMethods) {
		method.functionExpression.body = transformClosureBody(
			method.functionExpression.body,
			{
				...transformContext,
				bound: collectBoundNames(method.functionExpression),
			},
		);
	}
	for (const statement of privateClosureDeclarations) {
		const closureFunctionNode = statement.declarations[0].init;
		closureFunctionNode.body = transformClosureBody(closureFunctionNode.body, {
			...transformContext,
			bound: collectBoundNames(closureFunctionNode),
		});
	}

	const typeStatement = ast.body.find(
		(statement) =>
			statement.type === AST_NODE.typeDeclaration &&
			statement.name === returnType,
	);
	if (typeStatement) {
		const existing = new Set(
			(typeStatement.members ?? []).map((member) => member.name),
		);
		for (const name of fieldOrder) {
			if (existing.has(name)) {
				continue;
			}
			existing.add(name);
			const type = scopeNames.get(name);
			typeStatement.members.push({
				kind: "field",
				name,
				returnType: type,
				optional: false,
				loc: null,
			});
		}
	}

	const fields = objectTypes[returnType]?.fields ?? {};
	for (const name of fieldOrder) {
		if (fields[name] !== undefined) {
			continue;
		}
		fields[name] = {
			type: scopeNames.get(name),
			optional: false,
		};
	}

	objectTypes[returnType].isClosureClass = true;
	objectTypes[returnType].factoryName = factory.declaration.id.name;
	objectTypes[returnType].ctorParams = (functionNode.params ?? []).map(
		(param) => ({
			name: param.name,
			type: param.typeAnnotation?.type ?? null,
		}),
	);
	objectTypes[returnType].fieldsInOrder = fieldOrder.map((name) => {
		const declaration = (functionNode.body?.body ?? []).find(
			(statement) =>
				statement.type === AST_NODE.variableDeclaration &&
				statement.declarations?.[0]?.id?.name === name,
		);
		const init = declaration?.declarations?.[0]?.init ?? null;
		const isParam = (functionNode.params ?? []).some(
			(param) => param.name === name,
		);
		return { name, type: scopeNames.get(name), init, isParam };
	});
	objectTypes[returnType].publicMethods = publicMethods.map((method) => ({
		name: method.name,
		functionExpression: method.functionExpression,
	}));
	objectTypes[returnType].privateClosures = privateClosureDeclarations.map(
		(statement) => {
			const declaration = statement.declarations[0];
			return {
				name: hoistedNames.get(declaration.id.name),
				functionExpression: declaration.init,
			};
		},
	);
};

export const transformClosureFactories = (ast, objectTypes) => {
	const factories = collectClosureFactories(ast, objectTypes);
	for (const factory of factories) {
		transformClosureFactory(ast, objectTypes, factory);
	}
	validateClosureFactoryConflicts(factories);
};
