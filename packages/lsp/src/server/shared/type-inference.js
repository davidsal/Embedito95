import {
	AST_NODE,
	DATA_TYPE,
	DEFAULT_WORD_SIZE,
	resolveNarrowedTypeAt,
	resolveOverloadSignature,
	resolveProjectTypes,
	resolveWordDataType,
} from "embedito95-core";

// Collects the method/field surface of every `type` declaration in the
// document, keyed by type name. It feeds the same `objectTypes` the checker
// receives so hovers and completions resolve member signatures from the
// inferred type instead of re-parsing the source.
export const collectLocalObjectTypes = (syntaxTree) => {
	const objectTypes = {};

	for (const statement of syntaxTree.body) {
		if (statement.type !== AST_NODE.typeDeclaration) {
			continue;
		}

		const methods = {};
		const fields = {};

		for (const member of statement.members) {
			if (member.kind === "method") {
				methods[member.name] = {
					params: member.params.map((parameter) => ({
						name: parameter.name,
						type: parameter.type ?? null,
					})),
					returnType: member.returnType ?? DATA_TYPE.void,
				};
			} else {
				fields[member.name] = {
					type: member.returnType ?? null,
					optional: Boolean(member.optional),
				};
			}
		}

		objectTypes[statement.name] = { methods, fields };
	}

	return objectTypes;
};

export const collectProjectObjectTypes = (syntaxTree, allExports) => {
	return {
		...(allExports.objectTypeDefinitions ?? {}),
		...collectLocalObjectTypes(syntaxTree),
	};
};

// Resolves an imported name to its library function export, reapplying the
// local import alias to match the export's original name. Hover needs the whole
// export (parameters included) when a function is bound as a value, not only its
// return type.
export const findLibraryFunctionExport = (name, allExports, importAliases) => {
	const originalName = importAliases?.get(name) ?? name;
	return (
		allExports?.find((exportItem) => {
			return exportItem.name === originalName && exportItem.kind === "function";
		}) ?? null
	);
};

// Resolves the concrete signature a library call selects. Hover uses it to show
// the width the checker picked, so the editor never reimplements the overload
// rule.
export const resolveLibraryCallSignature = (
	name,
	allExports,
	importAliases,
	argumentTypes = [],
	wordSize = 0,
) => {
	const libraryFunction = findLibraryFunctionExport(
		name,
		allExports,
		importAliases,
	);

	if (!libraryFunction) {
		return null;
	}
	return resolveOverloadSignature(
		{
			params: libraryFunction.params,
			returnType: libraryFunction.returnType,
			signatures: libraryFunction.signatures,
		},
		argumentTypes,
		wordSize,
	);
};

export const resolveLibraryReturnType = (
	name,
	allExports,
	importAliases,
	argumentTypes = [],
	wordSize = 0,
) => {
	const signature = resolveLibraryCallSignature(
		name,
		allExports,
		importAliases,
		argumentTypes,
		wordSize,
	);
	return signature?.returnType ?? null;
};

export const createLibraryCallTypeResolver = (
	allExports,
	importAliases,
	wordSize = 0,
) => {
	return (calleeName, argumentTypes = []) => {
		return resolveLibraryReturnType(
			calleeName,
			allExports,
			importAliases,
			argumentTypes,
			wordSize,
		);
	};
};

// Resolves the declared type of a library constant imported into the document,
// reapplying the local import alias to match the export's original name. It lets
// `resolveNameType` answer for names like `console` that live in the library
// surface, not in the project's local `variableTypes`.
export const resolveLibraryConstantType = (name, allExports, importAliases) => {
	const originalName = importAliases?.get(name) ?? name;
	const libraryConstant = allExports.find((exportItem) => {
		return exportItem.name === originalName && exportItem.kind === "constant";
	});

	return libraryConstant?.type ?? null;
};

export const createVariableTypeResolver = (
	variableTypes,
	allExports,
	importAliases,
	narrowingRegions = null,
) => {
	return (resolvedName, location) => {
		const variableType = narrowingRegions
			? resolveNarrowedTypeAt(
					variableTypes,
					narrowingRegions,
					resolvedName,
					location,
				)
			: variableTypes.resolve(resolvedName, location);

		return (
			variableType ??
			resolveLibraryConstantType(resolvedName, allExports, importAliases)
		);
	};
};

// Resolves the project's variable/return types with the exported core
// inference, the same pipeline `check()` runs. The language server must not
// reimplement it: doing so lets hover/completions drift from codegen.
export const buildProjectTypeInference = (options) => {
	const { syntaxTree, allExports, importAliases, platform, narrowingRegions } =
		options;
	const wordSize = platform?.specs?.wordSize ?? DEFAULT_WORD_SIZE;
	const wordType = resolveWordDataType(wordSize);
	const objectTypes = collectProjectObjectTypes(syntaxTree, allExports);
	const resolveLibraryCallType = createLibraryCallTypeResolver(
		allExports,
		importAliases,
		wordSize,
	);
	const { variableTypes, resolveCallType } = resolveProjectTypes(
		syntaxTree,
		wordType,
		resolveLibraryCallType,
		wordSize,
		objectTypes,
	);

	return {
		wordSize,
		wordType,
		objectTypes,
		variableTypes,
		resolveCallType,
		resolveNameType: createVariableTypeResolver(
			variableTypes,
			allExports,
			importAliases,
			narrowingRegions ?? null,
		),
	};
};
