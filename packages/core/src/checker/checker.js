import { AST_NODE } from "../constants.js";
import { checkFunctionCallArguments } from "./arguments-walk.js";
import { checkCapturedFieldAccess } from "./captured-field-checks.js";
import {
	collectClosureCapturedFields,
	collectClosureCapturedFieldTypes,
} from "./closure-analysis.js";
import { checkClosureUsage } from "./closure-checks.js";
import { buildCheckContext } from "./context.js";
import { checkTopLevelDeclarations } from "./declarations.js";
import { collectObjectLiteralTypes } from "./expression-objects.js";
import {
	checkExpressionStatements,
	checkFunctionReturnChecks,
	checkLiteralAndArrayUsage,
	checkMissingInitializers,
	checkRequiredFunctionsAndSetup,
	checkUnusedImports,
} from "./final-checks.js";
import { collectImportAliases, makeResolveImportedName } from "./imports.js";
import {
	buildLibraryFunctionReturnTypes,
	flattenLibraryObjectTypes,
} from "./library-types.js";
import { checkMemberAccess } from "./member-access-checks.js";
import {
	checkAnnotationsAndReturns,
	checkMethodCalls,
} from "./method-checks.js";
import { collectNullNarrowing } from "./narrowing.js";
import { checkNullableUses } from "./nullable-checks.js";
import {
	checkAsyncBuiltinCalls,
	checkAwaitUsage,
	checkSwitchStatements,
	checkUnreachableCode,
} from "./passes.js";
import { runRangeCheck } from "./range-walk.js";
import {
	checkScopeDuplicates,
	checkUndefinedReferences,
	checkUsedBeforeDeclaration,
	collectReferences,
} from "./references-checks.js";
import {
	collectObjectMethodReturnTypes,
	resolveProjectTypes,
} from "./return-projects.js";
import { checkTypeArguments } from "./type-arguments.js";
import { resolveWordDataType } from "./type-resolution.js";
import { checkTypeUnions } from "./union-checks.js";
import {
	checkPreferConst,
	checkUnusedDeclarations,
	collectUsageInfo,
} from "./usage-walks.js";
import { SCOPE_NODE_TYPES } from "./walk.js";

const compareErrorsByPosition = (first, second) => {
	const firstLine = first.location?.start?.line ?? Number.MAX_SAFE_INTEGER;
	const secondLine = second.location?.start?.line ?? Number.MAX_SAFE_INTEGER;
	if (firstLine !== secondLine) {
		return firstLine - secondLine;
	}
	const firstColumn = first.location?.start?.column ?? Number.MAX_SAFE_INTEGER;
	const secondColumn =
		second.location?.start?.column ?? Number.MAX_SAFE_INTEGER;
	return firstColumn - secondColumn;
};

export const check = (ast, libs = {}) => {
	const {
		isLibrary = false,
		isEntry = !isLibrary,
		knownLibraries = new Set(),
		libraryFunctions = {},
		libraryTypes = {},
		libraryEnumInfo = {},
		libraryObjectTypes = {},
		libraryExports = {},
		wordSize = 32,
		platformTypes = null,
		coreLibraryPackages = new Set(),
		libraryPackage = null,
	} = libs;
	const isCoreLibrary =
		Boolean(libraryPackage) && coreLibraryPackages.has(libraryPackage);
	const errors = [];
	const wordType = resolveWordDataType(wordSize);
	const importAliases = collectImportAliases(ast);
	const resolveImportedName = makeResolveImportedName(importAliases);
	const libFunctionReturnTypes =
		buildLibraryFunctionReturnTypes(libraryFunctions);
	const resolveLibraryCallType = (name) => {
		return libFunctionReturnTypes[resolveImportedName(name)] ?? null;
	};

	const objectTypes = flattenLibraryObjectTypes(libraryObjectTypes);
	const objectTypeNames = new Set(Object.keys(objectTypes));

	const { variableTypes, resolveCallType } = resolveProjectTypes(
		ast,
		wordType,
		resolveLibraryCallType,
		wordSize,
		objectTypes,
	);
	const narrowingRegions = collectNullNarrowing(ast);

	const defined = new Map();
	const imported = [];
	const importedNames = new Set();
	const enumMemberNames = new Set();
	const exported = [];

	const enumTypes = new Set();
	const functionParameterCount = {};
	const functionDefinitions = {};
	for (const functions of Object.values(libraryFunctions)) {
		for (const [name, definition] of Object.entries(functions)) {
			functionParameterCount[name] = definition.params.length;
			functionDefinitions[name] = definition;
		}
	}

	const libNameToType = {};
	for (const types of Object.values(libraryTypes)) {
		Object.assign(libNameToType, types);
	}
	const libEnumTypeNames = new Set();
	const libEnumMemberToType = {};
	const libEnumMembersByType = {};
	// Enum member names are module-local, but the unqualified lookup is global.
	// Two libraries can declare the same member (DigitalLevel.LOW and
	// InterruptMode.LOW). An exported constant with that name wins, and the
	// first enum keeps the unqualified name; qualified access still resolves
	// through libEnumMembersByType.
	const registerEnumMembers = (members) => {
		for (const [member, typeName] of Object.entries(members)) {
			const exportedType = libNameToType[member];
			if (exportedType !== undefined && exportedType !== typeName) {
				continue;
			}
			const registeredType = libEnumMemberToType[member];
			if (registeredType !== undefined && registeredType !== typeName) {
				continue;
			}
			libEnumMemberToType[member] = typeName;
		}
	};
	for (const info of Object.values(libraryEnumInfo)) {
		for (const name of info.typeNames) {
			libEnumTypeNames.add(name);
			libEnumMembersByType[name] = new Set();
		}
		for (const [member, typeName] of Object.entries(info.members)) {
			if (libEnumMembersByType[typeName]) {
				libEnumMembersByType[typeName].add(member);
			}
		}
		registerEnumMembers(info.members);
	}

	const scopeNodeTypes = new Set([
		...SCOPE_NODE_TYPES,
		AST_NODE.functionExpression,
	]);

	const state = {
		ast,
		libs,
		isLibrary,
		isEntry,
		isCoreLibrary,
		knownLibraries,
		libraryExports,
		platformTypes,
		errors,
		wordType,
		wordSize,
		objectTypes,
		objectTypeNames,
		localObjectTypeNames: new Set(),
		variableTypes,
		resolveCallType,
		narrowingRegions,
		defined,
		imported,
		importedNames,
		enumMemberNames,
		exported,
		enumTypes,
		functionParameterCount,
		functionDefinitions,
		libNameToType,
		libEnumTypeNames,
		libEnumMemberToType,
		libEnumMembersByType,
		resolveImportedName,
		resolveLibraryCallType,
		scopeNodeTypes,
		calls: [],
		referencedNames: new Set(),
		referencedTypes: new Set(),
		localDeclarations: [],
		typeDeclarations: [],
		enumDeclarations: [],
		unusedNames: new Set(),
		topLevelSet: new Set(ast.body),
		referenced: new Set(),
	};

	checkTopLevelDeclarations(state);
	checkTypeArguments(state);

	for (const [typeName, capturedFieldTypes] of collectClosureCapturedFieldTypes(
		ast,
		objectTypes,
	)) {
		if (objectTypes[typeName]) {
			objectTypes[typeName].capturedFieldTypes = capturedFieldTypes;
		}
	}

	const context = buildCheckContext({
		ast,
		errors,
		objectTypes,
		variableTypes,
		libEnumMemberToType,
		libEnumMembersByType,
		libEnumTypeNames,
		enumTypes,
		functionDefinitions,
		resolveImportedName,
		wordSize,
		resolveCallType,
		narrowingRegions,
	});
	state.context = context;
	state.targetTypeStack = [];
	state.objectLiteralTypeMap = collectObjectLiteralTypes(ast, objectTypes);
	state.capturedFields = collectClosureCapturedFields(ast, objectTypes);

	checkClosureUsage(state);
	checkCapturedFieldAccess(state);
	runRangeCheck(state);
	collectUsageInfo(state);
	checkUnusedDeclarations(state);
	checkPreferConst(state);
	checkFunctionCallArguments(state);
	checkMethodCalls(state);
	checkNullableUses(state);

	state.objectMethodReturnTypes = collectObjectMethodReturnTypes(
		ast,
		objectTypes,
	);
	checkAnnotationsAndReturns(state);
	checkTypeUnions(state);

	checkMemberAccess(state);
	checkAwaitUsage(state);
	checkAsyncBuiltinCalls(state);
	checkUnreachableCode(ast, errors, libs.source);
	checkSwitchStatements(state);

	checkLiteralAndArrayUsage(state);
	checkMissingInitializers(state);
	checkUndefinedReferences(state);
	checkUsedBeforeDeclaration(state);
	checkScopeDuplicates(state);
	checkRequiredFunctionsAndSetup(state);
	collectReferences(state);
	checkExpressionStatements(state);
	checkFunctionReturnChecks(state);
	checkUnusedImports(state);

	errors.sort(compareErrorsByPosition);

	return { ast, errors, exported, variableTypes };
};
