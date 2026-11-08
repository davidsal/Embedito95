import { ARITHMETIC_OPERATORS, AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import {
	isNullableType,
	unwrapParentheses,
	unwrapToIdentifier,
} from "./types.js";
import { walk } from "./walk.js";

const baseObjectIdentifier = (node) => {
	let current = unwrapParentheses(node);
	while (
		current?.type === AST_NODE.memberExpression ||
		current?.type === AST_NODE.indexExpression
	) {
		current = unwrapParentheses(current.object);
	}
	return current?.type === AST_NODE.identifier ? current : null;
};

const addNullableOperationError = (state, flagged, identifier) => {
	if (!identifier?.name || !identifier?.loc?.start) {
		return;
	}
	const key = `${identifier.name}:${identifier.loc.start.line}:${identifier.loc.start.column}`;
	if (flagged.has(key)) {
		return;
	}
	flagged.add(key);

	const type = state.context.resolveVariableTypeAt(
		identifier.name,
		identifier.loc,
	);
	if (!isNullableType(type)) {
		return;
	}

	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.nullableOperation,
			params: { name: identifier.name, type },
			location: identifier.loc,
		}),
	);
};

export const checkNullableUses = (state) => {
	const flagged = new Set();

	const enter = (node) => {
		if (
			node?.type === AST_NODE.memberExpression ||
			node?.type === AST_NODE.indexExpression
		) {
			addNullableOperationError(state, flagged, baseObjectIdentifier(node));
			return;
		}
		if (node?.type === AST_NODE.assignmentExpression) {
			if (node.operator !== "=") {
				addNullableOperationError(
					state,
					flagged,
					unwrapToIdentifier(node.left),
				);
			}
			return;
		}
		if (
			node?.type === AST_NODE.binaryExpression &&
			ARITHMETIC_OPERATORS.has(node.operator)
		) {
			addNullableOperationError(state, flagged, unwrapToIdentifier(node.left));
			addNullableOperationError(state, flagged, unwrapToIdentifier(node.right));
			return;
		}
		if (node?.type === AST_NODE.unaryExpression && node.operator === "-") {
			addNullableOperationError(
				state,
				flagged,
				unwrapToIdentifier(node.argument),
			);
		}
	};

	walk(state.ast, { enter });
};
