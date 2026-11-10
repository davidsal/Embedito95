import {
	createAsyncTaskType,
	formatExpression,
	inferFunctionReturnType,
} from "embedito95-core";
import { formatObjectShapeType } from "./formatting.js";

const formatFunctionExpressionParameters = (functionExpression) => {
	return functionExpression.params
		.map((parameter) => {
			const optional = parameter.defaultValue ? "?" : "";
			const type = parameter.typeAnnotation
				? `: ${parameter.typeAnnotation.type}`
				: "";
			const defaultValue = parameter.defaultValue
				? ` = ${formatExpression(parameter.defaultValue)}`
				: "";
			return `${parameter.name}${optional}${type}${defaultValue}`;
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
