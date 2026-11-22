import { AST_NODE, ERROR_CODE, SEVERITY } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { stripTypeArguments } from "./async-task-type.js";
import { getDeclaration } from "./declaration-accessors.js";
import { getRootName } from "./types.js";
import { SCOPE_NODE_TYPES, walk } from "./walk.js";

const collectTypeNames = (name, target) => {
	if (typeof name !== "string") {
		return;
	}
	for (const part of name.split("|")) {
		let base = part
			.trim()
			.replace(/\[[^\]]*\]$/, "")
			.trim();
		while (base.endsWith("[]")) {
			base = base.slice(0, -2).trim();
		}
		base = stripTypeArguments(base);
		if (base && !base.includes(".")) {
			target.add(base);
		}
	}
};

const collectAnnotationTypes = (annotation, target) => {
	if (!annotation) {
		return;
	}
	if (annotation.functionType) {
		for (const param of annotation.functionType.params ?? []) {
			collectAnnotationTypes(param.typeAnnotation, target);
		}
		collectAnnotationTypes(
			annotation.functionType.returnTypeAnnotation,
			target,
		);
		return;
	}
	if (annotation.members) {
		for (const member of annotation.members) {
			collectTypeNames(member.name, target);
		}
		return;
	}
	collectTypeNames(annotation.type, target);
};

const collectReferencedTypes = (node, target) => {
	collectAnnotationTypes(node.typeAnnotation, target);
	collectAnnotationTypes(node.returnTypeAnnotation, target);
	if (typeof node.returnType === "string") {
		collectTypeNames(node.returnType, target);
	} else if (node.returnType?.name) {
		collectTypeNames(node.returnType.name, target);
	}
	if (node.targetType?.name) {
		collectTypeNames(node.targetType.name, target);
	}
};

const createDeclarationRecord = ({ name, statement, declaration }) => {
	return { name, statement, declaration, used: false };
};

const createBlockScope = () => {
	return { declarations: new Map() };
};

// Function parameters belong to the function body scope so a reference inside
// the function resolves to the parameter instead of an outer homonym.
const createParameterScope = (functionExpression) => {
	const declarations = new Map();
	for (const parameter of functionExpression.params ?? []) {
		if (parameter?.name) {
			declarations.set(
				parameter.name,
				createDeclarationRecord({
					name: parameter.name,
					statement: functionExpression,
					declaration: null,
				}),
			);
		}
	}
	return { declarations };
};

const createGlobalScope = (defined) => {
	const declarations = new Map();
	for (const [name, statement] of defined) {
		declarations.set(
			name,
			createDeclarationRecord({
				name,
				statement,
				declaration: getDeclaration(statement),
			}),
		);
	}
	return { declarations };
};

const currentScope = (scopeStack) => {
	return scopeStack[scopeStack.length - 1];
};

const resolveReference = (scopeStack, name) => {
	for (let index = scopeStack.length - 1; index >= 0; index -= 1) {
		const record = scopeStack[index].declarations.get(name);
		if (record) {
			return record;
		}
	}
	return null;
};

// Registers every local declaration in the nearest enclosing block/loop scope,
// keyed by scope node, before references are resolved. This keeps resolution
// lexical (a reference sees a declaration that appears later in the same scope)
// without leaking a name across sibling scopes.
const collectScopeDeclarations = (state) => {
	const scopeDeclarations = new Map();
	const pendingFunctionBodies = new Map();
	const scopeStack = [];
	walk(state.ast, {
		skipKeys: ["id", "nameIdent"],
		enter: (node) => {
			if (node.type === AST_NODE.functionExpression) {
				pendingFunctionBodies.set(node.body, createParameterScope(node));
			}
			if (SCOPE_NODE_TYPES.has(node.type)) {
				const scope = pendingFunctionBodies.get(node) ?? createBlockScope();
				scopeStack.push(scope);
				scopeDeclarations.set(node, scope);
			}
			if (
				node.type === AST_NODE.variableDeclaration &&
				!state.topLevelSet.has(node)
			) {
				const declaration = getDeclaration(node);
				const name = declaration?.id?.name;
				if (name) {
					const record = createDeclarationRecord({
						name,
						statement: node,
						declaration,
					});
					currentScope(scopeStack).declarations.set(name, record);
					state.localDeclarations.push(record);
				}
			}
		},
		exit: (node) => {
			if (node.type === AST_NODE.functionExpression) {
				pendingFunctionBodies.delete(node.body);
			}
			if (SCOPE_NODE_TYPES.has(node.type)) {
				scopeStack.pop();
			}
		},
	});
	return scopeDeclarations;
};

export const collectUsageInfo = (state) => {
	const globalScope = createGlobalScope(state.defined);
	state.globalDeclarationRecords = globalScope.declarations;
	const scopeDeclarations = collectScopeDeclarations(state);
	const scopeStack = [globalScope];
	walk(state.ast, {
		skipKeys: ["id", "nameIdent"],
		enter: (node) => {
			if (SCOPE_NODE_TYPES.has(node.type)) {
				scopeStack.push(scopeDeclarations.get(node) ?? createBlockScope());
			}
			if (
				node.type === AST_NODE.callExpression &&
				node.callee?.type === AST_NODE.identifier
			) {
				state.calls.push({ name: node.callee.name, location: node.callee.loc });
			}
			if (node.type === AST_NODE.identifier) {
				state.referencedNames.add(node.name);
				const record = resolveReference(scopeStack, node.name);
				if (record) {
					record.used = true;
				}
			}
		},
		exit: (node) => {
			if (SCOPE_NODE_TYPES.has(node.type)) {
				scopeStack.pop();
			}
		},
	});

	// Type annotations live under keys the walk above skips (e.g. a variable
	// declarator's `id`), so collect them in a dedicated pass.
	walk(state.ast, {
		enter: (node) => {
			collectReferencedTypes(node, state.referencedTypes);
		},
	});
};

export const checkUnusedDeclarations = (state) => {
	if (state.isLibrary) {
		return;
	}
	const unusedCandidates = [
		...state.globalDeclarationRecords.values(),
		...state.localDeclarations,
	];

	for (const { name, statement, declaration, used } of unusedCandidates) {
		if (
			used ||
			statement.export ||
			statement.type === AST_NODE.enumDeclaration
		) {
			continue;
		}
		const isFunc = declaration?.init?.type === AST_NODE.functionExpression;
		state.errors.push(
			makeDiagnostic({
				code: isFunc ? ERROR_CODE.unusedFunction : ERROR_CODE.unusedConstant,
				params: { name },
				location: declaration?.id?.loc ?? statement.loc,
				severity: SEVERITY.warning,
				tag: 1,
			}),
		);
		state.unusedNames.add(name);
	}

	for (const { name, statement, nameIdent } of state.typeDeclarations) {
		if (state.referencedTypes.has(name) || statement.export) {
			continue;
		}
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.unusedType,
				params: { name },
				location: nameIdent?.loc ?? statement.loc,
				severity: SEVERITY.warning,
				tag: 1,
			}),
		);
		state.unusedNames.add(name);
	}

	for (const { name, statement, nameIdent } of state.enumDeclarations) {
		if (state.referencedNames.has(name) || statement.export) {
			continue;
		}
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.unusedEnum,
				params: { name },
				location: nameIdent?.loc ?? statement.loc,
				severity: SEVERITY.warning,
				tag: 1,
			}),
		);
		state.unusedNames.add(name);
	}
};

export const checkPreferConst = (state) => {
	const reassignedNames = new Set();
	const mutableDeclarations = [];

	walk(state.ast, {
		enter: (node) => {
			if (
				node.type === AST_NODE.assignmentExpression &&
				node.left?.type === AST_NODE.identifier
			) {
				reassignedNames.add(node.left.name);
			}
			if (
				node.type === AST_NODE.assignmentExpression &&
				node.left?.type !== AST_NODE.identifier
			) {
				reassignedNames.add(getRootName(node.left));
			}
			if (
				node.type === AST_NODE.updateExpression &&
				node.argument?.type === AST_NODE.identifier
			) {
				reassignedNames.add(node.argument.name);
			}
			if (
				node.type === AST_NODE.callExpression &&
				node.callee?.type === AST_NODE.memberExpression
			) {
				const methodName = node.callee.property?.name;
				if (methodName === "push" || methodName === "pop") {
					reassignedNames.add(node.callee.object?.name);
				}
			}
			if (node.type === AST_NODE.variableDeclaration && node.kind === "let") {
				const declaration = node.declarations?.[0];

				if (declaration?.init) {
					mutableDeclarations.push({
						name: declaration.id?.name,
						declaration,
						statement: node,
					});
				}
			}
		},
	});

	for (const { name, declaration, statement } of mutableDeclarations) {
		if (name && !reassignedNames.has(name) && !state.unusedNames.has(name)) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.preferConst,
					params: { name },
					location: declaration.id?.loc ?? statement.loc,
					severity: SEVERITY.warning,
				}),
			);
		}
	}
};
