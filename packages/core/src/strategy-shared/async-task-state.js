import { AST_NODE } from "../constants.js";
import {
	DEFAULT_LOCAL_TYPE,
	TASK_PARAMETER_NAME,
	TASK_STATE_COMPLETED_KEY,
	TASK_STATE_VALUE_KEY,
} from "./async-constants.js";

export const isTaskStateLiteral = (node) => {
	return (
		node?.type === AST_NODE.objectLiteral &&
		(node.properties ?? []).some((property) => {
			return property.key === TASK_STATE_COMPLETED_KEY;
		})
	);
};

export const isIncompleteReturn = (node) => {
	if (node?.type !== AST_NODE.returnStatement) {
		return false;
	}
	const argument = node.argument;
	return (
		argument?.type === AST_NODE.objectLiteral &&
		(argument.properties ?? []).some((property) => {
			return (
				property.key === TASK_STATE_COMPLETED_KEY &&
				property.value?.value === false
			);
		})
	);
};

export const containsIncompleteReturn = (node) => {
	if (!node || typeof node !== "object") {
		return false;
	}
	if (isIncompleteReturn(node)) {
		return true;
	}
	return Object.entries(node).some(([key, value]) => {
		if (key === "loc") {
			return false;
		}
		if (Array.isArray(value)) {
			return value.some((item) => {
				return containsIncompleteReturn(item);
			});
		}
		return containsIncompleteReturn(value);
	});
};

export const stripIncompleteReturns = (node) => {
	if (!node || typeof node !== "object") {
		return;
	}
	if (isIncompleteReturn(node)) {
		node.argument = null;
		return;
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				stripIncompleteReturns(item);
			}
		} else {
			stripIncompleteReturns(value);
		}
	}
};

export const isCompleteOnlyLiteral = (node) => {
	return (
		node?.type === AST_NODE.objectLiteral &&
		node.properties?.length === 1 &&
		node.properties[0].key === TASK_STATE_COMPLETED_KEY &&
		node.properties[0].value?.value === true
	);
};

export const getTaskStateValue = (argument) => {
	if (!isTaskStateLiteral(argument)) {
		return argument;
	}
	const property = (argument.properties ?? []).find((item) => {
		return item.key === TASK_STATE_VALUE_KEY;
	});
	return property ? property.value : null;
};

export const resolveLocalType = (
	declarator,
	functionReturnTypes,
	variableTypes,
) => {
	if (declarator.id?.typeAnnotation?.type) {
		return declarator.id.typeAnnotation.type;
	}
	const inferredType = variableTypes?.resolve?.(
		declarator.id?.name,
		declarator.loc,
	);
	if (inferredType) {
		return inferredType;
	}
	const init = declarator.init;
	const call = init?.type === AST_NODE.awaitExpression ? init.argument : init;
	if (
		call?.type === AST_NODE.callExpression &&
		call.callee?.type === AST_NODE.identifier &&
		functionReturnTypes?.[call.callee.name]
	) {
		return functionReturnTypes[call.callee.name];
	}
	return DEFAULT_LOCAL_TYPE;
};

export const rewriteReferences = (node, names) => {
	if (!node || typeof node !== "object") {
		return;
	}
	if (Array.isArray(node)) {
		for (const item of node) {
			rewriteReferences(item, names);
		}
		return;
	}
	if (node.type === AST_NODE.identifier && names.has(node.name)) {
		const loc = node.loc;
		const name = node.name;
		node.type = AST_NODE.memberExpression;
		node.object = { type: AST_NODE.identifier, name: TASK_PARAMETER_NAME, loc };
		node.property = { type: AST_NODE.identifier, name, loc };
		node.computed = false;
		delete node.name;
		return;
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			continue;
		}
		if (
			node.type === AST_NODE.memberExpression &&
			key === "property" &&
			!node.computed
		) {
			continue;
		}
		if (node.type === AST_NODE.variableDeclarator && key === "id") {
			continue;
		}
		if (node.type === AST_NODE.functionExpression && key === "params") {
			continue;
		}
		rewriteReferences(value, names);
	}
};

// A block-scoped declaration (`const`/`let` anywhere in the body, not just the
// leading ones) is emitted inside a step-machine `case`: C++ rejects jumping
// over its initialization, and if the value is read after an `await` it is read
// after its scope was left. Promote every declaration to a task field and
// replace it with a plain assignment, so `rewriteReferences` rewrites the
// declaration and every use to `task.<name>` like any other hoisted local.
const buildHoistedAssignment = (name, init, loc) => {
	return {
		type: AST_NODE.assignmentExpression,
		operator: "=",
		left: { type: AST_NODE.identifier, name, loc },
		right: init,
		loc,
	};
};

const hoistDeclarator = (declarator, context) => {
	const name = declarator.id?.name;
	if (!name) {
		return null;
	}
	if (!context.hoisted.has(name)) {
		context.hoisted.add(name);
		context.fields.push({
			name,
			type: resolveLocalType(
				declarator,
				context.functionReturnTypes,
				context.variableTypes,
			),
		});
	}
	if (!declarator.init) {
		return null;
	}
	return buildHoistedAssignment(name, declarator.init, declarator.loc);
};

const hoistDeclarationStatements = (declaration, context) => {
	const statements = [];
	for (const declarator of declaration.declarations) {
		const assignment = hoistDeclarator(declarator, context);
		if (!assignment) {
			continue;
		}
		statements.push({
			type: AST_NODE.expressionStatement,
			expression: assignment,
			loc: assignment.loc,
		});
	}
	return statements;
};

const hoistDeclarations = (node, context) => {
	if (!node || typeof node !== "object") {
		return;
	}
	if (Array.isArray(node)) {
		for (let index = 0; index < node.length; index++) {
			const child = node[index];
			if (child?.type === AST_NODE.variableDeclaration) {
				const replacements = hoistDeclarationStatements(child, context);
				node.splice(index, 1, ...replacements);
				index += replacements.length - 1;
			} else {
				hoistDeclarations(child, context);
			}
		}
		return;
	}
	if (node.type === AST_NODE.functionExpression) {
		return;
	}
	if (
		node.type === AST_NODE.forStatement &&
		node.init?.type === AST_NODE.variableDeclaration
	) {
		node.init = hoistDeclarator(node.init.declarations[0], context);
	}
	for (const [key, value] of Object.entries(node)) {
		if (key === "loc") {
			continue;
		}
		hoistDeclarations(value, context);
	}
};

export const collectTaskParams = (functionNode) => {
	return (functionNode.params ?? []).map((param) => {
		return {
			name: param.name,
			type: param.typeAnnotation?.type ?? DEFAULT_LOCAL_TYPE,
			defaultValue: param.defaultValue ?? null,
		};
	});
};

export const hoistTaskLocals = (
	functionNode,
	functionReturnTypes,
	variableTypes = null,
) => {
	const fields = [];
	const context = {
		fields,
		functionReturnTypes,
		variableTypes,
		hoisted: new Set(),
	};

	hoistDeclarations(functionNode.body, context);

	if (fields.length > 0) {
		const names = new Set(
			fields.map((field) => {
				return field.name;
			}),
		);
		for (const statement of functionNode.body.body) {
			rewriteReferences(statement, names);
		}
	}

	return fields;
};
