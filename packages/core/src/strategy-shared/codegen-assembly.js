import {
	decodeObjectShape,
	isObjectShapeType,
	parseArrayType,
} from "../checker/index.js";
import {
	AST_NODE,
	CORE_MARKER,
	DATA_TYPE,
	LIBRARIES_MARKER,
	MAIN_MARKER,
	MODULES_MARKER,
} from "../constants.js";
import { resolveAnonymousObjectTypeName } from "./anonymous-type-names.js";
import { renderAnonymousObjectType, renderTypeDeclaration } from "./classes.js";
import { renderProjectLibraryEnumTypedefs } from "./collections.js";
import { findDeclarationByName } from "./literal-constants.js";
import {
	generateInitializeCalls,
	generateInlinedSetupBody,
	generateLibraryIncludes,
	generateUserFunctions,
	indentBlock,
	sortInitEntries,
} from "./prelude.js";
import { renderFunctionBody } from "./statements.js";
import { renderTypeInfoDeclarations } from "./type-info.js";
import { renderFunctionPrototypes } from "./user-code.js";

const renderTypeInfoSection = (
	ast,
	anonymousObjectTypes,
	renderContext,
	namespaceName,
	cycles,
) => {
	return renderTypeInfoDeclarations({
		ast,
		orderedAnonymousKeys: orderAnonymousObjectTypeKeys(anonymousObjectTypes),
		anonymousObjectTypes,
		renderContext,
		namespaceName,
		cycles,
	});
};

// Anonymous-shape structs are emitted at file scope. When one shape holds
// another (an anonymous shape field becomes an `Object<childBody>` member), the
// child struct must be declared before the parent, so the declarations are
// emitted in post-order over the shape field graph (a leaf first). Children that
// were only reached through a parent (never reserved on their own) are
// registered here so their `struct` is emitted too. Only object-shape edges
// matter; named types are ordered separately in `renderTypeDeclarations`, which
// uses this helper to place each named type after the shapes it uses.
export const orderAnonymousObjectTypeKeys = (
	anonymousObjectTypes,
	rootShapeTypes = null,
) => {
	const ordered = [];
	const visited = new Set();
	const visitFieldType = (fieldType, visit) => {
		const arrayType = parseArrayType(fieldType);
		if (arrayType) {
			visitFieldType(arrayType.elementType, visit);
			return;
		}
		if (isObjectShapeType(fieldType)) {
			resolveAnonymousObjectTypeName(fieldType, anonymousObjectTypes, null);
			visit(fieldType);
		}
	};
	const visit = (shapeType) => {
		if (visited.has(shapeType)) {
			return;
		}
		visited.add(shapeType);
		// Roots reach here directly (never through `visitFieldType`), so make
		// sure they are registered before the declaration is rendered.
		resolveAnonymousObjectTypeName(shapeType, anonymousObjectTypes, null);
		const fields = decodeObjectShape(shapeType) ?? {};
		for (const field of Object.values(fields)) {
			visitFieldType(field.type, visit);
		}
		ordered.push(shapeType);
	};
	const roots = rootShapeTypes ?? Object.keys(anonymousObjectTypes);
	for (const shapeType of roots) {
		visit(shapeType);
	}
	return ordered;
};

// Collect the anonymous shapes a named type references directly through its
// FIELD types (including inside arrays). The shape's own nested shapes are
// pulled in by `orderAnonymousObjectTypeKeys`, so only the roots are listed
// here.
const collectRootShapeTypes = (fields) => {
	const roots = [];
	for (const field of Object.values(fields ?? {})) {
		const arrayType = parseArrayType(field.type);
		const key = arrayType ? arrayType.elementType : field.type;
		if (isObjectShapeType(key)) {
			roots.push(key);
		}
	}
	return roots;
};

// Emits every type declaration in dependency order: the anonymous shapes a
// named type uses (nested first, see `orderAnonymousObjectTypeKeys`) must appear
// before that named type's struct, because a field becomes an
// `Object<ShapeStruct>` member. Named type declarations keep their source order;
// shapes not referenced by any named type are appended afterwards.
export const renderTypeDeclarations = (
	ast,
	renderContext,
	anonymousObjectTypes,
) => {
	const emittedShapes = new Set();
	const parts = [];
	const emitShape = (shapeType) => {
		if (emittedShapes.has(shapeType)) {
			return;
		}
		emittedShapes.add(shapeType);
		parts.push(
			renderAnonymousObjectType(shapeType, anonymousObjectTypes, renderContext),
		);
	};
	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.typeDeclaration) {
			continue;
		}
		const rootShapeTypes = collectRootShapeTypes(
			renderContext.objectTypes?.[statement.name]?.fields,
		);
		for (const shapeType of orderAnonymousObjectTypeKeys(
			anonymousObjectTypes,
			rootShapeTypes,
		)) {
			emitShape(shapeType);
		}
		parts.push(renderTypeDeclaration(statement, renderContext));
	}
	for (const shapeType of orderAnonymousObjectTypeKeys(anonymousObjectTypes)) {
		emitShape(shapeType);
	}
	return parts;
};

export const renderSetupAndMain = (ast, renderContext, libraryModules) => {
	const setupDeclaration = findDeclarationByName(ast, "setup");
	renderContext.setCurrentFunctionName("setup");
	renderContext.functionReturnType = DATA_TYPE.void;
	const setupBody = setupDeclaration
		? renderFunctionBody(setupDeclaration.init, renderContext).join("\n")
		: "";

	const initEntries = sortInitEntries(libraryModules);

	const mainDeclaration = findDeclarationByName(ast, "main");
	const inlinedSetupBody = generateInlinedSetupBody(
		setupBody,
		generateInitializeCalls(initEntries),
	);
	const setupReplacement = inlinedSetupBody
		? `${inlinedSetupBody}\n\n${MAIN_MARKER}`
		: "";
	const mainBody = mainDeclaration
		? (() => {
				renderContext.setCurrentFunctionName("main");
				renderContext.functionReturnType = DATA_TYPE.void;
				return renderFunctionBody(mainDeclaration.init, renderContext)
					.join("\n")
					.replace(
						/\bsetup\s*\(\s*\);(?:\r?\n)*/g,
						setupReplacement ? `${setupReplacement}\n` : "",
					);
			})()
		: "";

	return { mainBody };
};

export const buildIncludeSections = (
	libraryModules,
	libraryParts,
	moduleParts,
) => {
	const engineIncludes = generateLibraryIncludes(libraryModules);
	const projectIncludes = (libraryParts ?? []).filter(Boolean).join("\n");
	const projectModuleIncludes = (moduleParts ?? []).filter(Boolean).join("\n");
	const includeSections = [
		engineIncludes ? `${CORE_MARKER}\n${engineIncludes}` : "",
		projectIncludes ? `${LIBRARIES_MARKER}\n${projectIncludes}` : "",
		projectModuleIncludes ? `${MODULES_MARKER}\n${projectModuleIncludes}` : "",
	]
		.filter(Boolean)
		.join("\n");
	return { includeSections, engineIncludes };
};

export const assembleMainParts = (
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
	namespaceName = null,
	cycles = true,
) => {
	const parts = [
		includeSections,
		...typeDeclarations,
		renderTypeInfoSection(
			ast,
			anonymousObjectTypes,
			renderContext,
			namespaceName,
			cycles,
		),
		constantDeclarations,
		sharedFunctionPrototypes,
		generateUserFunctions(userFunctions),
		mainGenerator(mainBody, indentBlock),
		...(additionalParts ?? []),
	];

	return parts.filter(Boolean).join("\n\n");
};

export const buildSplitLibraryArtifacts = (
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
	namespaceName = null,
	cycles = true,
) => {
	const prototypes = renderFunctionPrototypes(userFunctions);
	generated.libraryHeaderGlobal = [
		engineIncludes ? `${CORE_MARKER}\n${engineIncludes}` : "",
	]
		.filter(Boolean)
		.join("\n\n");
	// The specializations must live OUTSIDE the library namespace (they reopen
	// `core_mem` at global scope), so they are a separate section appended after
	// the namespace block in library.js.
	generated.libraryHeaderTypeInfo = renderTypeInfoSection(
		ast,
		anonymousObjectTypes,
		renderContext,
		namespaceName,
		cycles,
	);
	generated.libraryHeaderNamespace = [
		renderProjectLibraryEnumTypedefs(ast, libraryEnumInfo),
		...typeDeclarations,
		...(libraryGlobalsInSource ? [] : [constantDeclarations]),
		prototypes,
	]
		.filter(Boolean)
		.join("\n\n");
	generated.librarySource = [
		...(libraryGlobalsInSource ? [constantDeclarations] : []),
		generateUserFunctions(userFunctions),
	]
		.filter(Boolean)
		.join("\n\n");
};
