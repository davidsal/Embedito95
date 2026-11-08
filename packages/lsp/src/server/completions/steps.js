import { DATA_TYPE, STRING_METHODS } from "embedito95-core";
import { getImportSpecifiers, getLibraryName } from "../shared/libraries.js";
import { findEnclosingObjectType } from "./ast.js";
import { buildAutoImportEdits } from "./auto-import.js";
import {
	getEnumMembers,
	getTypeCompletions,
	getTypeMembers,
} from "./type-completions.js";

export const NOT_HANDLED = Symbol("notHandled");

const formatFunctionSignature = (parameters, returnType) => {
	const parameterNames = (parameters ?? [])
		.map((parameter) => parameter.name)
		.join(", ");
	return `(${parameterNames}) => ${returnType ?? "void"}`;
};

const buildMemberCompletionItems = (members, prefix) => {
	const filtered = prefix
		? members.filter((member) => member.name.toLowerCase().startsWith(prefix))
		: members;

	return filtered.map((member) => {
		if (member.kind === "method") {
			return {
				label: member.name,
				kind: 3,
				detail: formatFunctionSignature(member.params, member.returnType),
			};
		}

		return {
			label: member.name,
			kind: 6,
			detail: member.returnType ?? "unknown",
		};
	});
};

export const resolveImportExportsCompletions = (context) => {
	const { currentLineText, allExports } = context;

	if (
		!/^\s*import\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]?\s*$/.test(currentLineText)
	) {
		return NOT_HANDLED;
	}

	const libraryName = getLibraryName(currentLineText);
	const libraryExports = allExports.filter(
		(exportItem) => exportItem.library === libraryName,
	);

	if (libraryExports.length === 0) {
		return NOT_HANDLED;
	}

	const existing = getImportSpecifiers(currentLineText);

	return libraryExports
		.filter((exportItem) => !existing.includes(exportItem.name))
		.map((exportItem) => ({
			label: exportItem.name,
			kind: exportItem.kind === "function" ? 3 : 21,
			detail:
				exportItem.kind === "function"
					? formatFunctionSignature(exportItem.params, exportItem.returnType)
					: (exportItem.type ?? "unknown"),
		}));
};

export const resolveLibraryNameCompletions = (context) => {
	const { currentLineText, allExports } = context;

	if (!/^\s*import\s*\{[^}]*\}\s*from\s*/.test(currentLineText)) {
		return NOT_HANDLED;
	}

	const libraryNames = [
		...new Set(allExports.map((exportItem) => exportItem.library)),
	];

	return libraryNames.map((name) => ({ label: name, kind: 9 }));
};

export const resolveObjectLiteralMemberCompletions = (context) => {
	const { currentLineText, syntaxTree, allExports, beforeCursor, position } =
		context;

	if (currentLineText.trim().startsWith("//")) {
		return NOT_HANDLED;
	}

	const objectLiteralTypeName = findEnclosingObjectType(
		syntaxTree,
		position,
		true,
	);

	if (!objectLiteralTypeName) {
		return NOT_HANDLED;
	}

	const members = getTypeMembers(syntaxTree, objectLiteralTypeName, allExports);

	if (members.length === 0) {
		return NOT_HANDLED;
	}

	const objectPrefix = beforeCursor
		.match(/[a-zA-Z_$][a-zA-Z0-9_$]*$/)?.[0]
		?.toLowerCase();

	return buildMemberCompletionItems(members, objectPrefix);
};

export const resolveTypeCompletions = (context) => {
	const { currentLineText, syntaxTree, allExports, beforeCursor, platform } =
		context;

	if (currentLineText.trim().startsWith("//")) {
		return NOT_HANDLED;
	}

	const typePrefixMatch = beforeCursor.match(
		/(?::\s*|\bas\s+)([a-zA-Z_$][a-zA-Z0-9_$]*)?$/,
	);

	if (!typePrefixMatch) {
		return NOT_HANDLED;
	}

	return getTypeCompletions(
		syntaxTree,
		allExports,
		platform,
		typePrefixMatch[1] ?? "",
	);
};

export const resolveCallArgumentCompletions = (context) => {
	const { beforeCursor, allExports, source } = context;
	const callMatch = beforeCursor.match(
		/([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)$/,
	);

	if (!callMatch) {
		return NOT_HANDLED;
	}

	const functionName = callMatch[1];
	const argumentsText = callMatch[2];
	const argumentIndex =
		argumentsText === "" ? 0 : argumentsText.split(",").length - 1;
	const libraryFunction = allExports.find((exportItem) => {
		return exportItem.name === functionName && exportItem.kind === "function";
	});

	if (libraryFunction?.params?.[argumentIndex]) {
		const parameterType = libraryFunction.params[argumentIndex].type;

		if (parameterType?.includes(" | ")) {
			const memberTypes = parameterType
				.split(" | ")
				.map((memberType) => memberType.trim());

			return allExports
				.filter((exportItem) => memberTypes.includes(exportItem.name))
				.map((exportItem) => ({
					label: exportItem.name,
					kind: 21,
					detail: exportItem.type ?? "unknown",
					additionalTextEdits: buildAutoImportEdits(
						source,
						exportItem.library,
						exportItem.name,
					),
				}));
		}
	}

	return NOT_HANDLED;
};

export const resolveThisMemberCompletions = (context) => {
	const { beforeCursor, syntaxTree, allExports, position } = context;
	const thisMatch = beforeCursor.match(/this\.([a-zA-Z0-9_]*)$/);

	if (!thisMatch) {
		return NOT_HANDLED;
	}

	const objectTypeName = findEnclosingObjectType(syntaxTree, position);

	if (!objectTypeName) {
		return NOT_HANDLED;
	}

	const members = getTypeMembers(syntaxTree, objectTypeName, allExports);

	if (members.length === 0) {
		return NOT_HANDLED;
	}

	const prefix = thisMatch[1].toLowerCase();

	return buildMemberCompletionItems(members, prefix);
};

const buildTypeMethodCompletionItems = (typeMethods) => {
	return Object.entries(typeMethods).map(([name, method]) => {
		return {
			label: name,
			kind: 3,
			detail: formatFunctionSignature(method.params, method.returnType),
		};
	});
};

const buildStringMethodCompletionItems = (objectTypeName, prefix) => {
	if (objectTypeName !== DATA_TYPE.string) {
		return null;
	}

	const members = Object.entries(STRING_METHODS).filter(([name]) => {
		return !prefix || name.toLowerCase().startsWith(prefix);
	});

	if (members.length === 0) {
		return null;
	}

	return buildTypeMethodCompletionItems(Object.fromEntries(members));
};

const buildEnumMemberCompletionItems = (memberNames, allExports) => {
	return memberNames.map((name) => {
		const exportItem = allExports.find(
			(exportCandidate) => exportCandidate.name === name,
		);
		return {
			label: name,
			kind: 21,
			detail: exportItem?.type ?? "pin",
		};
	});
};

export const resolveDotMemberCompletions = (context) => {
	const { beforeCursor, allExports, platform, resolveNameType } = context;
	const dotMatch = beforeCursor.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)\.$/);

	if (!dotMatch) {
		return NOT_HANDLED;
	}

	const objectTypeName = resolveNameType
		? resolveNameType(dotMatch[1], null)
		: null;
	const stringCompletions = buildStringMethodCompletionItems(
		objectTypeName,
		"",
	);

	if (stringCompletions) {
		return stringCompletions;
	}

	const typeMethods = objectTypeName
		? allExports.objectTypes?.[objectTypeName]
		: null;

	if (typeMethods) {
		return buildTypeMethodCompletionItems(typeMethods);
	}

	const members = getEnumMembers(dotMatch[1], allExports, platform);

	if (members && members.length > 0) {
		return buildEnumMemberCompletionItems(members, allExports);
	}

	return NOT_HANDLED;
};

export const resolveDotPartialCompletions = (context) => {
	const { beforeCursor, allExports, platform, resolveNameType } = context;
	const dotPartialMatch = beforeCursor.match(
		/([a-zA-Z_$][a-zA-Z0-9_$]*)\.([a-zA-Z0-9_]*)$/,
	);

	if (!dotPartialMatch) {
		return NOT_HANDLED;
	}

	const objectTypeName = resolveNameType
		? resolveNameType(dotPartialMatch[1], null)
		: null;
	const stringCompletions = buildStringMethodCompletionItems(
		objectTypeName,
		dotPartialMatch[2].toLowerCase(),
	);

	if (stringCompletions) {
		return stringCompletions;
	}

	const typeMethods = objectTypeName
		? allExports.objectTypes?.[objectTypeName]
		: null;

	if (typeMethods) {
		const prefix = dotPartialMatch[2].toLowerCase();
		const filtered = prefix
			? Object.entries(typeMethods).filter(([name]) =>
					name.toLowerCase().startsWith(prefix),
				)
			: Object.entries(typeMethods);

		if (filtered.length > 0) {
			return filtered.map(([name, method]) => {
				return {
					label: name,
					kind: 3,
					detail: formatFunctionSignature(method.params, method.returnType),
				};
			});
		}
	}

	const typeName = dotPartialMatch[1];
	const prefix = dotPartialMatch[2].toLowerCase();
	const members = getEnumMembers(typeName, allExports, platform);

	if (members && members.length > 0) {
		const filtered = prefix
			? members.filter((name) => name.toLowerCase().startsWith(prefix))
			: members;

		if (filtered.length > 0) {
			return buildEnumMemberCompletionItems(filtered, allExports);
		}
	}

	return NOT_HANDLED;
};
