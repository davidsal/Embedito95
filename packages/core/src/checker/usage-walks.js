import { AST_NODE, ERROR_CODE, SEVERITY } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { stripTypeArguments } from "./async-task-type.js";
import { getDeclaration } from "./declaration-accessors.js";
import { getRootName } from "./types.js";
import { walk } from "./walk.js";

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

const collectReferencedTypes = (node, target) => {
	if (node.typeAnnotation?.members) {
		for (const member of node.typeAnnotation.members) {
			collectTypeNames(member.name, target);
		}
	}
	if (node.returnTypeAnnotation?.members) {
		for (const member of node.returnTypeAnnotation.members) {
			collectTypeNames(member.name, target);
		}
	}
	if (typeof node.returnType === "string") {
		collectTypeNames(node.returnType, target);
	} else if (node.returnType?.name) {
		collectTypeNames(node.returnType.name, target);
	}
	if (node.targetType?.name) {
		collectTypeNames(node.targetType.name, target);
	}
};

export const collectUsageInfo = (state) => {
	walk(state.ast, {
		skipKeys: ["id", "nameIdent"],
		enter: (node) => {
			if (
				node.type === AST_NODE.callExpression &&
				node.callee?.type === AST_NODE.identifier
			) {
				state.calls.push({ name: node.callee.name, location: node.callee.loc });
			}
			if (node.type === AST_NODE.identifier) {
				state.referencedNames.add(node.name);
			}
			if (
				node.type === AST_NODE.variableDeclaration &&
				!state.topLevelSet.has(node)
			) {
				const declaration = getDeclaration(node);
				const name = declaration?.id?.name;
				if (name) {
					state.localDeclarations.push({
						name,
						statement: node,
						declaration,
					});
				}
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
		...[...state.defined].map(([name, statement]) => ({
			name,
			statement,
			declaration: getDeclaration(statement),
		})),
		...state.localDeclarations,
	];

	for (const { name, statement, declaration } of unusedCandidates) {
		if (
			state.referencedNames.has(name) ||
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
