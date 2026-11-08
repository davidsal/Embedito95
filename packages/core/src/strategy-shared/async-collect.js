import { check, collectReferencedNames } from "../checker/index.js";
import { AST_NODE } from "../constants.js";
import { tokenize } from "../lexer/index.js";
import { parse } from "../parser/index.js";
import { rebaseLines } from "./async-ast-utils.js";
import {
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
	inlineAsyncNames,
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
			inlineAsyncNames,
			asyncParams,
			variableTypes,
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
	inlineAsyncNames,
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

		importNodes.push(...collectLibraryImportNodes(library, declarations));
		const libraryHandles = desugarLibraryDeclarations(
			library,
			declarations,
			baseOffset,
			index,
			functionReturnTypes,
			asyncFunctionNames,
			inlineAsyncNames,
			asyncParams,
			library.variableTypes,
		);
		handles.push(...libraryHandles);
		index += libraryHandles.length;
	}

	return { handles, importNodes };
};
