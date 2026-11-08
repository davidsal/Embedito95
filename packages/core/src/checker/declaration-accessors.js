import { AST_NODE } from "../constants.js";

export const getDeclaration = (statement) => {
	return statement.declarations?.[0];
};

export const collectFunctionDeclarations = (ast) => {
	const declarations = [];
	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.variableDeclaration) {
			continue;
		}
		const declaration = statement.declarations?.[0];
		if (declaration?.init?.type !== AST_NODE.functionExpression) {
			continue;
		}
		declarations.push({ statement, declaration });
	}
	return declarations;
};
