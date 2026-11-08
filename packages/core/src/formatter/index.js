import { formatNode } from "./format.js";

export { format } from "./format.js";

export const formatExpression = (node) => {
	return formatNode(node, 0, new Map(), "");
};
