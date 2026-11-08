import {
	AST_NODE,
	ASYNC_BUILTIN_NAMES,
	ASYNC_LIBRARY_NAME,
	ERROR_CODE,
	SEVERITY,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { walk } from "./walk.js";

export const expressionHasEffect = (node) => {
	if (!node || typeof node !== "object") {
		return false;
	}
	switch (node.type) {
		case AST_NODE.callExpression:
		case AST_NODE.assignmentExpression:
		case AST_NODE.updateExpression:
		case AST_NODE.awaitExpression:
			return true;
		case AST_NODE.unaryExpression:
			return expressionHasEffect(node.argument);
		case AST_NODE.binaryExpression:
			return expressionHasEffect(node.left) || expressionHasEffect(node.right);
		case AST_NODE.conditionalExpression:
			return (
				expressionHasEffect(node.test) ||
				expressionHasEffect(node.consequent) ||
				expressionHasEffect(node.alternate)
			);
		case AST_NODE.parenthesizedExpression:
		case AST_NODE.asExpression:
			return expressionHasEffect(node.expression);
		default:
			return false;
	}
};

export const checkAwaitUsage = (ast, errors) => {
	const asyncContextStack = [false];
	walk(ast, {
		enter: (node) => {
			if (node.type === AST_NODE.functionExpression) {
				asyncContextStack.push(node.async === true);
				return;
			}
			if (node.type === AST_NODE.awaitExpression) {
				if (asyncContextStack[asyncContextStack.length - 1] !== true) {
					errors.push(
						makeDiagnostic({
							code: ERROR_CODE.awaitOutsideAsync,
							location: node.loc,
						}),
					);
				}
			}
		},
		exit: (node) => {
			if (node.type === AST_NODE.functionExpression) {
				asyncContextStack.pop();
			}
		},
	});
};

const collectAsyncBuiltinNames = (ast) => {
	const names = new Set();
	for (const statement of ast.body ?? []) {
		if (
			statement.type !== AST_NODE.importDeclaration ||
			statement.source !== ASYNC_LIBRARY_NAME
		) {
			continue;
		}
		for (const specifier of statement.specifiers ?? []) {
			if (ASYNC_BUILTIN_NAMES.has(specifier.name)) {
				names.add(specifier.alias ?? specifier.name);
			}
		}
	}
	return names;
};

const unwrapAwaitedArgument = (node) => {
	let current = node;
	while (
		current?.type === AST_NODE.parenthesizedExpression ||
		current?.type === AST_NODE.asExpression
	) {
		current = current.expression;
	}
	return current;
};

// Calls to the core async timing builtins (`sleep`, `sleepMicros`) are only
// valid inside an `async` function and must be awaited. Awaited calls in a
// non-async context are already reported by `checkAwaitUsage`.
export const checkAsyncBuiltinCalls = (state) => {
	const { ast, errors } = state;
	const asyncBuiltinNames = collectAsyncBuiltinNames(ast);

	if (asyncBuiltinNames.size === 0) {
		return;
	}

	const asyncContextStack = [false];
	const awaitedCalls = new Set();

	walk(ast, {
		enter: (node) => {
			if (node.type === AST_NODE.functionExpression) {
				asyncContextStack.push(node.async === true);
				return;
			}
			if (node.type === AST_NODE.awaitExpression) {
				const awaited = unwrapAwaitedArgument(node.argument);
				if (awaited?.type === AST_NODE.callExpression) {
					awaitedCalls.add(awaited);
				}
				return;
			}
			if (
				node.type === AST_NODE.callExpression &&
				node.callee?.type === AST_NODE.identifier &&
				asyncBuiltinNames.has(node.callee.name) &&
				!awaitedCalls.has(node)
			) {
				const inAsync =
					asyncContextStack[asyncContextStack.length - 1] === true;
				errors.push(
					makeDiagnostic({
						code: inAsync
							? ERROR_CODE.missingAwait
							: ERROR_CODE.asyncBuiltinOutsideAsync,
						params: { name: node.callee.name },
						location: node.loc,
					}),
				);
			}
		},
		exit: (node) => {
			if (node.type === AST_NODE.functionExpression) {
				asyncContextStack.pop();
			}
		},
	});
};

const collectSwitchCaseMembers = (switchNode) => {
	const members = new Set();
	for (const switchCase of switchNode.cases ?? []) {
		if (
			switchCase.test?.type === AST_NODE.memberExpression &&
			switchCase.test.property?.name
		) {
			members.add(switchCase.test.property.name);
		}
	}
	return members;
};

const resolveEnumMemberNames = (state, typeName) => {
	const declaration = state.defined.get(typeName);
	if (declaration?.type === AST_NODE.enumDeclaration) {
		return declaration.members.map((member) => {
			return member.name;
		});
	}
	const libraryMembers = state.libEnumMembersByType?.[typeName];
	if (libraryMembers) {
		return [...libraryMembers];
	}
	return null;
};

export const checkSwitchStatements = (state) => {
	walk(state.ast, {
		enter: (node) => {
			if (node.type !== AST_NODE.switchStatement) {
				return;
			}
			const cases = node.cases ?? [];
			const hasDefault = cases.some((switchCase) => {
				return !switchCase.test;
			});
			if (hasDefault) {
				return;
			}
			const discriminantType = state.context.resolveCheckExpressionType(
				node.discriminant,
			);
			const expectedMembers = discriminantType
				? resolveEnumMemberNames(state, discriminantType)
				: null;
			if (!expectedMembers) {
				return;
			}
			const coveredMembers = collectSwitchCaseMembers(node);
			const missingMembers = expectedMembers.filter((member) => {
				return !coveredMembers.has(member);
			});
			if (missingMembers.length === 0) {
				return;
			}
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.nonExhaustiveSwitch,
					params: {
						type: discriminantType,
						members: missingMembers.join(", "),
					},
					location: node.loc,
				}),
			);
		},
	});
};

export const checkUnreachableCode = (ast, errors, source) => {
	const sourceLines = source ? source.split("\n") : null;

	walk(ast, {
		enter: (node) => {
			if (node.type !== AST_NODE.blockStatement) {
				return;
			}

			let returned = false;

			for (const statement of node.body) {
				if (returned) {
					const start = statement.loc?.start;
					let location = statement.loc;

					if (start && sourceLines) {
						const lineLength = (sourceLines[start.line - 1] ?? "").length;
						location = {
							start,
							end: { line: start.line, column: lineLength + 1 },
						};
					}

					errors.push(
						makeDiagnostic({
							code: ERROR_CODE.unreachableCode,
							location,
							severity: SEVERITY.warning,
						}),
					);
					continue;
				}
				if (statement.type === AST_NODE.returnStatement) {
					returned = true;
				}
			}
		},
	});
};
