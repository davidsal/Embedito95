import { AST_NODE, walk } from "embedito95-core";
import { isInLocation } from "./shared/location.js";

export const isOverlappingStatement = (unreachableStatements, line, column) => {
	return unreachableStatements.some((statement) => {
		return isInLocation(line, column, statement.loc);
	});
};

export const collectUnreachableStatements = (syntaxTree) => {
	const unreachable = [];

	walk(syntaxTree, {
		enter: (node) => {
			if (node.type !== AST_NODE.blockStatement) {
				return;
			}

			const returnIndex = node.body.findIndex((statement) => {
				return statement.type === AST_NODE.returnStatement;
			});

			if (returnIndex === -1) {
				return;
			}

			unreachable.push(...node.body.slice(returnIndex + 1));
		},
	});

	return unreachable;
};

export const collectLocalTypeNames = (syntaxTree) => {
	const typeNames = new Set();

	for (const statement of syntaxTree.body) {
		if (
			statement.type === AST_NODE.enumDeclaration ||
			statement.type === AST_NODE.typeDeclaration
		) {
			typeNames.add(statement.name);
		}
	}

	return typeNames;
};

export const collectLibraryEnumMembers = (libraries) => {
	const enumMembers = {};

	for (const enumInfo of Object.values(libraries?.libraryEnumInfo ?? {})) {
		for (const [typeName, members] of Object.entries(
			enumInfo?.declarations ?? {},
		)) {
			if (!enumMembers[typeName]) {
				enumMembers[typeName] = new Set();
			}
			for (const member of members ?? []) {
				enumMembers[typeName].add(String(member?.name));
			}
		}
	}

	return enumMembers;
};

export const collectLocalEnumMembers = (syntaxTree) => {
	const enumMembers = {};

	for (const statement of syntaxTree.body) {
		if (statement.type !== AST_NODE.enumDeclaration) {
			continue;
		}
		if (!enumMembers[statement.name]) {
			enumMembers[statement.name] = new Set();
		}
		for (const member of statement.members ?? []) {
			enumMembers[statement.name].add(String(member?.name));
		}
	}

	return enumMembers;
};

export const collectLibraryTypeNames = (libraries) => {
	const typeNames = new Set();

	for (const enumInfo of Object.values(libraries?.libraryEnumInfo ?? {})) {
		for (const typeName of enumInfo?.typeNames ?? []) {
			typeNames.add(typeName);
		}
	}
	for (const packageTypes of Object.values(
		libraries?.libraryObjectTypes ?? {},
	)) {
		for (const typeName of Object.keys(packageTypes ?? {})) {
			typeNames.add(typeName);
		}
	}

	return typeNames;
};

export const collectImportedTypeNames = (syntaxTree, libraryTypeNames) => {
	const typeNames = new Set();

	for (const statement of syntaxTree.body) {
		if (statement.type !== AST_NODE.importDeclaration) {
			continue;
		}

		for (const specifier of statement.specifiers ?? []) {
			if (libraryTypeNames.has(specifier.name)) {
				typeNames.add(specifier.alias ?? specifier.name);
			}
		}
	}

	return typeNames;
};
