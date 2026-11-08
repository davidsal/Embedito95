import { walk } from "../checker/index.js";
import { AST_NODE } from "../constants.js";
import { ASYNC_ADD_SUFFIX } from "./async-constants.js";

const defaultArgumentNode = (param, loc) => {
	if (param?.defaultValue) {
		return { ...param.defaultValue, loc };
	}
	return { type: AST_NODE.literal, value: 0, raw: "0", loc };
};

export const rewriteAsyncCalls = (ast, asyncParameters) => {
	walk(ast, {
		enter: (node) => {
			if (
				node.type !== AST_NODE.callExpression ||
				node.callee?.type !== AST_NODE.identifier
			) {
				return;
			}
			const name = node.callee.name;
			const params = asyncParameters.get(name);
			if (params === undefined) {
				return;
			}
			if (node.arguments.length <= params.length) {
				// Fill omitted trailing parameters that have a default value.
				for (
					let index = node.arguments.length;
					index < params.length;
					index++
				) {
					node.arguments.push(
						defaultArgumentNode(params[index], node.callee.loc),
					);
				}
				node.arguments.push({
					type: AST_NODE.literal,
					value: false,
					raw: "false",
					loc: node.callee.loc,
				});
			}
			node.callee.name = `_${name}${ASYNC_ADD_SUFFIX}`;
		},
	});
};
