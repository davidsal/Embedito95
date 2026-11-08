import { AST_NODE } from "../constants.js";

export const getImportEffectiveName = (specifier) => {
	return specifier.alias ?? specifier.name;
};

export const collectImportAliases = (ast) => {
	const importAliases = new Map();
	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.importDeclaration) {
			continue;
		}
		for (const specifier of statement.specifiers) {
			if (specifier.alias) {
				importAliases.set(specifier.alias, specifier.name);
			}
		}
	}
	return importAliases;
};

export const isModuleNameTaken = (
	name,
	defined,
	importedNames,
	enumMemberNames,
) => {
	return (
		importedNames.has(name) || (defined.has(name) && !enumMemberNames.has(name))
	);
};

export const makeResolveImportedName = (importAliases) => {
	return (name) => {
		return importAliases.get(name) ?? name;
	};
};
