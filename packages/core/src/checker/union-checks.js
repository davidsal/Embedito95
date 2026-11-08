import { AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { isArbitraryUnionType } from "./types.js";
import { walk } from "./walk.js";

const pushUnsupportedUnion = (state, typeName, location, allowCoreLibrary) => {
	if (allowCoreLibrary && state.isCoreLibrary) {
		return;
	}
	if (!isArbitraryUnionType(typeName)) {
		return;
	}
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.arbitraryUnion,
			params: { type: typeName },
			location,
		}),
	);
};

const checkAnnotationUnion = (state, annotation, allowCoreLibrary = false) => {
	if (!annotation?.type || !annotation.loc) {
		return;
	}
	pushUnsupportedUnion(
		state,
		annotation.type,
		annotation.loc,
		allowCoreLibrary,
	);
};

const checkReturnTypeUnion = (state, returnType, allowCoreLibrary = false) => {
	if (!returnType?.name || !returnType.loc) {
		return;
	}
	pushUnsupportedUnion(
		state,
		returnType.name,
		returnType.loc,
		allowCoreLibrary,
	);
};

const checkFunctionUnions = (state, node) => {
	for (const param of node.params) {
		checkAnnotationUnion(state, param.typeAnnotation, true);
	}
	checkReturnTypeUnion(state, node.returnType, true);
};

const checkTypeMemberUnions = (state, member) => {
	if (member.kind !== "method") {
		checkAnnotationUnion(state, member.returnTypeAnnotation);
		return;
	}
	for (const param of member.params ?? []) {
		checkAnnotationUnion(state, param.typeAnnotation, true);
	}
	checkAnnotationUnion(state, member.returnTypeAnnotation, true);
};

const checkTypeDeclarationUnions = (state, node) => {
	for (const member of node.members ?? []) {
		checkTypeMemberUnions(state, member);
	}
};

const enterNode = (state, node) => {
	if (node.type === AST_NODE.variableDeclarator) {
		checkAnnotationUnion(state, node.id?.typeAnnotation);
	}
	if (node.type === AST_NODE.functionExpression) {
		checkFunctionUnions(state, node);
	}
	if (node.type === AST_NODE.typeDeclaration) {
		checkTypeDeclarationUnions(state, node);
	}
};

export const checkTypeUnions = (state) => {
	walk(state.ast, {
		enter: (node) => {
			enterNode(state, node);
		},
	});
};
