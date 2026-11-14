import {
	AST_NODE,
	collectLibraryModuleInfo,
	HEADER_EXTENSION,
	MODULE_PREFIX,
	parse,
	SOURCE_EXTENSION,
	shared,
	tokenize,
} from "embedito95-core";

const ASYNC_TASK_MODULE_NAME = "async_task";
const TYPE_LIBRARY_NAME = "type";

const collectImportedLibraryNames = (source) => {
	const { tokens } = tokenize(source);
	const { ast } = parse(tokens);
	const importedLibraryNames = new Set();

	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.importDeclaration) {
			continue;
		}
		importedLibraryNames.add(statement.source.split("/").pop());
	}

	return importedLibraryNames;
};

const collectMissingDependencies = (expanded, libraryModules) => {
	const missing = new Set();

	for (const name of expanded) {
		for (const dependency of libraryModules[name]?.dependencies ?? []) {
			if (!expanded.has(dependency)) {
				missing.add(dependency);
			}
		}
	}

	return missing;
};

const expandLibraryDependencies = (importedLibraryNames, libraryModules) => {
	const expanded = new Set(importedLibraryNames);
	const missing = collectMissingDependencies(expanded, libraryModules);

	if (missing.size === 0) {
		return expanded;
	}

	for (const dependency of missing) {
		expanded.add(dependency);
	}

	return expandLibraryDependencies(expanded, libraryModules);
};

const filterLibraryModules = (source, libraryModules) => {
	const importedLibraryNames = collectImportedLibraryNames(source);
	importedLibraryNames.add(TYPE_LIBRARY_NAME);
	const requiredNames = expandLibraryDependencies(
		importedLibraryNames,
		libraryModules,
	);
	const filtered = {};

	for (const [name, module] of Object.entries(libraryModules)) {
		if (requiredNames.has(name)) {
			filtered[name] = module;
		}
	}

	return filtered;
};

const isDeclarationStatement = (statement) => {
	if (
		statement.type === AST_NODE.enumDeclaration ||
		statement.type === AST_NODE.typeDeclaration
	) {
		return true;
	}
	if (statement.type !== AST_NODE.variableDeclaration) {
		return false;
	}

	return (statement.declarations ?? []).every((declarator) => {
		return declarator.init?.type !== AST_NODE.functionExpression;
	});
};

const isTaskItemFunction = (statement) => {
	if (statement.type !== AST_NODE.variableDeclaration) {
		return false;
	}

	return (statement.declarations ?? []).some((declarator) => {
		return (
			declarator.init?.returnType?.name === shared.ASYNC_TASK_ITEM_TYPE_NAME
		);
	});
};

const isAsyncHandlerFunction = (statement) => {
	if (statement.type !== AST_NODE.variableDeclaration) {
		return false;
	}

	return (statement.declarations ?? []).some((declarator) => {
		const name = declarator.id?.name;
		return (
			typeof name === "string" && name.endsWith(shared.ASYNC_HANDLER_SUFFIX)
		);
	});
};

const isEventLoopFunction = (statement) => {
	if (statement.type !== AST_NODE.variableDeclaration) {
		return false;
	}

	return (statement.declarations ?? []).some((declarator) => {
		return declarator.id?.name === shared.EVENT_LOOP_NAME;
	});
};

const isModuleStatement = (statement) => {
	return (
		statement.type === AST_NODE.importDeclaration ||
		isDeclarationStatement(statement) ||
		isTaskItemFunction(statement) ||
		isAsyncHandlerFunction(statement) ||
		isEventLoopFunction(statement)
	);
};

const statementSource = (statements, lines, index) => {
	const startLine = statements[index].loc.start.line - 1;
	const nextStatement = statements[index + 1];
	const endLine = nextStatement
		? nextStatement.loc.start.line - 1
		: lines.length;
	return lines.slice(startLine, endLine).join("\n").trimEnd();
};

const extractAsyncTaskModuleSource = (asyncSource) => {
	const lines = asyncSource.split("\n");
	const { tokens } = tokenize(asyncSource);
	const { ast } = parse(tokens);
	const indices = ast.body
		.map((statement, index) => (isModuleStatement(statement) ? index : -1))
		.filter((index) => index !== -1);

	if (indices.length === 0) {
		return null;
	}

	return indices
		.map((index) => statementSource(ast.body, lines, index))
		.join("\n\n");
};

export const compileAsyncTaskModule = (
	asyncSource,
	platform,
	libraryModules,
	libraryNamespaces = null,
	cycles = true,
) => {
	const moduleSource = extractAsyncTaskModuleSource(asyncSource);
	if (!moduleSource) {
		return null;
	}

	const namespace = `${MODULE_PREFIX}${ASYNC_TASK_MODULE_NAME}`;
	const moduleInfo = collectLibraryModuleInfo(
		moduleSource,
		ASYNC_TASK_MODULE_NAME,
	);
	const compiled = shared.compileProjectLibrary({
		source: moduleSource,
		sourceLines: moduleSource.split("\n"),
		platform,
		libraryModules: filterLibraryModules(asyncSource, libraryModules),
		libraryEnumInfo: moduleInfo.enumInfo
			? { [ASYNC_TASK_MODULE_NAME]: moduleInfo.enumInfo }
			: {},
		libraryNamespaces: {
			...(libraryNamespaces ?? {}),
			[ASYNC_TASK_MODULE_NAME]: namespace,
		},
		namespace,
		libraryGlobalsInSource: true,
		cycles,
		...shared.resolvePlatformRenderOptions(platform),
	});

	if (!compiled.header || !compiled.source) {
		return null;
	}

	return {
		directory: ASYNC_TASK_MODULE_NAME,
		namespace,
		moduleInfo,
		objectTypeInfo: compiled.objectTypeInfo,
		headerFileName: `${namespace}${HEADER_EXTENSION}`,
		sourceFileName: `${namespace}${SOURCE_EXTENSION}`,
		header: compiled.header,
		source: compiled.source,
	};
};
