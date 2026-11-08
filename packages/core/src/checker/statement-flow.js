import { AST_NODE } from "../constants.js";

export const endsWithReturn = (statement) => {
	if (!statement) {
		return false;
	}
	if (statement.type === AST_NODE.returnStatement) {
		return true;
	}
	if (statement.type === AST_NODE.blockStatement) {
		const body = statement.body ?? [];
		return endsWithReturn(body[body.length - 1]);
	}
	if (statement.type === AST_NODE.ifStatement) {
		return (
			Boolean(statement.consequent && statement.alternate) &&
			endsWithReturn(statement.consequent) &&
			endsWithReturn(statement.alternate)
		);
	}
	if (statement.type === AST_NODE.switchStatement) {
		const cases = statement.cases ?? [];
		const hasDefault = cases.some((switchCase) => {
			return !switchCase.test;
		});
		return (
			hasDefault &&
			cases.every((switchCase) => {
				const consequent = switchCase.consequent ?? [];
				return endsWithReturn(consequent[consequent.length - 1]);
			})
		);
	}
	return false;
};
