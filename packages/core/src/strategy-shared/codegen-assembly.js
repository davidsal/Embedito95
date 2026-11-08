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
import { renderFunctionPrototypes } from "./user-code.js";

// Anonymous-shape structs are emitted at file scope. When one shape holds
// another (an anonymous shape field becomes an `Object<childBody>` member), the
// child struct must be declared before the parent, so the declarations are
// emitted in post-order over the shape field graph (a leaf first). Children that
// were only reached through a parent (never reserved on their own) are
// registered here so their `struct` is emitted too. Only object-shape edges
// matter: named types are declared separately (in `typeDeclarations`) and always
// precede this section.
export const orderAnonymousObjectTypeKeys = (anonymousObjectTypes) => {
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
		const fields = decodeObjectShape(shapeType) ?? {};
		for (const field of Object.values(fields)) {
			visitFieldType(field.type, visit);
		}
		ordered.push(shapeType);
	};
	for (const shapeType of Object.keys(anonymousObjectTypes)) {
		visit(shapeType);
	}
	return ordered;
};

export const renderSetupAndMain = (ast, renderContext, libraryModules) => {
	const typeDeclarations = ast.body
		.filter((statement) => statement.type === AST_NODE.typeDeclaration)
		.map((statement) => renderTypeDeclaration(statement, renderContext));

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

	return { typeDeclarations, mainBody };
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
) => {
	const parts = [
		includeSections,
		...typeDeclarations,
		...orderAnonymousObjectTypeKeys(anonymousObjectTypes).map((shapeType) =>
			renderAnonymousObjectType(shapeType, anonymousObjectTypes, renderContext),
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
) => {
	const prototypes = renderFunctionPrototypes(userFunctions);
	generated.libraryHeaderGlobal = [
		engineIncludes ? `${CORE_MARKER}\n${engineIncludes}` : "",
	]
		.filter(Boolean)
		.join("\n\n");
	generated.libraryHeaderNamespace = [
		renderProjectLibraryEnumTypedefs(ast, libraryEnumInfo),
		...typeDeclarations,
		...orderAnonymousObjectTypeKeys(anonymousObjectTypes).map((shapeType) =>
			renderAnonymousObjectType(shapeType, anonymousObjectTypes, renderContext),
		),
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
