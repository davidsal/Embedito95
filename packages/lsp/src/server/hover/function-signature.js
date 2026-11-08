import { formatExpression, inferFunctionReturnType } from "embedito95-core";
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
	const returnType = functionExpression.returnType
		? functionExpression.returnType.name
		: (inferredReturn ?? "void");

	return `(${parameters}) => ${formatObjectShapeType(returnType)}`;
};
