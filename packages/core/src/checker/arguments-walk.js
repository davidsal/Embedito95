import { AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { checkArgumentAgainstParam } from "./argument-checks.js";
import { checkCallbackSignatureArgument } from "./callback-argument-checks.js";
import {
	getFunctionSignatures,
	resolveOverloadSignature,
} from "./overloads.js";
import { unwrapParentheses } from "./types.js";
import { walk } from "./walk.js";

const countRequiredParameters = (signature) => {
	return (signature?.params ?? []).filter((param) => {
		return !param.defaultValue;
	}).length;
};

const signatureAcceptsArgumentCount = (signature, argumentCount) => {
	const expected = (signature?.params ?? []).length;
	return (
		argumentCount >= countRequiredParameters(signature) &&
		argumentCount <= expected
	);
};

const acceptsArgumentCount = (definition, argumentCount) => {
	return getFunctionSignatures(definition).some((signature) => {
		return signatureAcceptsArgumentCount(signature, argumentCount);
	});
};

const resolveArgumentTypes = (state, node) => {
	return node.arguments.map((argumentNode) => {
		const argument = unwrapParentheses(argumentNode);
		return state.context?.resolveCheckExpressionType
			? state.context.resolveCheckExpressionType(argument)
			: null;
	});
};

const checkCallArguments = (state, node, fnDefinition, argumentTypes) => {
	const signature = resolveOverloadSignature(
		fnDefinition,
		argumentTypes,
		state.wordSize,
	);
	const params = signature?.params ?? [];
	for (const [argumentIndex, argumentNode] of node.arguments.entries()) {
		const argument = unwrapParentheses(argumentNode);
		checkCallbackSignatureArgument(state, argument, params[argumentIndex]);
		checkArgumentAgainstParam(state, argument, params[argumentIndex]);
	}
};

const checkCallArgumentCount = (
	state,
	node,
	name,
	fnDefinition,
	argumentTypes,
) => {
	if (acceptsArgumentCount(fnDefinition, node.arguments.length)) {
		return;
	}
	const signature = resolveOverloadSignature(
		fnDefinition,
		argumentTypes,
		state.wordSize,
	);
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.wrongArgumentCount,
			params: {
				name,
				expected: (signature?.params ?? []).length,
				got: node.arguments.length,
			},
			location: node.callee.loc,
		}),
	);
};

export const checkFunctionCallArguments = (state) => {
	walk(state.ast, {
		enter: (node) => {
			if (
				node.type !== AST_NODE.callExpression ||
				node.callee?.type !== AST_NODE.identifier
			) {
				return;
			}
			const name = node.callee.name;
			const resolvedName = state.resolveImportedName(name);
			if (state.functionParameterCount[resolvedName] === undefined) {
				return;
			}
			const fnDefinition = state.functionDefinitions[resolvedName];
			if (!fnDefinition) {
				return;
			}
			const argumentTypes = resolveArgumentTypes(state, node);
			checkCallArgumentCount(state, node, name, fnDefinition, argumentTypes);
			checkCallArguments(state, node, fnDefinition, argumentTypes);
		},
	});
};
