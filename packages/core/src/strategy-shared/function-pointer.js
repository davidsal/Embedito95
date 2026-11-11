const PARAMETER_SEPARATOR = ", ";

// A function-typed value lowers to a C function pointer with its real signature
// (e.g. `i16 (*callback)(i16)`). `toCType` resolves each signature type.
export const renderFunctionPointer = (name, functionType, toCType) => {
	const returnCType = toCType(functionType.returnType);
	const parameterTypes = (functionType.params ?? [])
		.map((param) => {
			return toCType(param.type);
		})
		.join(PARAMETER_SEPARATOR);
	return `${returnCType} (*${name})(${parameterTypes})`;
};

export const renderParameterDeclaration = (
	param,
	toCType,
	byReference = false,
) => {
	const functionType = param.typeAnnotation?.functionType;
	if (functionType) {
		return renderFunctionPointer(param.name, functionType, toCType);
	}
	const separator = byReference ? " &" : " ";
	return `${toCType(param.typeAnnotation?.type)}${separator}${param.name}`;
};
