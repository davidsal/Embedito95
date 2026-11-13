import { walk } from "../checker/index.js";
import { AST_NODE } from "../constants.js";
import { format } from "../formatter/index.js";
import { tokenize } from "../lexer/index.js";
import { parse } from "../parser/index.js";
import { rebaseLines } from "./async-ast-utils.js";
import { rewriteAsyncCalls } from "./async-call-rewrite.js";
import {
	collectAsyncFunctionNames,
	collectAsyncParams,
	collectImportedNames,
	collectImportedSet,
	collectLibraryAsync,
	collectLocalReturnTypes,
	collectObjectTypes,
	parseLibraries,
} from "./async-collect.js";
import {
	ASYNC_ADD_SUFFIX,
	ASYNC_INTERMEDIATE_IMPORT_SOURCE,
	ASYNC_TYPE_LINE_OFFSET,
	INLINE_ASYNC_FUNCTION_NAMES,
	SYNTHESIZED_LINE_OFFSET,
	SYNTHESIZED_STRIDE,
	toAsyncTypeName,
	toHandlerFunctionName,
} from "./async-constants.js";
import {
	buildAddStatements,
	findTypeInsertionIndex,
	injectAsyncDeclarations,
} from "./async-declarations.js";
import { desugarAsyncFunction } from "./async-desugar-function.js";
import { injectEventLoop, injectTaskQueue } from "./async-event-loop.js";
import {
	collectDeclaredNames,
	insertImport,
	markExports,
	partitionImports,
	resolveNeededNames,
} from "./async-import-partition.js";
import { pruneUnusedImports } from "./async-imports.js";
import { mergeLibraryImports } from "./async-imports-merge.js";
import {
	formatAsyncIntermediate,
	formatMainIntermediate,
} from "./async-spacing.js";

export const containsAsyncUsage = (ast) => {
	let found = false;

	walk(ast, {
		enter: (node) => {
			if (found) {
				return;
			}
			if (
				node.type === AST_NODE.awaitExpression ||
				(node.type === AST_NODE.functionExpression && node.async === true)
			) {
				found = true;
			}
		},
	});

	return found;
};

const desugarEntryAsyncFunctions = (
	ast,
	sourceLineCount,
	source,
	functionReturnTypes,
	asyncFunctionNames,
	inlineAsyncNames,
	asyncParams,
	variableTypes,
) => {
	const handles = [];

	for (const [statementIndex, statement] of ast.body.entries()) {
		if (statement.type !== AST_NODE.variableDeclaration) {
			continue;
		}
		const declarator = statement.declarations?.[0];
		const name = declarator?.id?.name;
		const init = declarator?.init;

		if (
			!name ||
			init?.type !== AST_NODE.functionExpression ||
			init.async !== true
		) {
			continue;
		}

		const offset =
			sourceLineCount +
			SYNTHESIZED_LINE_OFFSET +
			statementIndex * SYNTHESIZED_STRIDE;
		const handleName = toHandlerFunctionName(name);
		const typeName = toAsyncTypeName(name);
		const desugared = desugarAsyncFunction(
			handleName,
			typeName,
			init,
			source,
			functionReturnTypes,
			asyncFunctionNames,
			inlineAsyncNames,
			asyncParams,
			variableTypes,
		);

		declarator.id.name = handleName;

		if (desugared.statement) {
			rebaseLines(desugared.statement, offset);
			declarator.init = desugared.statement.declarations[0].init;
		} else {
			init.async = false;
		}

		handles.push({
			statement,
			name,
			typeName,
			offset,
			fields: desugared.fields,
			params: desugared.params,
			childNames: desugared.childNames,
			childType: desugared.childType,
		});
	}

	return handles;
};

const insertLibraryHandles = (ast, handles, libraryHandles, importNodes) => {
	if (libraryHandles.length === 0) {
		return;
	}

	mergeLibraryImports(ast, importNodes);

	const lastHandle = handles[handles.length - 1];
	const insertIndex = lastHandle
		? ast.body.indexOf(lastHandle.statement) + 1
		: findTypeInsertionIndex(ast);
	ast.body.splice(
		insertIndex,
		0,
		...libraryHandles.map((handle) => {
			return handle.statement;
		}),
	);
};

const insertAddStatements = (ast, allHandles, addStatements) => {
	if (addStatements.length === 0) {
		return;
	}

	const firstHandle = allHandles[0]?.statement;
	const addIndex = firstHandle
		? ast.body.indexOf(firstHandle)
		: findTypeInsertionIndex(ast);
	ast.body.splice(addIndex, 0, ...addStatements);
};

const lowerAsyncFunctions = (
	ast,
	source,
	librarySources = [],
	functionReturnTypes = {},
	variableTypes = null,
	libraryTypeContext = null,
) => {
	const synthesizedComments = [];
	const sourceLineCount = source.split("\n").length;
	const libraries = parseLibraries(librarySources, libraryTypeContext);
	const imported = collectImportedSet(libraries, collectImportedNames(ast));
	const asyncFunctionNames = collectAsyncFunctionNames(
		ast,
		libraries,
		imported,
	);
	const returnTypes = {
		...functionReturnTypes,
		...collectLocalReturnTypes(ast),
	};
	const objectTypes = collectObjectTypes([
		ast,
		...libraries.map((library) => {
			return library.ast;
		}),
	]);
	const inlineAsyncNames = new Set(
		[...INLINE_ASYNC_FUNCTION_NAMES].filter((name) => {
			return asyncFunctionNames.has(name);
		}),
	);
	const asyncParams = collectAsyncParams(ast, libraries, imported);
	const handles = desugarEntryAsyncFunctions(
		ast,
		sourceLineCount,
		source,
		returnTypes,
		asyncFunctionNames,
		inlineAsyncNames,
		asyncParams,
		variableTypes,
	);

	const { handles: libraryHandles, importNodes } = collectLibraryAsync(
		libraries,
		sourceLineCount + ASYNC_TYPE_LINE_OFFSET,
		imported,
		returnTypes,
		asyncFunctionNames,
		inlineAsyncNames,
		asyncParams,
	);

	insertLibraryHandles(ast, handles, libraryHandles, importNodes);

	const allHandles = [...handles, ...libraryHandles];

	rewriteAsyncCalls(
		ast,
		new Map(
			allHandles.map((handle) => {
				return [handle.name, handle.params];
			}),
		),
	);

	const addStatements = buildAddStatements(
		allHandles,
		synthesizedComments,
		sourceLineCount,
		objectTypes,
	);

	insertAddStatements(ast, allHandles, addStatements);
	const declarations = injectAsyncDeclarations(
		ast,
		allHandles,
		sourceLineCount,
	);
	const taskQueueNodes = injectTaskQueue(
		ast,
		allHandles,
		sourceLineCount,
		declarations.insertIndex,
	);
	// The entry task types and wrappers stay in the entry module so their fields
	// can reference entry object types by name (the async module cannot import
	// entry types). Only the library ones and the shared runtime machinery live
	// in the async module.
	const entryTypeNames = new Set(
		handles.map((handle) => {
			return handle.typeName;
		}),
	);
	const entryWrapperNames = new Set(
		handles.map((handle) => {
			return `_${handle.name}${ASYNC_ADD_SUFFIX}`;
		}),
	);
	const asyncNodes = new Set([
		...declarations.nodes.filter((node) => {
			return !(
				node.type === AST_NODE.typeDeclaration && entryTypeNames.has(node.name)
			);
		}),
		...addStatements.filter((statement) => {
			return !entryWrapperNames.has(statement.declarations?.[0]?.id?.name);
		}),
		...taskQueueNodes,
		...libraryHandles.map((handle) => {
			return handle.statement;
		}),
	]);

	return {
		synthesizedComments,
		entryHandles: handles,
		libraryHandles,
		asyncNodes,
	};
};

export const buildAsyncIntermediate = (
	source,
	librarySources = [],
	functionReturnTypes = {},
	variableTypes = null,
	libraryTypeContext = null,
	options = {},
) => {
	const { tokens } = tokenize(source);
	const { ast } = parse(tokens);

	if (!containsAsyncUsage(ast)) {
		return { main: format(ast, [], source), async: null };
	}

	const { synthesizedComments, entryHandles, libraryHandles, asyncNodes } =
		lowerAsyncFunctions(
			ast,
			source,
			librarySources,
			functionReturnTypes,
			variableTypes,
			libraryTypeContext,
		);

	for (const node of injectEventLoop(
		ast,
		entryHandles,
		libraryHandles,
		options,
	)) {
		asyncNodes.add(node);
	}

	pruneUnusedImports(ast);

	const asyncBody = ast.body.filter((statement) => asyncNodes.has(statement));
	const mainProgram = {
		...ast,
		body: ast.body.filter((statement) => !asyncNodes.has(statement)),
	};
	const asyncProgram = { ...ast, body: asyncBody };

	partitionImports(asyncProgram, mainProgram);

	const exportedNames = resolveNeededNames(
		collectDeclaredNames(asyncBody),
		mainProgram,
	);
	insertImport(mainProgram, exportedNames, ASYNC_INTERMEDIATE_IMPORT_SOURCE);
	markExports(asyncBody, exportedNames);

	return {
		main: formatMainIntermediate(mainProgram, source),
		async:
			asyncBody.length > 0
				? formatAsyncIntermediate(asyncProgram, synthesizedComments, source)
				: null,
	};
};
