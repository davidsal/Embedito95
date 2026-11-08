import { AST_NODE } from "embedito95-core";
import {
	extractParamDoc,
	formatDocComment,
	getDocComment,
} from "../shared/doc-comments.js";
import { getLibraryObjectTypeMemberDoc } from "../shared/library-docs.js";

export const getObjectMemberDocSection = (
	syntaxTree,
	comments,
	typeName,
	memberName,
	documentUri,
	allExports,
) => {
	for (const statement of syntaxTree.body) {
		if (
			statement.type !== AST_NODE.typeDeclaration ||
			statement.name !== typeName
		) {
			continue;
		}

		const member = statement.members?.find((memberItem) => {
			return memberItem.name === memberName;
		});

		return formatDocComment(getDocComment(comments, member?.loc?.start?.line));
	}

	if (allExports.objectTypeDefinitions?.[typeName]) {
		const libraryName = allExports.objectTypeLibraries?.[typeName];

		if (libraryName) {
			const documentation = getLibraryObjectTypeMemberDoc(
				documentUri,
				libraryName,
				typeName,
				memberName,
			);
			return formatDocComment(documentation);
		}
	}

	return "";
};

export const findParameterInfo = (syntaxTree, comments, name) => {
	for (const statement of syntaxTree.body) {
		if (statement.type !== AST_NODE.variableDeclaration) {
			continue;
		}

		const declaration = statement.declarations?.[0];

		if (declaration?.init?.type !== AST_NODE.functionExpression) {
			continue;
		}

		const parameter = declaration.init.params.find((parameterItem) => {
			return parameterItem.name === name;
		});

		if (!parameter) {
			continue;
		}

		const docComment = getDocComment(comments, statement.loc?.start?.line);
		const parameterDoc = docComment ? extractParamDoc(docComment, name) : null;
		const type = parameter.typeAnnotation?.type ?? "unknown";
		const signature = `\`\`\`e95\n${name}: ${type}\n\`\`\``;
		const docSection = parameterDoc ? formatDocComment(parameterDoc) : "";

		return { contents: { kind: "markdown", value: signature + docSection } };
	}

	return null;
};
