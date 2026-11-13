import {
	AST_NODE,
	DATA_TYPE,
	DEFAULT_WORD_SIZE,
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

export const resolveLibraryReturnType = (name, allExports, importAliases) => {
	const originalName = importAliases?.get(name) ?? name;
	const libraryFunction = allExports.find((exportItem) => {
		return exportItem.name === originalName && exportItem.kind === "function";
	});

	return libraryFunction?.returnType ?? null;
};

export const createLibraryCallTypeResolver = (allExports, importAliases) => {
	return (calleeName) => {
		return resolveLibraryReturnType(calleeName, allExports, importAliases);
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
) => {
	return (resolvedName, location) => {
		return (
			variableTypes.resolve(resolvedName, location) ??
			resolveLibraryConstantType(resolvedName, allExports, importAliases)
		);
	};
};

// Resolves the project's variable/return types with the exported core
// inference, the same pipeline `check()` runs. The language server must not
// reimplement it: doing so lets hover/completions drift from codegen.
export const buildProjectTypeInference = (options) => {
	const { syntaxTree, allExports, importAliases, platform } = options;
	const wordSize = platform?.specs?.wordSize ?? DEFAULT_WORD_SIZE;
	const wordType = resolveWordDataType(wordSize);
	const objectTypes = collectProjectObjectTypes(syntaxTree, allExports);
	const resolveLibraryCallType = createLibraryCallTypeResolver(
		allExports,
		importAliases,
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
		),
	};
};
