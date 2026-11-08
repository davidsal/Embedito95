import { evaluateConstant } from "../const-eval.js";
import { AST_NODE, ERROR_CODE, QUOTE_SINGLE, SEVERITY } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { describeExpression } from "./arguments.js";
import { getDeclaration } from "./declaration-accessors.js";
import { expressionHasEffect } from "./passes.js";
import { checkFunctionReturnTypes } from "./return-checking.js";
import { REQUIRED_FUNCTIONS } from "./types.js";
import { walk } from "./walk.js";

export const checkLiteralAndArrayUsage = (state) => {
	walk(state.ast, {
		enter: (node) => {
			if (
				node.type === AST_NODE.literal &&
				node.quote === QUOTE_SINGLE &&
				typeof node.value === "string" &&
				node.value.length !== 1
			) {
				state.errors.push(
					makeDiagnostic({
						code: ERROR_CODE.invalidCharLiteral,
						params: { value: node.value, count: node.value.length },
						location: node.loc,
					}),
				);
			}
		},
	});

	walk(state.ast, {
		enter: (node) => {
			if (node.type !== AST_NODE.arrayLiteral) {
				return;
			}
			const signatures = (node.elements ?? [])
				.map((element) => {
					const value = evaluateConstant(state.ast, element);
					if (typeof value === "number") {
						return Number.isInteger(value) ? "int" : "float";
					}
					if (typeof value === "string") {
						return "string";
					}
					if (typeof value === "boolean") {
						return "boolean";
					}
					if (element?.type === AST_NODE.identifier) {
						const type = state.variableTypes.resolve(element.name, element.loc);
						if (type) {
							return `type:${type}`;
						}
					}
					return null;
				})
				.filter(Boolean);
			if (new Set(signatures).size > 1) {
				state.errors.push(
					makeDiagnostic({
						code: ERROR_CODE.mixedArrayTypes,
						location: node.loc,
					}),
				);
			}
		},
	});
};

export const checkMissingInitializers = (state) => {
	walk(state.ast, {
		enter: (node) => {
			if (node.type !== AST_NODE.variableDeclaration) {
				return;
			}
			const declaration = getDeclaration(node);
			if (declaration && !declaration.init) {
				state.errors.push(
					makeDiagnostic({
						code: ERROR_CODE.missingInitializer,
						params: { name: declaration.id?.name ?? "?" },
						location: declaration.id?.loc ?? node.loc,
					}),
				);
			}
		},
	});
};

export const checkRequiredFunctionsAndSetup = (state) => {
	if (!state.isEntry) {
		return;
	}

	for (const name of REQUIRED_FUNCTIONS) {
		if (!state.defined.has(name)) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.missingRequiredFunction,
					params: { name },
					location: state.ast.loc,
				}),
			);
		}
	}

	const mainStatement = state.defined.get(REQUIRED_FUNCTIONS[1]);
	if (mainStatement) {
		const declaration = getDeclaration(mainStatement);
		if (declaration?.init?.type === AST_NODE.functionExpression) {
			const body = declaration.init.body?.body;
			const first = body?.[0];
			if (
				!first ||
				first.type !== AST_NODE.expressionStatement ||
				first.expression?.type !== AST_NODE.callExpression ||
				first.expression.callee?.name !== REQUIRED_FUNCTIONS[0]
			) {
				state.errors.push(
					makeDiagnostic({
						code: ERROR_CODE.missingSetupCall,
						params: {},
						location: declaration.id?.loc ?? mainStatement.loc,
					}),
				);
			}
		}
	}
};

export const checkExpressionStatements = (state) => {
	walk(state.ast, {
		enter: (node) => {
			if (node.type !== AST_NODE.expressionStatement) {
				return;
			}
			const expression = node.expression;
			if (
				expression?.type === AST_NODE.identifier ||
				expressionHasEffect(expression)
			) {
				return;
			}
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.expectedStatement,
					params: { name: describeExpression(expression) },
					location: expression?.loc ?? node.loc,
				}),
			);
		},
	});
};

export const checkFunctionReturnChecks = (state) => {
	walk(state.ast, {
		enter: (node) => {
			if (node.type !== AST_NODE.variableDeclaration) {
				return;
			}
			const declaration = getDeclaration(node);
			if (declaration?.init?.type !== AST_NODE.functionExpression) {
				return;
			}
			const name = declaration.id?.name ?? "?";

			const declaredType = declaration.id?.typeAnnotation?.type;

			if (declaredType) {
				state.errors.push(
					makeDiagnostic({
						code: ERROR_CODE.functionTypeAnnotation,
						params: { type: declaredType },
						location: declaration.id?.loc ?? node.loc,
					}),
				);
			}

			checkFunctionReturnTypes(
				declaration.init,
				name,
				declaration.init.returnType?.name,
				declaration.id?.loc ?? node.loc,
				state.context.resolveVariableTypeAt,
				state.resolveCallType,
				state.wordSize,
				state.ast,
				state.objectTypes,
				state.errors,
			);
		},
	});

	for (const objectMethod of state.objectMethodReturnTypes) {
		const [methodFunction, methodInfo] = objectMethod;
		checkFunctionReturnTypes(
			methodFunction,
			methodInfo.name,
			methodInfo.returnType,
			methodFunction.loc,
			state.context.resolveVariableTypeAt,
			state.resolveCallType,
			state.wordSize,
			state.ast,
			state.objectTypes,
			state.errors,
		);
	}
};

export const checkUnusedImports = (state) => {
	for (const importItem of state.imported) {
		if (!state.referenced.has(importItem.name)) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.unusedImport,
					params: { name: importItem.name },
					location: importItem.location,
					severity: SEVERITY.warning,
					tag: 1,
				}),
			);
		}
	}
};
