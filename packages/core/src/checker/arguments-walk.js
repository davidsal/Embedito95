import { AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { checkArgumentAgainstParam } from "./argument-checks.js";
import { checkCallbackHandlerArgument } from "./callback-argument-checks.js";
import { unwrapParentheses } from "./types.js";
import { walk } from "./walk.js";

export const checkFunctionCallArguments = (state) => {
	walk(state.ast, {
		enter: (node) => {
			if (
				node.type === AST_NODE.callExpression &&
				node.callee?.type === AST_NODE.identifier
			) {
				const name = node.callee.name;
				const resolvedName = state.resolveImportedName(name);
				const expected = state.functionParameterCount[resolvedName];
				if (expected !== undefined) {
					const fnDefinition = state.functionDefinitions[resolvedName];
					// Trailing parameters with a default value may be omitted.
					const required = fnDefinition
						? fnDefinition.params.filter((param) => {
								return !param.defaultValue;
							}).length
						: expected;
					const got = node.arguments.length;
					if (got < required || got > expected) {
						state.errors.push(
							makeDiagnostic({
								code: ERROR_CODE.wrongArgumentCount,
								params: { name, expected, got },
								location: node.callee.loc,
							}),
						);
					}

					if (fnDefinition) {
						for (const [
							argumentIndex,
							argumentNode,
						] of node.arguments.entries()) {
							const argument = unwrapParentheses(argumentNode);
							checkCallbackHandlerArgument(
								state,
								argument,
								fnDefinition.params[argumentIndex],
							);
							checkArgumentAgainstParam(
								state,
								argument,
								fnDefinition.params[argumentIndex],
							);
						}
					}
				}
			}
		},
	});
};
