import {
	ARRAY_METHODS,
	AST_NODE,
	DATA_TYPE,
	isAsyncTaskType,
	parseArrayType,
	resolveArrayMethod,
	resolveReceiverType,
	STRING_METHODS,
	unwrapAsyncTaskType,
} from "embedito95-core";
import { formatMethodParameterList } from "../hover/formatting.js";
import { getImportSpecifiers, getLibraryName } from "../shared/libraries.js";
import { findEnclosingObjectType } from "./ast.js";
import { buildAutoImportEdits } from "./auto-import.js";
import { findDotReceiver } from "./receivers.js";
import {
	getEnumMembers,
	getObjectTypeMembers,
	getTypeCompletions,
	getTypeMembers,
} from "./type-completions.js";

export const NOT_HANDLED = Symbol("notHandled");

const METHOD_COMPLETION_KIND = 3;
const FIELD_COMPLETION_KIND = 6;
const ENUM_MEMBER_COMPLETION_KIND = 21;
const DEFAULT_ENUM_MEMBER_DETAIL = "pin";
const ASYNC_TASK_VALUE_FIELD = "value";

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
				kind: METHOD_COMPLETION_KIND,
				detail: formatFunctionSignature(member.params, member.returnType),
			};
		}

		return {
			label: member.name,
			kind: FIELD_COMPLETION_KIND,
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

const buildTypeMethodCompletionItems = (typeMethods, prefix) => {
	const members = Object.entries(typeMethods).filter(([name]) => {
		return !prefix || name.toLowerCase().startsWith(prefix);
	});

	return members.map(([name, method]) => {
		return {
			label: name,
			kind: METHOD_COMPLETION_KIND,
			detail: formatFunctionSignature(method.params, method.returnType),
		};
	});
};

const buildStringMethodCompletionItems = (objectTypeName, prefix) => {
	if (objectTypeName !== DATA_TYPE.string) {
		return null;
	}

	const items = buildTypeMethodCompletionItems(STRING_METHODS, prefix);

	return items.length > 0 ? items : null;
};

const buildArrayMethodCompletionItems = (elementType, prefix) => {
	const members = Object.entries(ARRAY_METHODS).filter(([name]) => {
		return !prefix || name.toLowerCase().startsWith(prefix);
	});

	if (members.length === 0) {
		return null;
	}

	return members.map(([name]) => {
		const method = resolveArrayMethod(name, elementType);
		return {
			label: name,
			kind: METHOD_COMPLETION_KIND,
			detail: `(${formatMethodParameterList(method.params)}) => ${method.returnType}`,
		};
	});
};

const buildAsyncTaskValueCompletionItems = (typeName, prefix) => {
	if (prefix && !ASYNC_TASK_VALUE_FIELD.startsWith(prefix)) {
		return null;
	}

	return [
		{
			label: ASYNC_TASK_VALUE_FIELD,
			kind: FIELD_COMPLETION_KIND,
			detail: unwrapAsyncTaskType(typeName),
		},
	];
};

const buildObjectMemberCompletionItems = (typeName, prefix, objectTypes) => {
	const members = getObjectTypeMembers(objectTypes?.[typeName]);

	if (members.length === 0) {
		return null;
	}

	const items = buildMemberCompletionItems(members, prefix);
	return items.length > 0 ? items : null;
};

// Resolves the method/field surface of the receiver by category, so
// identifiers, literals and composite expressions share the same
// string/array/object lookup. Nullable receivers are narrowed by the resolver
// when the access sits inside a narrowing region; outside one, the wide union
// has no member surface.
const buildReceiverMemberCompletionItems = (
	objectTypeName,
	prefix,
	objectTypes,
) => {
	if (!objectTypeName) {
		return null;
	}

	const stringCompletions = buildStringMethodCompletionItems(
		objectTypeName,
		prefix,
	);

	if (stringCompletions) {
		return stringCompletions;
	}

	const arrayType = parseArrayType(objectTypeName);
	const arrayCompletions = arrayType
		? buildArrayMethodCompletionItems(arrayType.elementType, prefix)
		: null;

	if (arrayCompletions) {
		return arrayCompletions;
	}

	if (isAsyncTaskType(objectTypeName)) {
		return buildAsyncTaskValueCompletionItems(objectTypeName, prefix);
	}

	return buildObjectMemberCompletionItems(objectTypeName, prefix, objectTypes);
};

const buildEnumMemberCompletionItems = (memberNames, allExports) => {
	return memberNames.map((name) => {
		const exportItem = allExports.find(
			(exportCandidate) => exportCandidate.name === name,
		);
		return {
			label: name,
			kind: ENUM_MEMBER_COMPLETION_KIND,
			detail: exportItem?.type ?? DEFAULT_ENUM_MEMBER_DETAIL,
		};
	});
};

const resolveReceiverCompletionItems = (context, prefix) => {
	const {
		syntaxTree,
		beforeCursor,
		position,
		allExports,
		platform,
		resolveNameType,
		resolveCallType,
		wordSize,
		wordType,
		objectTypes,
	} = context;
	const dotReceiver = findDotReceiver(syntaxTree, beforeCursor, position);

	if (!dotReceiver) {
		return NOT_HANDLED;
	}

	const receiverType = resolveReceiverType(
		dotReceiver.receiverNode,
		resolveNameType,
		resolveCallType,
		wordSize,
		objectTypes,
		{ ast: syntaxTree, wordType },
	);
	const methodCompletions = buildReceiverMemberCompletionItems(
		receiverType,
		prefix,
		objectTypes,
	);

	if (methodCompletions) {
		return methodCompletions;
	}

	const receiverName =
		dotReceiver.receiverNode.type === AST_NODE.identifier
			? dotReceiver.receiverNode.name
			: null;

	if (!receiverName) {
		return NOT_HANDLED;
	}

	const members = getEnumMembers(receiverName, allExports, platform);

	if (!members || members.length === 0) {
		return NOT_HANDLED;
	}

	const filtered = prefix
		? members.filter((name) => name.toLowerCase().startsWith(prefix))
		: members;

	if (filtered.length === 0) {
		return NOT_HANDLED;
	}

	return buildEnumMemberCompletionItems(filtered, allExports);
};

export const resolveDotMemberCompletions = (context) => {
	if (!context.beforeCursor.endsWith(".")) {
		return NOT_HANDLED;
	}

	return resolveReceiverCompletionItems(context, "");
};

export const resolveDotPartialCompletions = (context) => {
	const dotReceiver = findDotReceiver(
		context.syntaxTree,
		context.beforeCursor,
		context.position,
	);

	if (!dotReceiver) {
		return NOT_HANDLED;
	}

	return resolveReceiverCompletionItems(context, dotReceiver.prefix);
};
