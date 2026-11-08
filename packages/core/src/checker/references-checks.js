import { AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { getDeclaration } from "./declaration-accessors.js";
import { selfContextStack } from "./expression-objects.js";
import { getImportEffectiveName } from "./imports.js";
import { isBefore, REQUIRED_FUNCTIONS } from "./types.js";
import { scopeEnter, scopeExit, walk } from "./walk.js";

export const checkUndefinedReferences = (state) => {
	const knownNames = new Set(REQUIRED_FUNCTIONS);
	for (const name of state.defined.keys()) {
		knownNames.add(name);
	}
	for (const statement of state.ast.body) {
		if (statement.type === AST_NODE.importDeclaration && statement.source) {
			for (const specifier of statement.specifiers)
				knownNames.add(getImportEffectiveName(specifier));
		}
	}

	walk(state.ast, {
		enter: (node) => {
			if (node.type === AST_NODE.functionExpression) {
				for (const param of node.params) {
					if (param?.name) knownNames.add(param.name);
				}
			}
		},
	});

	const options = {
		skipKeys: ["callee", "id"],
		enter: (node) => {
			if (node.type === AST_NODE.importDeclaration) return false;
			if (node.type === AST_NODE.enumDeclaration) {
				for (const member of node.members) knownNames.add(member.name);
				return false;
			}
			if (node.type === AST_NODE.typeDeclaration) {
				knownNames.add(node.name);
				return false;
			}
			if (node.type === AST_NODE.variableDeclaration) {
				const declaration = getDeclaration(node);
				if (declaration?.id?.name) knownNames.add(declaration.id.name);
				if (declaration?.init) walk(declaration.init, options);
				return false;
			}
			if (node.type === AST_NODE.objectLiteral) {
				const typeName = state.objectLiteralTypeMap.get(node);
				if (typeName) {
					selfContextStack.push(typeName);
				}
				return;
			}
			if (node.type === AST_NODE.thisExpression) {
				if (selfContextStack.length === 0) {
					state.errors.push(
						makeDiagnostic({
							code: ERROR_CODE.undefinedReference,
							params: { name: "this" },
							location: node.loc,
						}),
					);
				}
				return;
			}
			if (node.type === AST_NODE.callExpression && node.callee) {
				walk(node.callee, options);
				for (const argument of node.arguments) walk(argument, options);
				return false;
			}
			if (node.type === AST_NODE.memberExpression) {
				walk(node.object, options);
				const memberName = node.property?.name;
				if (node.object?.type === AST_NODE.thisExpression) {
					if (selfContextStack.length === 0) {
						state.errors.push(
							makeDiagnostic({
								code: ERROR_CODE.undefinedReference,
								params: { name: "this" },
								location: node.object.loc,
							}),
						);
					} else if (memberName) {
						const typeName = selfContextStack[selfContextStack.length - 1];
						const type = state.objectTypes[typeName];
						if (
							type &&
							!type.fields?.[memberName] &&
							!type.methods?.[memberName] &&
							!type.capturedFieldTypes?.has(memberName)
						) {
							state.errors.push(
								makeDiagnostic({
									code: ERROR_CODE.undefinedReference,
									params: { name: `this.${memberName}` },
									location: node.property.loc ?? node.loc,
								}),
							);
						}
					}
					return false;
				}
				if (node.object?.type === AST_NODE.identifier && memberName) {
					if (
						node.property?.name &&
						state.libEnumTypeNames.has(node.object.name)
					) {
						if (
							!state.libEnumMembersByType[node.object.name]?.has(memberName)
						) {
							state.errors.push(
								makeDiagnostic({
									code: ERROR_CODE.undefinedReference,
									params: {
										name: `${node.object.name}.${memberName}`,
									},
									location: node.property.loc ?? node.loc,
								}),
							);
						}
					}
				}
				return false;
			}
			if (node.type === AST_NODE.identifier && !knownNames.has(node.name)) {
				state.errors.push(
					makeDiagnostic({
						code: ERROR_CODE.undefinedReference,
						params: { name: node.name },
						location: node.loc,
					}),
				);
			}
		},
		exit: (node) => {
			if (node.type === AST_NODE.objectLiteral) {
				const typeName = state.objectLiteralTypeMap.get(node);
				if (typeName) {
					selfContextStack.pop();
				}
			}
		},
	};
	walk(state.ast, options);
};

export const checkUsedBeforeDeclaration = (state) => {
	const seen = new Set();
	for (const call of state.calls) {
		const definition = state.defined.get(call.name);
		if (!definition) continue;
		const key = `${call.location.start.line}:${call.location.start.column}:${call.name}`;
		if (seen.has(key)) continue;
		seen.add(key);
		if (isBefore(call.location.start, definition.loc.start)) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.usedBeforeDeclaration,
					params: { name: call.name },
					location: call.location,
				}),
			);
		}
	}
};

export const checkScopeDuplicates = (state) => {
	const scopeStack = [];

	const allNames = new Set(REQUIRED_FUNCTIONS);

	for (const name of state.defined.keys()) {
		allNames.add(name);
	}
	for (const statement of state.ast.body) {
		if (statement.type === AST_NODE.importDeclaration && statement.source) {
			for (const specifier of statement.specifiers) {
				allNames.add(getImportEffectiveName(specifier));
			}
		}
	}
	scopeStack.push(allNames);

	walk(state.ast, {
		enter: (node) => {
			scopeEnter(node, scopeStack);
			if (
				node.type === AST_NODE.variableDeclaration &&
				!state.topLevelSet.has(node)
			) {
				const declaration = getDeclaration(node);
				const name = declaration?.id?.name;
				if (name) {
					for (const scope of scopeStack) {
						if (scope.has(name)) {
							state.errors.push(
								makeDiagnostic({
									code: ERROR_CODE.duplicateDeclaration,
									params: { name },
									location: declaration.id?.loc ?? node.loc,
								}),
							);
							break;
						}
					}
					scopeStack[scopeStack.length - 1].add(name);
				}
			}
		},
		exit: (node) => {
			scopeExit(node, scopeStack);
		},
	});
};

const collectTypeAnnotationName = (names, annotation) => {
	if (typeof annotation === "string") {
		if (annotation) {
			names.add(annotation);
		}
		return;
	}
	if (!annotation || typeof annotation !== "object") {
		return;
	}
	if (typeof annotation.type === "string" && annotation.type) {
		names.add(annotation.type);
	}
	if (typeof annotation.name === "string" && annotation.name) {
		names.add(annotation.name);
	}
	for (const member of annotation.members ?? []) {
		if (typeof member === "string") {
			names.add(member);
		} else if (member && typeof member.name === "string") {
			names.add(member.name);
		}
	}
};

// Names a function binds in its own scope: its parameters plus every variable it
// declares (including nested functions). Identifiers NOT in this set are free
// references to the enclosing/module scope. Shared by the checker (to reject an
// inline callback method that captures local state) and the closure codegen (to
// rewrite captures into `this.<name>`).
export const collectBoundNames = (functionExpression) => {
	const bound = new Set();
	for (const param of functionExpression?.params ?? []) {
		if (param?.name) {
			bound.add(param.name);
		}
	}
	walk(functionExpression, {
		enter: (node) => {
			if (node.type === AST_NODE.variableDeclaration) {
				for (const declaration of node.declarations ?? []) {
					if (declaration?.id?.name) {
						bound.add(declaration.id.name);
					}
				}
			}
		},
	});
	return bound;
};

export const collectReferencedNames = (ast) => {
	const names = new Set();

	const options = {
		enter: (node) => {
			if (node.type === AST_NODE.importDeclaration) {
				return false;
			}
			if (node.type === AST_NODE.variableDeclaration) {
				const declaration = getDeclaration(node);
				collectTypeAnnotationName(names, declaration?.id?.typeAnnotation);
				if (declaration?.init) walk(declaration.init, options);
				return false;
			}
			if (node.type === AST_NODE.functionExpression) {
				for (const param of node.params) {
					collectTypeAnnotationName(names, param?.typeAnnotation);
				}
				collectTypeAnnotationName(names, node.returnType);
				return;
			}
			if (node.type === AST_NODE.typeDeclaration) {
				for (const member of node.members ?? []) {
					collectTypeAnnotationName(names, member?.typeAnnotation);
					collectTypeAnnotationName(names, member?.returnType);
				}
				return false;
			}
			if (node.type === AST_NODE.asExpression && node.targetType?.name) {
				names.add(node.targetType.name);
			}
			if (node.type === AST_NODE.identifier) {
				names.add(node.name);
			}
		},
	};

	walk(ast, options);

	return names;
};

export const collectReferences = (state) => {
	for (const call of state.calls) {
		state.referenced.add(call.name);
	}
	for (const name of collectReferencedNames(state.ast)) {
		state.referenced.add(name);
	}
};
