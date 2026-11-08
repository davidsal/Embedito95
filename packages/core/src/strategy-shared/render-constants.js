import { parseArrayType } from "../checker/index.js";
import { AST_NODE } from "../constants.js";
import {
	renderArrayDeclaration,
	resolveArrayElementType,
} from "./collections.js";
import {
	extractLiteralConstants,
	renderLiteralConstant,
} from "./literal-constants.js";

const collectArrayDeclarations = (ast, renderContext) => {
	const arrayDeclarations = [];
	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.variableDeclaration) {
			continue;
		}
		const declaration = statement.declarations?.[0];
		const annotation = declaration?.id?.typeAnnotation?.type;
		if (
			declaration?.init?.type !== AST_NODE.arrayLiteral &&
			!parseArrayType(annotation)
		) {
			continue;
		}
		const arrayInfo = parseArrayType(annotation) ?? {
			elementType: resolveArrayElementType(
				annotation,
				declaration.init,
				renderContext,
				statement.kind === "let",
			),
			capacity: null,
		};
		renderArrayDeclaration(
			declaration,
			arrayInfo,
			renderContext,
			arrayDeclarations,
		);
	}
	return arrayDeclarations;
};

const renderConstantDeclarations = (
	orderedConstants,
	arrayDeclarations,
	wordCType,
	flashStrings,
	userTypeNames,
	importNamespaces,
	objectTypeNames,
	renderContext,
) => {
	return [
		...orderedConstants.map((constant) => {
			return renderLiteralConstant(
				constant,
				wordCType,
				flashStrings,
				userTypeNames,
				importNamespaces,
				objectTypeNames,
				renderContext,
			);
		}),
		...arrayDeclarations,
	]
		.filter(Boolean)
		.join("\n");
};

export const renderConstantsAndArrays = (
	ast,
	variableTypes,
	renderContext,
	wordCType,
	flashStrings,
	userTypeNames,
	importNamespaces,
	objectTypes,
) => {
	const orderedConstants = extractLiteralConstants(
		ast,
		variableTypes,
		renderContext,
	);
	const arrayDeclarations = collectArrayDeclarations(ast, renderContext);
	const objectTypeNames = new Set(Object.keys(objectTypes));
	const constantDeclarations = renderConstantDeclarations(
		orderedConstants,
		arrayDeclarations,
		wordCType,
		flashStrings,
		userTypeNames,
		importNamespaces,
		objectTypeNames,
		renderContext,
	);

	return { constantDeclarations };
};
