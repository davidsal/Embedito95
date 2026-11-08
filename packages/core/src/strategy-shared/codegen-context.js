import { buildTypeDeclarationMembers } from "../checker/declarations.js";
import {
	buildLibraryFunctionReturnTypes,
	collectImportAliases,
	flattenLibraryObjectTypes,
	makeResolveImportedName,
} from "../checker/index.js";
import {
	AST_NODE,
	DEFAULT_WORD_SIZE,
	SPECIAL_LIBRARY_TYPES,
} from "../constants.js";
import { reserveAnonymousObjectTypeNames } from "./anonymous-type-names.js";
import { resolveWordCType } from "./c-types.js";
import { collectObjectMethods } from "./object-methods.js";
import { collectImportNamespaces } from "./prelude.js";

export const resolveWordOptions = (platform) => {
	const wordCType = resolveWordCType(platform);
	const wordSize = platform?.specs?.wordSize ?? DEFAULT_WORD_SIZE;
	return { wordCType, wordSize, wordType: wordCType };
};

const buildLibraryParamTypes = (ast, libraryFunctions, importAliases) => {
	const libParamTypes = {};
	for (const functions of Object.values(libraryFunctions)) {
		for (const [name, definition] of Object.entries(functions)) {
			if (definition?.params) {
				libParamTypes[name] = definition.params.map((param) => param.type);
			}
		}
	}
	for (const [alias, original] of importAliases) {
		if (libParamTypes[original] !== undefined) {
			libParamTypes[alias] = libParamTypes[original];
		}
	}
	for (const statement of ast.body) {
		if (statement.type === AST_NODE.variableDeclaration) {
			const declaration = statement.declarations?.[0];
			if (declaration?.init?.type === AST_NODE.functionExpression) {
				libParamTypes[declaration.id.name] = declaration.init.params.map(
					(param) => param.typeAnnotation?.type ?? null,
				);
			}
		}
	}
	return libParamTypes;
};

// Default-value AST nodes per function parameter (`null` when the parameter is
// required). Used to fill omitted trailing arguments at the call site.
const buildLibraryParamDefaults = (ast, libraryFunctions, importAliases) => {
	const libParamDefaults = {};
	for (const functions of Object.values(libraryFunctions)) {
		for (const [name, definition] of Object.entries(functions)) {
			if (definition?.params) {
				libParamDefaults[name] = definition.params.map((param) => {
					return param.defaultValue ?? null;
				});
			}
		}
	}
	for (const [alias, original] of importAliases) {
		if (libParamDefaults[original] !== undefined) {
			libParamDefaults[alias] = libParamDefaults[original];
		}
	}
	for (const statement of ast.body) {
		if (statement.type === AST_NODE.variableDeclaration) {
			const declaration = statement.declarations?.[0];
			if (declaration?.init?.type === AST_NODE.functionExpression) {
				libParamDefaults[declaration.id.name] = declaration.init.params.map(
					(param) => {
						return param.defaultValue ?? null;
					},
				);
			}
		}
	}
	return libParamDefaults;
};

export const buildImportContext = (
	ast,
	libraryNamespaces,
	libraryObjectTypes,
	libraryFunctions,
) => {
	const importAliases = collectImportAliases(ast);
	const resolveImportedName = makeResolveImportedName(importAliases);
	const importNamespaces = libraryNamespaces
		? collectImportNamespaces(ast, libraryNamespaces, libraryObjectTypes)
		: null;
	const libFunctionReturnTypes =
		buildLibraryFunctionReturnTypes(libraryFunctions);
	const resolveLibraryCallType = (name) => {
		return libFunctionReturnTypes[resolveImportedName(name)] ?? null;
	};
	const libParamTypes = buildLibraryParamTypes(
		ast,
		libraryFunctions,
		importAliases,
	);
	const libParamDefaults = buildLibraryParamDefaults(
		ast,
		libraryFunctions,
		importAliases,
	);

	return {
		importAliases,
		resolveImportedName,
		importNamespaces,
		resolveLibraryCallType,
		libParamTypes,
		libParamDefaults,
	};
};

export const buildLibraryEnumMetadata = (
	libraryEnumInfo,
	libraryNamespaces,
) => {
	const libEnumMemberToType = {};
	const libEnumNames = new Set();
	const libEnumTypeNames = new Set();
	const libEnumNamespaces = new Map();
	for (const [packageName, info] of Object.entries(libraryEnumInfo)) {
		const enumNamespace = libraryNamespaces?.[packageName];
		for (const typeName of info.typeNames ?? []) {
			libEnumTypeNames.add(typeName);
			if (!SPECIAL_LIBRARY_TYPES.has(typeName)) {
				libEnumNames.add(typeName);
				if (enumNamespace) {
					libEnumNamespaces.set(typeName, enumNamespace);
				}
			}
		}
		Object.assign(libEnumMemberToType, info.members ?? {});
	}
	return {
		libEnumMemberToType,
		libEnumNames,
		libEnumTypeNames,
		libEnumNamespaces,
	};
};

export const makeLibraryEnumMemberResolver = (libraryModules = {}) => {
	const modules = Object.values(libraryModules).filter((module) => {
		return typeof module?.resolveEnumMember === "function";
	});
	return (moduleName, memberName) => {
		for (const module of modules) {
			const symbol = module.resolveEnumMember(moduleName, memberName);
			if (symbol != null) {
				return symbol;
			}
		}
		return null;
	};
};

export const buildObjectTypes = (ast, libraryObjectTypes) => {
	const objectTypes = flattenLibraryObjectTypes(libraryObjectTypes);

	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.typeDeclaration) {
			continue;
		}
		const { methods, fields } = buildTypeDeclarationMembers(
			statement.members ?? [],
		);
		objectTypes[statement.name] = { methods, fields };
	}

	return objectTypes;
};

export const buildClosureMetadata = (
	ast,
	objectTypes,
	libraryFunctions,
	userFunctionReturnTypes,
	additionalUserObjectMethods,
) => {
	const anonymousObjectTypes = {};
	const userObjectMethods = collectObjectMethods(ast, objectTypes);
	if (additionalUserObjectMethods) {
		for (const [typeName, methods] of additionalUserObjectMethods) {
			if (!userObjectMethods.has(typeName)) {
				userObjectMethods.set(typeName, new Map());
			}
			for (const [methodName, functionExpression] of methods) {
				userObjectMethods.get(typeName).set(methodName, functionExpression);
			}
		}
	}
	reserveAnonymousObjectTypeNames(
		ast,
		userFunctionReturnTypes,
		anonymousObjectTypes,
	);
	const isClosureClassType = (returnType) => {
		return (
			Boolean(objectTypes[returnType]?.isClosureClass) ||
			(userObjectMethods.get(returnType)?.size ?? 0) > 0
		);
	};
	const closureFactoryTypes = new Map();
	for (const [name, returnType] of userFunctionReturnTypes) {
		if (isClosureClassType(returnType)) {
			closureFactoryTypes.set(name, returnType);
		}
	}
	for (const functions of Object.values(libraryFunctions)) {
		for (const [name, definition] of Object.entries(functions)) {
			const returnType = definition.returnType;
			if (returnType && isClosureClassType(returnType)) {
				closureFactoryTypes.set(name, returnType);
			}
		}
	}
	return { anonymousObjectTypes, userObjectMethods, closureFactoryTypes };
};
