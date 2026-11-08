import { AST_NODE, walk } from "embedito95-core";
import { buildAutoImportEdits } from "./auto-import.js";
import { KEYWORD_COMPLETIONS } from "./keyword-completions.js";

const WALK_SKIP_KEYS = ["typeAnnotation"];

const formatFunctionParameters = (parameters) => {
	return (parameters ?? []).map((parameter) => parameter.name).join(", ");
};

const formatLibraryCompletionDetail = (exportItem) => {
	if (exportItem.kind === "function") {
		const parameters = formatFunctionParameters(exportItem.params);
		return `(${parameters}) => ${exportItem.returnType ?? "void"}`;
	}

	return exportItem.type ?? "unknown";
};

const collectUserDeclarations = (syntaxTree) => {
	const userFunctions = [];
	const userVariables = [];

	walk(syntaxTree, {
		skipKeys: WALK_SKIP_KEYS,
		enter: (statement) => {
			if (statement.type !== AST_NODE.variableDeclaration) {
				return;
			}

			const name = statement.declarations[0]?.id?.name;

			if (!name) {
				return;
			}

			if (
				statement.declarations[0]?.init?.type === AST_NODE.functionExpression
			) {
				userFunctions.push({ label: name, kind: 3, detail: "function" });
			} else {
				userVariables.push({
					label: name,
					kind: 6,
					detail: statement.kind ?? "const",
				});
			}
		},
	});

	return [...userVariables, ...userFunctions];
};

const buildLibraryCompletionItems = (allExports, prefix, source) => {
	const normalizedPrefix = prefix.toLowerCase();

	return allExports
		.filter((exportItem) => {
			return exportItem.name.toLowerCase().startsWith(normalizedPrefix);
		})
		.map((exportItem) => {
			return {
				label: exportItem.name,
				kind: exportItem.kind === "function" ? 3 : 21,
				detail: `${exportItem.library} - ${formatLibraryCompletionDetail(exportItem)}`,
				insertText: exportItem.name,
				additionalTextEdits: buildAutoImportEdits(
					source,
					exportItem.library,
					exportItem.name,
				),
			};
		});
};

export const resolveDefaultCompletions = (context) => {
	const { syntaxTree, beforeCursor, allExports, source } = context;
	const prefix = beforeCursor.match(/[a-zA-Z_$][a-zA-Z0-9_$]*$/)?.[0];
	const libraryItems = prefix
		? buildLibraryCompletionItems(allExports, prefix, source)
		: [];

	return [
		...collectUserDeclarations(syntaxTree),
		...KEYWORD_COMPLETIONS,
		...libraryItems,
	];
};
