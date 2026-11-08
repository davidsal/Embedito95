import { AST_NODE } from "../constants.js";

export const SCOPE_NODE_TYPES = new Set([
	AST_NODE.blockStatement,
	AST_NODE.whileStatement,
	AST_NODE.forStatement,
	AST_NODE.doWhileStatement,
	AST_NODE.switchStatement,
]);

export const walk = (node, { enter, exit, skipKeys = [] } = {}) => {
	if (!node || typeof node !== "object") {
		return;
	}
	if (enter) {
		const result = enter(node);
		if (result === false) {
			return;
		}
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === "loc" || skipKeys.includes(key)) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				walk(item, { enter, exit, skipKeys });
			}
		} else if (typeof value === "object" && value !== null) {
			walk(value, { enter, exit, skipKeys });
		}
	}
	if (exit) {
		exit(node);
	}
};

export const scopeEnter = (node, scopeStack) => {
	if (SCOPE_NODE_TYPES.has(node.type)) {
		scopeStack.push(new Set());
	}
};

export const scopeExit = (node, scopeStack) => {
	if (SCOPE_NODE_TYPES.has(node.type)) {
		scopeStack.pop();
	}
};
