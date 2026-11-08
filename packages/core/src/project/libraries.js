import { buildTypeDeclarationMembers } from "../checker/declarations.js";
import {
	inferLiteralType,
	resolveFloatType,
	resolveIntegerType,
} from "../checker/index.js";
import { AST_NODE, DATA_TYPE, QUOTE_SINGLE, UNKNOWN } from "../constants.js";
import { tokenize } from "../lexer/index.js";
import { parse } from "../parser/index.js";

export const sanitizeNamespace = (name) => {
	return name.replace(/[^A-Za-z0-9_]/g, "_");
};

const inferType = (node) => {
	if (node?.type === AST_NODE.arrayLiteral) {
		const elementType = inferType(node.elements?.[0]);
		return elementType ? `${elementType}[]` : null;
	}

	if (node?.type !== AST_NODE.literal) {
		return null;
	}

	const value = node.value;

	if (value === null) {
		return null;
	}
	if (typeof value === "string" && node.quote) {
		return node.quote === QUOTE_SINGLE ? DATA_TYPE.char : DATA_TYPE.string;
	}

	return inferLiteralType(value);
};

const DOC_COMMENT_START = "/**";
const RANGE_ANNOTATION_PATTERN =
	/^\s*\*\s*@range\s+(\w+)\s+(-?\d+)\s+(-?\d+)\s*$/;
const ALLOWED_VALUES_COMMENT_PATTERN =
	/^\/\/\s*e95\.allowedValues\s+(\w+)\s+(\w+)\s+(.+?)\s*$/;
const VALUE_LIST_SEPARATOR = ",";

const countCommentLines = (comment) => {
	return comment.value.match(/\n/g)?.length ?? 0;
};

const findDocCommentBefore = (comments, statementLine) => {
	for (let index = comments.length - 1; index >= 0; index--) {
		const comment = comments[index];
		if (!comment.value.startsWith(DOC_COMMENT_START)) {
			continue;
		}
		const endLine = comment.line + countCommentLines(comment);
		if (endLine === statementLine - 1) {
			return comment.value;
		}
	}
	return null;
};

const applyParameterRange = (method, paramName, minimum, maximum) => {
	const param = method?.params?.find((candidate) => {
		return candidate.name === paramName;
	});
	if (!param) {
		return;
	}
	param.minimum = minimum;
	param.maximum = maximum;
};

const applyParameterRanges = (method, docComment) => {
	for (const line of docComment.split("\n")) {
		const match = line.match(RANGE_ANNOTATION_PATTERN);
		if (!match) {
			continue;
		}
		applyParameterRange(method, match[1], Number(match[2]), Number(match[3]));
	}
};

const applyParameterAllowedValues = (method, paramName, serializedValues) => {
	const param = method?.params?.find((candidate) => {
		return candidate.name === paramName;
	});
	if (!param) {
		return;
	}
	param.allowedValues = serializedValues
		.split(VALUE_LIST_SEPARATOR)
		.map((value) => {
			return value.trim();
		})
		.filter((value) => {
			return value.length > 0;
		});
};

const applyAllowedValuesComments = (functions, comments) => {
	for (const comment of comments) {
		const match = comment.value.trim().match(ALLOWED_VALUES_COMMENT_PATTERN);
		if (!match) {
			continue;
		}
		applyParameterAllowedValues(functions[match[1]], match[2], match[3]);
	}
};

const applyTypeMemberRanges = (members, methods, comments) => {
	if (!comments || comments.length === 0) {
		return;
	}
	for (const member of members) {
		if (member.kind !== "method") {
			continue;
		}
		const docComment = findDocCommentBefore(comments, member.loc?.start?.line);
		if (docComment) {
			applyParameterRanges(methods[member.name], docComment);
		}
	}
};

const computeEnumType = (members) => {
	let min = null;
	let max = null;
	let isFloat = false;
	let kind = null;

	for (const member of members) {
		const value = member.value?.value;

		if (value === undefined || value === null) {
			continue;
		}
		if (kind === null) {
			kind = typeof value;
		} else if (typeof value !== kind) {
			return null;
		}

		if (typeof value === "number") {
			if (min === null) {
				min = value;
				max = value;
			} else {
				min = Math.min(min, value);
				max = Math.max(max, value);
			}
			if (!Number.isInteger(value)) {
				isFloat = true;
			}
		}
	}

	if (kind === "number" && min !== null) {
		if (isFloat) {
			return resolveFloatType(max);
		}
		return resolveIntegerType(min, max);
	}
	if (kind) {
		return inferType(members[0]?.value);
	}
	if (members.length > 0) {
		return DATA_TYPE.u8;
	}
	return null;
};

const processTypeDeclaration = (
	statement,
	packageName,
	exportNames,
	libraryObjectTypes,
	comments,
) => {
	exportNames.push(statement.name);

	if (!libraryObjectTypes[packageName]) {
		libraryObjectTypes[packageName] = {};
	}

	const { methods, fields } = buildTypeDeclarationMembers(statement.members);
	applyTypeMemberRanges(statement.members, methods, comments);

	libraryObjectTypes[packageName][statement.name] = {
		methods,
		fields,
	};
};

const processVariableDeclaration = (
	statement,
	packageName,
	exportNames,
	functions,
	types,
	libraryEnumInfo,
) => {
	const declaration = statement.declarations?.[0];

	if (!declaration?.id?.name) {
		return;
	}

	const name = declaration.id.name;
	exportNames.push(name);

	if (declaration.init?.type === AST_NODE.functionExpression) {
		functions[name] = {
			params: declaration.init.params.map((param) => ({
				name: param.name,
				type: param.typeAnnotation?.type ?? null,
				defaultValue: param.defaultValue ?? null,
			})),
			returnType: declaration.init.returnType?.name ?? DATA_TYPE.void,
		};
	} else {
		const enumInfo = libraryEnumInfo[packageName];
		const isEnumMemberInit =
			declaration.init?.type === AST_NODE.memberExpression &&
			enumInfo?.members?.[declaration.init.property?.name];

		types[name] =
			declaration.id.typeAnnotation?.type ??
			(isEnumMemberInit
				? enumInfo.members[declaration.init.property.name]
				: (inferType(declaration.init) ?? UNKNOWN));
	}
};

const processEnumDeclaration = (
	statement,
	packageName,
	exportNames,
	types,
	libraryEnumInfo,
) => {
	const enumType = computeEnumType(statement.members) ?? UNKNOWN;

	types[statement.name] = enumType;
	exportNames.push(statement.name);

	if (!libraryEnumInfo[packageName]) {
		libraryEnumInfo[packageName] = {
			typeNames: new Set(),
			members: {},
			declarations: {},
			types: {},
		};
	}

	const enumTypesList = libraryEnumInfo[packageName];

	enumTypesList.typeNames.add(statement.name);
	enumTypesList.types[statement.name] = enumType;
	enumTypesList.declarations[statement.name] = statement.members.map(
		(member) => {
			return {
				name: member.name,
				value: member.value?.value ?? null,
			};
		},
	);

	for (const member of statement.members) {
		enumTypesList.members[member.name] = statement.name;
	}
};

export const processLibraryAST = (
	ast,
	packageName,
	libraryEnumInfo,
	libraryObjectTypes,
	options = {},
) => {
	const { onlyExported = false, comments = [] } = options;
	const exportNames = [];
	const functions = {};
	const types = {};

	for (const statement of ast.body) {
		if (onlyExported && !statement.export) {
			continue;
		}

		if (statement.type === AST_NODE.typeDeclaration) {
			processTypeDeclaration(
				statement,
				packageName,
				exportNames,
				libraryObjectTypes,
				comments,
			);
			continue;
		}

		if (statement.type === AST_NODE.variableDeclaration) {
			processVariableDeclaration(
				statement,
				packageName,
				exportNames,
				functions,
				types,
				libraryEnumInfo,
			);
			continue;
		}

		if (statement.type === AST_NODE.enumDeclaration) {
			processEnumDeclaration(
				statement,
				packageName,
				exportNames,
				types,
				libraryEnumInfo,
			);
		}
	}

	applyAllowedValuesComments(functions, comments);

	return { exportNames: new Set(exportNames), functions, types };
};

// Full module description (types, functions, enums) for a source string. Unlike
// `readModule`, it keeps PRIVATE declarations too, so a consumer can reason about
// the shape of an exported type whose fields reference non-exported enums.
export const collectLibraryModuleInfo = (mainSource, packageName) => {
	const { tokens } = tokenize(mainSource);
	const { ast, comments } = parse(tokens);
	const libraryEnumInfo = {};
	const libraryObjectTypes = {};
	const { exportNames, functions, types } = processLibraryAST(
		ast,
		packageName,
		libraryEnumInfo,
		libraryObjectTypes,
		{ comments },
	);
	return {
		exports: exportNames,
		functions,
		types,
		enumInfo: libraryEnumInfo[packageName] ?? null,
		objectTypes: libraryObjectTypes[packageName] ?? {},
	};
};

export const collectLibraryEnumInfo = (mainSource, packageName) => {
	return collectLibraryModuleInfo(mainSource, packageName).enumInfo;
};
