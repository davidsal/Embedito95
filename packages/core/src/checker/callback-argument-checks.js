import { AST_NODE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { getImportEffectiveName } from "./imports.js";
import {
	capturesLocalState,
	collectFreeNames,
} from "./object-method-validation.js";
import { collectBoundNames } from "./references-checks.js";

const addStatementBindingNames = (statement, names) => {
	if (statement.type === AST_NODE.variableDeclaration) {
		for (const declaration of statement.declarations ?? []) {
			if (declaration?.id?.name) {
				names.add(declaration.id.name);
			}
		}
		return;
	}
	if (
		statement.type === AST_NODE.enumDeclaration ||
		statement.type === AST_NODE.typeDeclaration
	) {
		names.add(statement.name);
		return;
	}
	if (statement.type === AST_NODE.importDeclaration) {
		for (const specifier of statement.specifiers ?? []) {
			names.add(getImportEffectiveName(specifier));
		}
	}
};

const collectTopLevelBindingNames = (ast) => {
	const names = new Set();
	for (const statement of ast.body ?? []) {
		addStatementBindingNames(statement, names);
	}
	return names;
};

const referencesOutsideModuleScope = (functionExpression, moduleNames) => {
	const boundNames = collectBoundNames(functionExpression);
	const freeNames = new Set();
	collectFreeNames(functionExpression, boundNames, freeNames);
	for (const name of freeNames) {
		if (!moduleNames.has(name)) {
			return true;
		}
	}
	return false;
};

// A parameter declared without a type is a callback slot: it lowers to a C
// function pointer, so its argument must name a top-level function. An inline
// arrow has nowhere to live (the codegen has no lambda form) and, when it
// references a name that is not declared at module scope, it would need
// captured state.
const pushCallbackDiagnostic = (state, code, param, location) => {
	state.errors.push(
		makeDiagnostic({
			code,
			params: { name: param?.name ?? "" },
			location,
		}),
	);
};

export const checkCallbackHandlerArgument = (state, argument, param) => {
	if (!param || param.type) {
		return;
	}
	if (argument.type === AST_NODE.identifier) {
		const resolvedName =
			state.resolveImportedName?.(argument.name) ?? argument.name;
		const definition = state.functionDefinitions?.[resolvedName];
		if (definition) {
			if ((definition.params?.length ?? 0) > 0) {
				pushCallbackDiagnostic(
					state,
					ERROR_CODE.callbackHasParameters,
					{ name: argument.name },
					argument.loc,
				);
			}
			return;
		}
		if (state.defined?.has(argument.name)) {
			state.errors.push(
				makeDiagnostic({
					code: ERROR_CODE.expectedFunction,
					params: { name: argument.name },
					location: argument.loc,
				}),
			);
		}
		return;
	}
	if (argument.type === AST_NODE.functionExpression) {
		if ((argument.params?.length ?? 0) > 0) {
			pushCallbackDiagnostic(
				state,
				ERROR_CODE.callbackHasParameters,
				param,
				argument.loc,
			);
			return;
		}
		const localNames = state.context.resolveLocalBindingNames();
		const capturesLocal =
			capturesLocalState(argument, localNames) ||
			referencesOutsideModuleScope(
				argument,
				collectTopLevelBindingNames(state.ast),
			);
		if (capturesLocal) {
			pushCallbackDiagnostic(
				state,
				ERROR_CODE.callbackCapturesLocalState,
				param,
				argument.loc,
			);
			return;
		}
	}
	pushCallbackDiagnostic(
		state,
		ERROR_CODE.callbackMustBeNamed,
		param,
		argument.loc ?? param.loc,
	);
};
