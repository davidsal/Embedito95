import {
	check,
	collectReferencedNames,
	getImportEffectiveName,
} from "../checker/index.js";
import { AST_NODE } from "../constants.js";
import { tokenize } from "../lexer/index.js";
import { parse } from "../parser/index.js";
import { rebaseLines } from "./async-ast-utils.js";
import {
	INLINE_ASYNC_FUNCTION_NAMES,
	INLINE_ASYNC_MODULE_SOURCE,
	SYNTHESIZED_STRIDE,
	toAsyncTypeName,
	toHandlerFunctionName,
} from "./async-constants.js";
import { desugarAsyncFunction } from "./async-desugar-function.js";

export const collectAsyncDeclarations = (ast, source) => {
	const declarations = [];

	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.variableDeclaration) {
			continue;
		}
		const declarator = statement.declarations?.[0];
		const init = declarator?.init;

		if (
			!declarator?.id?.name ||
			init?.type !== AST_NODE.functionExpression ||
			init.async !== true
		) {
			continue;
		}

		declarations.push({ declarator, init, name: declarator.id.name, source });
	}

	return declarations;
};

export const collectImportedNames = (ast) => {
	const names = new Set();

	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.importDeclaration) {
			continue;
		}
		for (const specifier of statement.specifiers ?? []) {
			names.add(specifier.name);
		}
	}

	return names;
};

// Resolves, per module, which local timer name refers to a core timer. Only
// imports from `@embedito95/async` whose ORIGINAL name is a known core timer
// contribute; the map key is the local name (the alias, or the name itself) and
// the value is the canonical timer name. A local async declaration of the same
// module always wins: it shadows the import and is never inlined.
export const collectInlineTimers = (ast, localAsyncNames = new Set()) => {
	const inlineTimers = new Map();

	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.importDeclaration) {
			continue;
		}
		if (statement.source !== INLINE_ASYNC_MODULE_SOURCE) {
			continue;
		}
		for (const specifier of statement.specifiers ?? []) {
			if (!INLINE_ASYNC_FUNCTION_NAMES.has(specifier.name)) {
				continue;
			}
			const localName = getImportEffectiveName(specifier);
			if (localAsyncNames.has(localName)) {
				continue;
			}
			inlineTimers.set(localName, specifier.name);
		}
	}

	return inlineTimers;
};

const resolveForwardedTimer = (functionNode, inlineTimers) => {
	const body = functionNode.body?.body;
	if (!Array.isArray(body) || body.length !== 1) {
		return null;
	}
	const statement = body[0];
	if (statement.type !== AST_NODE.expressionStatement) {
		return null;
	}
	const expression = statement.expression;
	if (expression?.type !== AST_NODE.awaitExpression) {
		return null;
	}
	const call = expression.argument;
	if (
		call?.type !== AST_NODE.callExpression ||
		call.callee?.type !== AST_NODE.identifier
	) {
		return null;
	}
	const timer = inlineTimers.get(call.callee.name);
	if (!timer) {
		return null;
	}
	const params = functionNode.params ?? [];
	if (params.length !== 1 || params[0].defaultValue) {
		return null;
	}
	const parameterName = params[0].name;
	const args = call.arguments ?? [];
	if (args.length !== 1) {
		return null;
	}
	const forwarded = args[0];
	if (
		forwarded.type !== AST_NODE.identifier ||
		forwarded.name !== parameterName
	) {
		return null;
	}
	return timer;
};

// Wrappers whose whole body is a single `await sleep(param)` /
// `await sleepMicros(param)` that forwards its only parameter. A call to one of
// them is inlined into the caller's task exactly like a direct timer await, so
// no child task is spawned for the wrapper. Any other shape (more statements, a
// transformed or defaulted parameter, a local `sleep` that is not the core
// timer) keeps the regular child-task lowering.
export const collectInlineWrappers = (ast, inlineTimers) => {
	const wrappers = new Map();

	for (const declaration of collectAsyncDeclarations(ast, "")) {
		// A declaration named like the core timer is a user shadow, never a
		// wrapper of it.
		if (INLINE_ASYNC_FUNCTION_NAMES.has(declaration.name)) {
			continue;
		}
		const timer = resolveForwardedTimer(declaration.init, inlineTimers);
		if (timer) {
			wrappers.set(declaration.name, timer);
		}
	}

	return wrappers;
};

// A library lives in its own project, so it gets its own checker run: the
// target word size (AVR 16, STM32 32) and the shared library metadata shape the
// inferred locals exactly as they do for the entry module.
export const parseLibraries = (librarySources, libraryTypeContext = null) => {
	return librarySources.map((librarySource) => {
		const { tokens } = tokenize(librarySource);
		const { ast, comments } = parse(tokens);
		const variableTypes = libraryTypeContext
			? check(ast, {
					...libraryTypeContext.libraries,
					isLibrary: true,
					isEntry: false,
					comments,
					source: librarySource,
					wordSize: libraryTypeContext.wordSize,
					platformTypes: libraryTypeContext.platformTypes,
				}).variableTypes
			: null;
		return { source: librarySource, ast, variableTypes };
	});
};

export const collectImportedSet = (libraries, importedNames) => {
	const imported = new Set(importedNames);

	for (const library of libraries) {
		for (const name of collectImportedNames(library.ast)) {
			imported.add(name);
		}
	}

	return imported;
};

// Names of every async function reachable from the entry (its own declarations
// plus the imported library ones). The lowering uses it to tell an actual
// `await f()` child task from `await g()` on a plain sync function, which must
// just call `g()`.
export const collectAsyncFunctionNames = (ast, libraries, imported) => {
	const names = new Set(
		collectAsyncDeclarations(ast, "").map((declaration) => {
			return declaration.name;
		}),
	);

	for (const library of libraries) {
		for (const declaration of collectAsyncDeclarations(
			library.ast,
			library.source,
		)) {
			if (imported.has(declaration.name)) {
				names.add(declaration.name);
			}
		}
	}

	return names;
};

// Parameters (with their default values) of every async function reachable
// from the entry. The lowering uses them to fill omitted trailing arguments
// before appending the child flag.
export const collectAsyncParams = (ast, libraries, imported) => {
	const params = new Map();

	for (const declaration of collectAsyncDeclarations(ast, "")) {
		params.set(declaration.name, declaration.init.params ?? []);
	}

	for (const library of libraries) {
		for (const declaration of collectAsyncDeclarations(
			library.ast,
			library.source,
		)) {
			if (imported.has(declaration.name)) {
				params.set(declaration.name, declaration.init.params ?? []);
			}
		}
	}

	return params;
};

// Declared return types of every local function (sync and async), merged into
// the library function return types so a hoisted local (`const x = f()` /
// `const x = await f()`) resolves to the real type instead of the `i32`
// default. Entry object types resolve because the entry task types are emitted
// in the entry module.
export const collectLocalReturnTypes = (ast) => {
	const returnTypes = {};

	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.variableDeclaration) {
			continue;
		}
		for (const declarator of statement.declarations ?? []) {
			const init = declarator?.init;
			if (
				!declarator?.id?.name ||
				init?.type !== AST_NODE.functionExpression ||
				!init.returnType?.name
			) {
				continue;
			}
			returnTypes[declarator.id.name] = init.returnType.name;
		}
	}

	return returnTypes;
};

// Object type declarations (name -> field definitions) across the given ASTs.
// Used to seed a hoisted object-typed local's wrapper field with a valid
// default literal (`{ x: 0, y: 0 }`) instead of the scalar `0`.
export const collectObjectTypes = (asts) => {
	const objectTypes = {};

	for (const ast of asts) {
		for (const statement of ast.body) {
			if (statement.type !== AST_NODE.typeDeclaration) {
				continue;
			}
			const fields = {};
			for (const member of statement.members ?? []) {
				if (member.kind === "method") {
					continue;
				}
				fields[member.name] = {
					type: member.returnType,
					optional: member.optional,
				};
			}
			objectTypes[statement.name] = { fields };
		}
	}

	return objectTypes;
};

const filterImportedDeclarations = (library, imported) => {
	return collectAsyncDeclarations(library.ast, library.source).filter(
		(declaration) => {
			return imported.has(declaration.name);
		},
	);
};

const collectLibraryImportNodes = (library, declarations) => {
	const referenced = new Set();

	for (const declaration of declarations) {
		for (const name of collectReferencedNames(declaration.init)) {
			referenced.add(name);
		}
	}

	const importNodes = [];

	for (const statement of library.ast.body) {
		if (statement.type !== AST_NODE.importDeclaration) {
			continue;
		}
		const specifiers = (statement.specifiers ?? []).filter((specifier) => {
			return referenced.has(specifier.name);
		});
		if (specifiers.length === 0) {
			continue;
		}
		importNodes.push({ ...statement, specifiers });
	}

	return importNodes;
};

const desugarLibraryDeclarations = (
	library,
	declarations,
	baseOffset,
	startIndex,
	functionReturnTypes,
	asyncFunctionNames,
	inlineTimers,
	inlineWrappers,
	asyncParams,
	variableTypes,
) => {
	const handles = [];
	let index = startIndex;

	for (const declaration of declarations) {
		const offset = baseOffset + index * SYNTHESIZED_STRIDE;
		const handleName = toHandlerFunctionName(declaration.name);
		const typeName = toAsyncTypeName(declaration.name);
		const desugared = desugarAsyncFunction(
			handleName,
			typeName,
			declaration.init,
			library.source,
			functionReturnTypes,
			asyncFunctionNames,
			inlineTimers,
			inlineWrappers,
			asyncParams,
			variableTypes,
			functionReturnTypes?.[declaration.name] ?? null,
		);

		if (!desugared.statement) {
			continue;
		}

		rebaseLines(desugared.statement, offset);
		handles.push({
			statement: desugared.statement,
			name: declaration.name,
			typeName,
			offset,
			fields: desugared.fields,
			params: desugared.params,
			childNames: desugared.childNames,
			childType: desugared.childType,
		});
		index += 1;
	}

	return handles;
};

export const collectLibraryAsync = (
	libraries,
	baseOffset,
	imported,
	functionReturnTypes,
	asyncFunctionNames,
	asyncParams,
) => {
	const handles = [];
	const importNodes = [];
	let index = 0;

	for (const library of libraries) {
		const declarations = filterImportedDeclarations(library, imported);

		if (declarations.length === 0) {
			continue;
		}

		const libraryDeclarations = collectAsyncDeclarations(
			library.ast,
			library.source,
		);
		const inlineTimers = collectInlineTimers(
			library.ast,
			new Set(
				libraryDeclarations.map((declaration) => {
					return declaration.name;
				}),
			),
		);
		const inlineWrappers = collectInlineWrappers(library.ast, inlineTimers);

		importNodes.push(...collectLibraryImportNodes(library, declarations));
		const libraryHandles = desugarLibraryDeclarations(
			library,
			declarations,
			baseOffset,
			index,
			functionReturnTypes,
			asyncFunctionNames,
			inlineTimers,
			inlineWrappers,
			asyncParams,
			library.variableTypes,
		);
		handles.push(...libraryHandles);
		index += libraryHandles.length;
	}

	return { handles, importNodes };
};
