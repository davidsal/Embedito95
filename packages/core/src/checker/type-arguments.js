import { AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { ASYNC_TASK_TYPE_NAME, stripTypeArguments } from "./async-task-type.js";
import { walk } from "./walk.js";

const getAnnotationTypeName = (annotation) => {
	if (typeof annotation?.name === "string") {
		return annotation.name;
	}
	if (typeof annotation?.type === "string") {
		return annotation.type;
	}
	return null;
};

const pushTypeArgumentsNotAllowed = (state, typeName, location) => {
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.typeArgumentsNotAllowed,
			params: { type: typeName },
			location,
		}),
	);
};

const checkTypeArgumentUsage = (state, seen, node) => {
	if (!Array.isArray(node.typeArguments) || node.typeArguments.length === 0) {
		return;
	}
	if (node.type === AST_NODE.typeDeclaration) {
		return;
	}
	const typeName = getAnnotationTypeName(node);
	if (!typeName) {
		return;
	}
	const baseName = stripTypeArguments(typeName);
	if (baseName === ASYNC_TASK_TYPE_NAME) {
		return;
	}
	const location = node.loc ?? node.typeArguments[0]?.loc;
	const key = `${baseName}:${location?.start?.line}:${location?.start?.column}`;
	if (seen.has(key)) {
		return;
	}
	seen.add(key);
	pushTypeArgumentsNotAllowed(state, baseName, location);
};

const checkTypeParameterDeclaration = (state, node) => {
	if (node.type !== AST_NODE.typeDeclaration) {
		return;
	}
	if (!Array.isArray(node.typeParameters) || node.typeParameters.length === 0) {
		return;
	}
	if (node.name === ASYNC_TASK_TYPE_NAME) {
		return;
	}
	pushTypeArgumentsNotAllowed(
		state,
		node.name,
		node.typeParameters[0]?.loc ?? node.nameIdent?.loc ?? node.loc,
	);
};

const enterNode = (state, seen, node) => {
	checkTypeParameterDeclaration(state, node);
	checkTypeArgumentUsage(state, seen, node);
};

export const checkTypeArguments = (state) => {
	const seen = new Set();
	walk(state.ast, {
		enter: (node) => {
			enterNode(state, seen, node);
		},
	});
};
