import { decodeObjectShape, isObjectShapeType } from "../checker/index.js";
import { AST_NODE } from "../constants.js";
import { tokenize } from "../lexer/index.js";
import { parse } from "../parser/index.js";
import { rebaseLines } from "./async-ast-utils.js";
import { findTypeInsertionIndex } from "./async-declarations.js";
import { ASYNC_TYPE_SOURCE } from "./async-task-types.js";

const STARTING_SUFFIX = 1;

const findAvailableName = (base, usedNames, suffix) => {
	const candidate = suffix === null ? base : `${base}${suffix}`;
	if (!usedNames.has(candidate)) {
		return candidate;
	}
	return findAvailableName(
		base,
		usedNames,
		suffix === null ? STARTING_SUFFIX : suffix + 1,
	);
};

const collectTypeNames = (ast) => {
	const names = new Set();
	for (const statement of ast.body) {
		if (statement.type === AST_NODE.typeDeclaration) {
			names.add(statement.name);
		}
	}
	return names;
};

const buildAliasMembers = (shapeType) => {
	const fields = decodeObjectShape(shapeType) ?? {};
	return Object.entries(fields).map(([name, definition]) => {
		return {
			name,
			type: definition.type,
			optional: Boolean(definition.optional),
			isParam: false,
		};
	});
};

// An async helper with an inferred object return has no `: Type` annotation.
// Left as an anonymous shape its synthesized struct is named after the generated
// `_<name>AsyncAdd` wrapper, which hides the user-facing helper name. Reserve a
// stable `_<name>Return` alias for the shape (the `_` prefix matches every other
// synthesized name, so it cannot collide with user types) and use it in every
// entry function that returns that shape: the task payload, the hoisted local
// and a sync helper's own return declaration must all reference the SAME named
// struct, or assigning one to the other fails to compile. A user type with the
// same name is skipped by `findAvailableName`, which appends a numeric suffix.
export const applyAsyncReturnAliases = (
	ast,
	entryFunctions,
	entryAsyncNames,
	returnTypes,
) => {
	const usedNames = collectTypeNames(ast);
	const asyncShapes = new Set();
	for (const name of entryAsyncNames) {
		const returnType = returnTypes[name];
		if (isObjectShapeType(returnType)) {
			asyncShapes.add(returnType);
		}
	}

	const aliasByShape = new Map();
	const aliases = [];
	for (const { name } of entryFunctions) {
		const returnType = returnTypes[name];
		if (!asyncShapes.has(returnType) || aliasByShape.has(returnType)) {
			continue;
		}
		const alias = findAvailableName(`_${name}Return`, usedNames, null);
		usedNames.add(alias);
		aliasByShape.set(returnType, alias);
		aliases.push({ name: alias, shapeType: returnType });
	}

	const aliasedReturnTypes = { ...returnTypes };
	if (aliases.length === 0) {
		return { aliases, returnTypes: aliasedReturnTypes };
	}

	for (const { name, init } of entryFunctions) {
		const alias = aliasByShape.get(returnTypes[name]);
		if (!alias) {
			continue;
		}
		aliasedReturnTypes[name] = alias;
		// A sync helper keeps its declaration; pin its return type to the alias
		// so codegen emits the same `Object<Alias>` the task fields use.
		if (init && init.async !== true) {
			init.returnType = { ...(init.returnType ?? {}), name: alias };
		}
	}

	return { aliases, returnTypes: aliasedReturnTypes };
};

export const insertReturnAliasTypes = (ast, aliases, lineOffset) => {
	if (aliases.length === 0) {
		return;
	}
	const nodes = aliases.map(({ name, shapeType }) => {
		const source = ASYNC_TYPE_SOURCE(name, buildAliasMembers(shapeType));
		const { tokens } = tokenize(source);
		const { ast: aliasAst } = parse(tokens);
		const [node] = aliasAst.body;
		rebaseLines(node, lineOffset);
		return node;
	});
	const insertIndex = findTypeInsertionIndex(ast);
	ast.body.splice(insertIndex, 0, ...nodes);
};
