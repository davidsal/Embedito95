import { AST_NODE, DATA_TYPE, ERROR_CODE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { getDeclaration } from "./declaration-accessors.js";
import { getImportEffectiveName } from "./imports.js";
import {
	capturesLocalState,
	collectFreeNames,
} from "./object-method-validation.js";
import { collectBoundNames } from "./references-checks.js";
import { inferFunctionReturnType } from "./return-inference.js";

const PARAMETER_SEPARATOR = ", ";
const NOT_A_FUNCTION_DETAIL = "value is not a function";

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

const resolveExpectedFunctionType = (param) => {
	if (!param) {
		return null;
	}
	return param.typeAnnotation?.functionType ?? param.functionType ?? null;
};

const describeSignature = (signature) => {
	if (!signature) {
		return DATA_TYPE.void;
	}
	const parameters = (signature.params ?? [])
		.map((param) => {
			if (!param.type) {
				return param.name ?? "";
			}
			return `${param.name}: ${param.type}`;
		})
		.join(PARAMETER_SEPARATOR);
	const returnType = signature.returnType ?? DATA_TYPE.void;
	return `(${parameters}) => ${returnType}`;
};

const resolveActualReturnType = (state, functionNode) => {
	if (functionNode.returnType?.name) {
		return functionNode.returnType.name;
	}
	const inferred = inferFunctionReturnType(
		functionNode,
		(name, loc) => state.variableTypes.resolve(name, loc),
		state.resolveCallType,
		state.wordSize,
		state.ast,
		state.objectTypes,
	);
	return inferred.type ?? DATA_TYPE.void;
};

const buildSignatureFromFunctionNode = (state, functionNode) => {
	return {
		params: (functionNode.params ?? []).map((param) => ({
			name: param.name,
			type: param.typeAnnotation?.type ?? null,
		})),
		returnType: resolveActualReturnType(state, functionNode),
	};
};

const buildSignatureFromDefinition = (definition) => {
	return {
		params: (definition.params ?? []).map((param) => ({
			name: param.name,
			type: param.type ?? null,
		})),
		returnType: definition.returnType ?? DATA_TYPE.void,
	};
};

const findUserFunctionNode = (state, name) => {
	const statement = state.defined?.get(name);
	const declaration = statement ? getDeclaration(statement) : null;
	return declaration?.init?.type === AST_NODE.functionExpression
		? declaration.init
		: null;
};

const compareSignatures = (expected, actual) => {
	const expectedParams = expected.params ?? [];
	const actualParams = actual.params ?? [];
	if (expectedParams.length !== actualParams.length) {
		return `parameter count (expected ${expectedParams.length}, found ${actualParams.length})`;
	}
	for (const [index, expectedParam] of expectedParams.entries()) {
		const actualParam = actualParams[index];
		const expectedType = expectedParam.type ?? null;
		const actualType = actualParam.type ?? null;
		if (expectedType && actualType && expectedType !== actualType) {
			return `parameter '${expectedParam.name}' type (expected '${expectedType}', found '${actualType}')`;
		}
	}
	const expectedReturnType = expected.returnType ?? DATA_TYPE.void;
	const actualReturnType = actual.returnType ?? DATA_TYPE.void;
	if (expectedReturnType !== actualReturnType) {
		return `return type (expected '${expectedReturnType}', found '${actualReturnType}')`;
	}
	return null;
};

const pushSignatureMismatch = (
	state,
	param,
	expected,
	actual,
	detail,
	location,
) => {
	state.errors.push(
		makeDiagnostic({
			code: ERROR_CODE.callbackSignatureMismatch,
			params: {
				name: param?.name ?? "",
				expected: describeSignature(expected),
				actual: describeSignature(actual),
				detail,
			},
			location,
		}),
	);
};

const checkNamedCallbackArgument = (state, argument, param, expected) => {
	const resolvedName =
		state.resolveImportedName?.(argument.name) ?? argument.name;
	const functionNode = findUserFunctionNode(state, argument.name);
	const definition = state.functionDefinitions?.[resolvedName];
	if (!functionNode && !definition) {
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
	const actual = functionNode
		? buildSignatureFromFunctionNode(state, functionNode)
		: buildSignatureFromDefinition(definition);
	const detail = compareSignatures(expected, actual);
	if (detail) {
		pushSignatureMismatch(state, param, expected, actual, detail, argument.loc);
	}
};

const checkArrowCallbackArgument = (state, argument, param, expected) => {
	const localNames = state.context.resolveLocalBindingNames();
	const capturesLocal =
		capturesLocalState(argument, localNames) ||
		referencesOutsideModuleScope(
			argument,
			collectTopLevelBindingNames(state.ast),
		);
	if (capturesLocal) {
		state.errors.push(
			makeDiagnostic({
				code: ERROR_CODE.callbackCapturesLocalState,
				params: { name: param?.name ?? "" },
				location: argument.loc,
			}),
		);
		return;
	}
	const actual = buildSignatureFromFunctionNode(state, argument);
	const detail = compareSignatures(expected, actual);
	if (detail) {
		pushSignatureMismatch(state, param, expected, actual, detail, argument.loc);
	}
};

// A function-typed parameter lowers to a C function pointer, so its argument
// must be a function whose parameter and return types match the declared
// signature exactly (like a C function pointer: `() => i16` does not convert to
// `() => void`). A named function or a captureless inline arrow is accepted; an
// inline arrow that references local state would need a closure and is rejected.
export const checkCallbackSignatureArgument = (state, argument, param) => {
	const expected = resolveExpectedFunctionType(param);
	if (!expected) {
		return;
	}
	if (argument.type === AST_NODE.identifier) {
		checkNamedCallbackArgument(state, argument, param, expected);
		return;
	}
	if (argument.type === AST_NODE.functionExpression) {
		checkArrowCallbackArgument(state, argument, param, expected);
		return;
	}
	pushSignatureMismatch(
		state,
		param,
		expected,
		null,
		NOT_A_FUNCTION_DETAIL,
		argument.loc,
	);
};
