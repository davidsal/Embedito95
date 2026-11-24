import {
	AST_NODE,
	ASYNC_BUILTIN_NAMES,
	ASYNC_LIBRARY_NAME,
	ERROR_CODE,
	SEVERITY,
	UNRESOLVED_TYPE,
} from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { isAsyncTaskType } from "./async-task-type.js";
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

// A callable type is expressed as an arrow signature (`(value: i16) => void`).
// The checker never builds a function value type of its own, so the arrow is the
// only marker needed here; primitives, shapes, enums and `AsyncTask<T>` lack it.
const FUNCTION_TYPE_ARROW = "=>";

const unwrapInitializer = (node) => {
	let current = node;
	while (current?.type === AST_NODE.parenthesizedExpression) {
		current = current.expression;
	}
	return current ?? null;
};

// Declarations live in two places: module-level ones in `globalDeclarationRecords`
// (built from `state.defined`) and block/function locals in `localDeclarations`.
const findDeclarationRecord = (state, name) => {
	const globalRecord = state.globalDeclarationRecords?.get(name);
	if (globalRecord) {
		return globalRecord;
	}
	const localDeclarations = state.localDeclarations ?? [];
	for (let index = localDeclarations.length - 1; index >= 0; index--) {
		const record = localDeclarations[index];
		if (record.name === name && record.declaration) {
			return record;
		}
	}
	return null;
};

const isKnownFunctionName = (state, name) => {
	const resolvedName = state.resolveImportedName(name);
	if (state.functionDefinitions[resolvedName]) {
		return true;
	}
	const record = findDeclarationRecord(state, name);
	return (
		unwrapInitializer(record?.declaration?.init)?.type ===
		AST_NODE.functionExpression
	);
};

// `const f = getPersona; f()` has no plain function type, so it would otherwise
// look unresolved. Detecting that the initializer is a known function makes the
// unsupported "call through a variable" case explicit instead of silent.
const resolveFunctionReferenceName = (state, calleeName) => {
	const record = findDeclarationRecord(state, calleeName);
	const initializer = unwrapInitializer(record?.declaration?.init);
	if (initializer?.type !== AST_NODE.identifier) {
		return null;
	}
	return isKnownFunctionName(state, initializer.name) ? initializer.name : null;
};

const resolveCallTargetType = (state, name, resolvedName, callee) => {
	const variableType = state.variableTypes.resolve(name, callee.loc);
	if (variableType && variableType !== UNRESOLVED_TYPE) {
		return variableType;
	}
	const libraryType = state.libNameToType?.[resolvedName];
	return libraryType ?? null;
};

const pushCallTargetDiagnostic = (state, node, name, type) => {
	if (isAsyncTaskType(type)) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.asyncTaskCall,
				params: { name, type },
				location: node.callee.loc,
			}),
		);
		return;
	}
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.callTargetNotCallable,
			params: { name, type },
			location: node.callee.loc,
		}),
	);
};

// `value()` is only valid when `value` resolves to a function definition, a
// function-typed parameter or a library function. Everything else (integers,
// strings, booleans, objects, shapes, enums, `AsyncTask<T>`, function
// references) would emit a C++ call on a non-callable value, so it stops in the
// checker at the callee instead of failing later in the intermediate.
export const checkCallExpressionTargets = (state) => {
	walk(state.ast, {
		enter: (node) => {
			if (node.type !== AST_NODE.callExpression) {
				return;
			}
			const callee = node.callee;
			if (callee?.type !== AST_NODE.identifier || !callee.name) {
				return;
			}
			const name = callee.name;
			const resolvedName = state.resolveImportedName(name);
			if (state.functionDefinitions[resolvedName]) {
				return;
			}
			const type = resolveCallTargetType(state, name, resolvedName, callee);
			if (!type) {
				const functionReferenceName = resolveFunctionReferenceName(state, name);
				if (functionReferenceName) {
					state.errors.push(
						makeDiagnostic({
							code: ERROR_CODE.functionReferenceCall,
							params: { name, target: functionReferenceName },
							location: callee.loc,
						}),
					);
				}
				return;
			}
			if (type.includes(FUNCTION_TYPE_ARROW)) {
				return;
			}
			pushCallTargetDiagnostic(state, node, name, type);
		},
	});
};

export const checkAwaitUsage = (state) => {
	const { ast, errors } = state;
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
				const awaitedType = state.context.resolveCheckExpressionType(
					node.argument,
				);
				if (
					awaitedType &&
					awaitedType !== UNRESOLVED_TYPE &&
					!isAsyncTaskType(awaitedType)
				) {
					errors.push(
						makeDiagnostic({
							code: ERROR_CODE.invalidAwaitTarget,
							params: { type: awaitedType },
							location: node.argument?.loc ?? node.loc,
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
