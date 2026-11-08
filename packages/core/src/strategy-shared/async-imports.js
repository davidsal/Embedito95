import {
	collectReferencedNames,
	getImportEffectiveName,
} from "../checker/index.js";
import { AST_NODE } from "../constants.js";

const pruneImportStatement = (statement, referenced) => {
	if (statement.type !== AST_NODE.importDeclaration) {
		return true;
	}
	statement.specifiers = (statement.specifiers ?? []).filter((specifier) => {
		return referenced.has(getImportEffectiveName(specifier));
	});
	return statement.specifiers.length > 0;
};

export const pruneUnusedImports = (ast) => {
	const referenced = collectReferencedNames(ast);

	ast.body = ast.body.filter((statement) => {
		return pruneImportStatement(statement, referenced);
	});
};
