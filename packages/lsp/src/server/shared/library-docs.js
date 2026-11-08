import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	AST_NODE,
	CONFIG_FILE,
	MAIN_FILE,
	parse,
	tokenize,
	UTF8,
} from "embedito95-core";
import { getDocComment, getEnumMemberDoc } from "./doc-comments.js";
import { getLibrariesDirectory, listLibraryDirectories } from "./libraries.js";

const findDeclarationLine = (syntaxTree, name) => {
	for (const statement of syntaxTree.body) {
		if (statement.type === AST_NODE.variableDeclaration) {
			const declaration = statement.declarations?.[0];

			if (declaration?.id?.name === name) {
				return statement.loc?.start?.line;
			}
		}

		if (
			statement.type === AST_NODE.enumDeclaration &&
			statement.name === name
		) {
			return statement.loc?.start?.line;
		}
	}

	return null;
};

const readLibraryModule = (documentUri, libraryName) => {
	try {
		const documentPath = fileURLToPath(documentUri);
		const documentDirectory = dirname(documentPath);
		const { baseDirectory } = getLibrariesDirectory(documentDirectory);

		for (const librariesDirectory of listLibraryDirectories(baseDirectory)) {
			for (const entry of readdirSync(librariesDirectory)) {
				const libraryConfigPath = join(librariesDirectory, entry, CONFIG_FILE);

				if (!existsSync(libraryConfigPath)) {
					continue;
				}

				const libraryConfig = JSON.parse(readFileSync(libraryConfigPath, UTF8));

				if (libraryConfig.package !== libraryName) {
					continue;
				}

				const mainPath = join(librariesDirectory, entry, MAIN_FILE);

				if (!existsSync(mainPath)) {
					return null;
				}

				const source = readFileSync(mainPath, UTF8);
				const { tokens } = tokenize(source);
				const { ast: syntaxTree, comments } = parse(tokens);

				return { syntaxTree, comments };
			}
		}

		return null;
	} catch {
		return null;
	}
};

export const getLibraryDocComment = (
	documentUri,
	libraryName,
	functionName,
) => {
	const libraryDocument = readLibraryModule(documentUri, libraryName);

	if (!libraryDocument) {
		return null;
	}

	return getDocComment(
		libraryDocument.comments,
		findDeclarationLine(libraryDocument.syntaxTree, functionName),
	);
};

export const getLibraryEnumMemberDoc = (
	documentUri,
	libraryName,
	memberName,
) => {
	const libraryDocument = readLibraryModule(documentUri, libraryName);

	if (!libraryDocument) {
		return null;
	}

	return getEnumMemberDoc(libraryDocument.comments, memberName);
};

export const getLibraryObjectTypeMemberDoc = (
	documentUri,
	libraryName,
	typeName,
	memberName,
) => {
	const libraryDocument = readLibraryModule(documentUri, libraryName);

	if (!libraryDocument) {
		return null;
	}

	for (const statement of libraryDocument.syntaxTree.body) {
		if (
			statement.type !== AST_NODE.typeDeclaration ||
			statement.name !== typeName
		) {
			continue;
		}

		const member = statement.members?.find((memberItem) => {
			return memberItem.name === memberName;
		});

		if (!member) {
			return null;
		}

		return getDocComment(libraryDocument.comments, member.loc?.start?.line);
	}

	return null;
};
