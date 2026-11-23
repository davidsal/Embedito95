import {
	createAsyncTaskType,
	formatExpression,
	inferFunctionReturnType,
} from "embedito95-core";
import { formatObjectShapeType } from "./formatting.js";

const formatFunctionParameter = (parameter, type) => {
	const optional = parameter.defaultValue ? "?" : "";
	const typeSuffix = type ? `: ${type}` : "";
	const defaultValue = parameter.defaultValue
		? ` = ${formatExpression(parameter.defaultValue)}`
		: "";
	return `${parameter.name}${optional}${typeSuffix}${defaultValue}`;
};

// Library exports carry their parameter list and return type already resolved by
// the checker, so the value hover renders the same callable shape without
// re-inferring the library body.
export const getLibraryFunctionSignature = (libraryFunction) => {
	const parameters = (libraryFunction.params ?? [])
		.map((parameter) => {
			return formatFunctionParameter(parameter, parameter.type);
		})
		.join(", ");
	const returnType = libraryFunction.returnType ?? "void";

	return `(${parameters}) => ${formatObjectShapeType(returnType)}`;
};

const formatFunctionExpressionParameters = (functionExpression) => {
	return functionExpression.params
		.map((parameter) => {
			return formatFunctionParameter(parameter, parameter.typeAnnotation?.type);
		})
		.join(", ");
};

export const getFunctionSignature = (
	functionExpression,
	resolveNameType,
	resolveCallType,
	wordSize,
	syntaxTree,
	objectTypes,
) => {
	if (!functionExpression) {
		return null;
	}

	const parameters = formatFunctionExpressionParameters(functionExpression);

	const inferredReturn = inferFunctionReturnType(
		functionExpression,
		resolveNameType,
		resolveCallType,
		wordSize,
		syntaxTree,
		objectTypes,
	).type;
	const declaredReturnType = functionExpression.returnType
		? functionExpression.returnType.name
		: (inferredReturn ?? "void");
	// An async function always returns the task handle, so the hover wraps the
	// payload in `AsyncTask<T>`; a declared `AsyncTask` annotation is reused.
	const returnType =
		functionExpression.async === true
			? createAsyncTaskType(declaredReturnType)
			: declaredReturnType;

	return `(${parameters}) => ${formatObjectShapeType(returnType)}`;
};
