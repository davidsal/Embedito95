import { AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { walk } from "./walk.js";

// A closure's captured variables become fields of its handle struct, but they are
// never declared in the type, so the checker does not know them. Without this
// pass an external `instance.field` would slip through and read the closure's
// private state directly. The closure's own methods reference a captured name as
// a bare identifier (the codegen rewrites it to `this.name`), so the only member
// access to reject is one whose receiver is NOT `this`.
export const checkCapturedFieldAccess = (state) => {
	if (!state.capturedFields || state.capturedFields.size === 0) {
		return;
	}
	walk(state.ast, {
		enter: (node) => {
			if (node.type !== AST_NODE.memberExpression) {
				return;
			}
			if (node.object?.type === AST_NODE.thisExpression) {
				return;
			}
			if (node.computed || node.property?.type !== AST_NODE.identifier) {
				return;
			}
			const receiverType = state.context.resolveCheckExpressionType(
				node.object,
			);
			const captured = state.capturedFields.get(receiverType);
			if (!captured?.has(node.property.name)) {
				return;
			}
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.capturedFieldAccess,
					params: { field: node.property.name, type: receiverType },
					location: node.loc,
				}),
			);
		},
	});
};
