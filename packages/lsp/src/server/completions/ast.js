import { AST_NODE } from "embedito95-core";
import { isInLocation } from "../shared/location.js";

const SKIPPED_WALK_KEYS = ["loc", "typeAnnotation"];

const isInsideMethodBody = (node, state) => {
	return (node.properties ?? []).some((property) => {
		return (
			property.value?.type === AST_NODE.functionExpression &&
			isInLocation(state.line, state.column, property.value.body?.loc)
		);
	});
};

const enterEnclosingObjectType = (node, state) => {
	if (node.type === AST_NODE.variableDeclaration) {
		const annotation = node.declarations?.[0]?.id?.typeAnnotation?.type;
		if (annotation) {
			state.typeStack.push(annotation);
		}
	}

	if (node.type === AST_NODE.functionExpression && node.returnType?.name) {
		state.typeStack.push(node.returnType.name);
	}

	if (node.type === AST_NODE.objectLiteral) {
		const typeName = state.typeStack[state.typeStack.length - 1];

		if (typeName && isInLocation(state.line, state.column, node.loc)) {
			const insideMethod = state.excludeMethodBodies
				? isInsideMethodBody(node, state)
				: false;

			if (!insideMethod) {
				state.result = typeName;
			}
		}
	}
};

const exitEnclosingObjectType = (node, state) => {
	if (node.type === AST_NODE.variableDeclaration) {
		state.typeStack.pop();
	}

	if (node.type === AST_NODE.functionExpression && node.returnType?.name) {
		state.typeStack.pop();
	}
};

const walkEnclosingObjectType = (node, state) => {
	if (!node || typeof node !== "object") {
		return;
	}

	enterEnclosingObjectType(node, state);

	for (const [key, value] of Object.entries(node)) {
		if (SKIPPED_WALK_KEYS.includes(key)) {
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				walkEnclosingObjectType(item, state);
			}
		} else if (typeof value === "object" && value !== null) {
			walkEnclosingObjectType(value, state);
		}
	}

	exitEnclosingObjectType(node, state);
};

export const findEnclosingObjectType = (
	syntaxTree,
	position,
	excludeMethodBodies,
) => {
	const state = {
		line: position.line + 1,
		column: position.character + 1,
		typeStack: [],
		result: null,
		excludeMethodBodies,
	};

	walkEnclosingObjectType(syntaxTree, state);

	return state.result;
};
