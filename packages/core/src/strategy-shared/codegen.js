import { collectNullNarrowing, resolveProjectTypes } from "../checker/index.js";
import { AST_NODE } from "../constants.js";
import { transformClosureFactories } from "./closures.js";
import {
	assembleMainParts,
	buildIncludeSections,
	buildSplitLibraryArtifacts,
	renderSetupAndMain,
} from "./codegen-assembly.js";
import {
	buildClosureMetadata,
	buildImportContext,
	buildLibraryEnumMetadata,
	buildObjectTypes,
	makeLibraryEnumMemberResolver,
	resolveWordOptions,
} from "./codegen-context.js";
import {
	assertClosuresAreHandles,
	buildObjectTypeInfo,
	collectLibraryHandleTypes,
	collectOwnedLibraryTypeNames,
	collectOwnedPODTypeNames,
	deriveObjectHandleTypeNames,
	makeShapeHandlePredicate,
} from "./object-ownership.js";
import { renderConstantsAndArrays } from "./render-constants.js";
import { makeRenderContext } from "./render-context.js";
import { renderFunctionExpression } from "./statements.js";
import { renderUserCode } from "./user-code.js";

const SOFTWARE_FLOAT64_MODE = "software";

// Emitted at the very top of a generated translation unit when cycle collection
// is disabled, before any core header is included. On (the default) no define is
// emitted and `ref.h` supplies its default value of 1.
export const CYCLES_OFF_DEFINE = "#define E95_CYCLES 0";

const isSoftwareFloat64 = (platform) => {
	return platform?.float64 === SOFTWARE_FLOAT64_MODE;
};

export const generateCode = ({
	ast,
	sourceLines,
	platform,
	libraryModules,
	libraryFunctions = {},
	libraryEnumInfo = {},
	libraryObjectTypes = {},
	libraryTypes = {},
	libraryObjectInfo = null,
	mainGenerator,
	additionalParts,
	renderStringLiteral = (text) => JSON.stringify(text),
	flashStrings = null,
	additionalUserObjectMethods = null,
	libraryParts,
	moduleParts,
	libraryNamespaces = null,
	namespace = null,
	splitLibrary = false,
	libraryGlobalsInSource = false,
	cycles = true,
}) => {
	const { wordCType, wordSize, wordType } = resolveWordOptions(platform);
	const {
		resolveImportedName,
		importNamespaces,
		libraryNamespaceObjects,
		resolveLibraryCallType,
		libParamTypes,
		libParamDefaults,
	} = buildImportContext(
		ast,
		libraryNamespaces,
		libraryObjectTypes,
		libraryFunctions,
		libraryTypes,
	);
	const {
		libEnumMemberToType,
		libEnumNames,
		libEnumTypeNames,
		libEnumNamespaces,
	} = buildLibraryEnumMetadata(libraryEnumInfo, libraryNamespaces);

	const objectTypes = buildObjectTypes(ast, libraryObjectTypes);
	transformClosureFactories(ast, objectTypes);

	const narrowingRegions = collectNullNarrowing(ast);

	const userTypeNames = new Set(
		ast.body
			.filter((statement) => statement.type === AST_NODE.typeDeclaration)
			.map((statement) => statement.name),
	);

	const ownedFieldTypes = collectOwnedPODTypeNames(ast, libEnumNames);
	for (const typeName of collectOwnedLibraryTypeNames(libraryObjectTypes)) {
		ownedFieldTypes.add(typeName);
	}

	const objectHandleTypeNames = deriveObjectHandleTypeNames(
		objectTypes,
		ownedFieldTypes,
		userTypeNames,
	);
	assertClosuresAreHandles(userTypeNames, objectTypes, objectHandleTypeNames);
	const libraryFreeMethodTypes = collectLibraryHandleTypes(
		libraryObjectInfo,
		userTypeNames,
		objectHandleTypeNames,
	);
	const isObjectHandleKey = makeShapeHandlePredicate(
		objectHandleTypeNames,
		ownedFieldTypes,
	);

	const { variableTypes, userFunctionReturnTypes, resolveCallType } =
		resolveProjectTypes(
			ast,
			wordType,
			resolveLibraryCallType,
			wordSize,
			objectTypes,
		);

	const { anonymousObjectTypes, userObjectMethods, closureFactoryTypes } =
		buildClosureMetadata(
			ast,
			objectTypes,
			libraryFunctions,
			userFunctionReturnTypes,
			additionalUserObjectMethods,
		);

	const renderContext = makeRenderContext({
		ast,
		sourceLines,
		types: variableTypes,
		wordType,
		wordSize,
		wordCType,
		enumNames: libEnumNames,
		enumTypeNames: libEnumTypeNames,
		libEnumMemberToType,
		libParamTypes,
		libParamDefaults,
		resolveCallType,
		objectTypes,
		narrowingRegions,
		resolveImportedName,
		renderStringLiteral,
		userTypeNames,
		flashStrings,
		anonymousObjectTypes,
		userObjectMethods,
		importNamespaces,
		libraryNamespaceObjects,
		libEnumNamespaces,
		closureFactoryTypes,
		currentNamespace: namespace,
		objectHandlePredicate: isObjectHandleKey,
		libraryFreeMethodTypes,
		resolveLibraryEnumMember: makeLibraryEnumMemberResolver(libraryModules),
		renderFunctionExpression,
		float64Software: isSoftwareFloat64(platform),
	});

	const { typeDeclarations, mainBody } = renderSetupAndMain(
		ast,
		renderContext,
		libraryModules,
	);

	const { userFunctions, sharedFunctionPrototypes } = renderUserCode(
		ast,
		objectTypes,
		renderContext,
		userFunctionReturnTypes,
		userTypeNames,
	);

	renderContext.setCurrentFunctionName(null);

	const { constantDeclarations } = renderConstantsAndArrays(
		ast,
		variableTypes,
		renderContext,
		wordCType,
		flashStrings,
		userTypeNames,
		importNamespaces,
		objectTypes,
	);

	const { includeSections, engineIncludes } = buildIncludeSections(
		libraryModules,
		libraryParts,
		moduleParts,
	);

	const assembledMain = assembleMainParts(
		includeSections,
		typeDeclarations,
		anonymousObjectTypes,
		renderContext,
		constantDeclarations,
		sharedFunctionPrototypes,
		userFunctions,
		mainBody,
		mainGenerator,
		additionalParts,
		ast,
		namespace,
		cycles,
	);
	const main = cycles
		? assembledMain
		: `${CYCLES_OFF_DEFINE}\n\n${assembledMain}`;

	const generated = { main, userObjectMethods };
	generated.objectTypeInfo = buildObjectTypeInfo(
		userTypeNames,
		objectTypes,
		objectHandleTypeNames,
	);

	if (splitLibrary) {
		buildSplitLibraryArtifacts(
			generated,
			ast,
			libraryEnumInfo,
			engineIncludes,
			typeDeclarations,
			anonymousObjectTypes,
			renderContext,
			constantDeclarations,
			userFunctions,
			libraryGlobalsInSource,
			namespace,
			cycles,
		);
	}

	return generated;
};
