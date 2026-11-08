import { AST_NODE, ERROR_CODE, SEVERITY } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { checkAllowedArgumentValue } from "./allowed-values.js";
import { parseArrayElementType, parseArrayType } from "./arrays.js";
import { identifierMatchesType, literalMatchesType } from "./narrowing.js";
import { inferLiteralType, resolveLiteralDataType } from "./type-resolution.js";
import {
	getNonNullableType,
	INTEGER_TYPES,
	isNullableType,
	splitUnionTypes,
	TYPE_RANGES,
} from "./types.js";

// Resolves the element type of an argument that is an array: a plain
// identifier (the variable's array type) or an index expression (the element
// type of the indexed array). Anything else falls back to the expression
// resolver, which may not know array shapes.
const resolveArrayArgumentType = (
	argument,
	resolveVariableTypeAt,
	resolveExpressionType,
) => {
	if (argument?.type === AST_NODE.identifier && resolveVariableTypeAt) {
		return resolveVariableTypeAt(argument.name, argument.loc);
	}
	if (argument?.type === AST_NODE.literal) {
		return resolveLiteralDataType(argument);
	}
	// An array literal bound for an array parameter is not validated here: its
	// element type widens to the target word size, so comparing it as-is against
	// the declared element type would reject valid call sites.
	if (argument?.type === AST_NODE.arrayLiteral) {
		return null;
	}
	if (argument?.type === AST_NODE.indexExpression) {
		const objectType = resolveArrayArgumentType(
			argument.object,
			resolveVariableTypeAt,
			resolveExpressionType,
		);
		return parseArrayElementType(objectType);
	}
	return resolveExpressionType?.(argument) ?? null;
};

// Array parameters are invariant: `Array<T>` and `Array<U>` are distinct C++
// types with no implicit conversion, so the element type must match exactly.
// Returns true when the parameter is an array (the caller should not fall
// through to the scalar checks).
export const checkArrayArgument = (
	argument,
	param,
	errors,
	resolveVariableTypeAt,
	resolveExpressionType,
) => {
	const paramArray = parseArrayType(param.type);

	if (!paramArray) {
		return false;
	}

	const argumentType = resolveArrayArgumentType(
		argument,
		resolveVariableTypeAt,
		resolveExpressionType,
	);

	if (argumentType) {
		const argumentArray = parseArrayType(argumentType);

		if (
			!argumentArray ||
			argumentArray.elementType !== paramArray.elementType
		) {
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.argumentTypeMismatch,
					params: {
						name: param.name,
						expected: param.type,
						actual: argumentType,
						value: describeExpression(argument),
					},
					location: argument.loc,
				}),
			);
		}
	}

	return true;
};

const describeArrayLiteralElements = (elements) => {
	const parts = [];
	for (const element of elements ?? []) {
		parts.push(describeExpression(element) ?? "");
	}
	return parts.join(", ");
};

export const describeExpression = (node) => {
	if (!node || typeof node !== "object") {
		return null;
	}
	if (node.type === AST_NODE.arrayLiteral) {
		return `[${describeArrayLiteralElements(node.elements)}]`;
	}
	if (node.type === AST_NODE.identifier) {
		return node.name;
	}
	if (node.type === AST_NODE.memberExpression) {
		return `${describeExpression(node.object)}.${describeExpression(node.property) ?? ""}`;
	}
	if (node.type === AST_NODE.indexExpression) {
		return `${describeExpression(node.object) ?? "array"}[${describeExpression(node.index) ?? ""}]`;
	}
	if (node.type === AST_NODE.literal) {
		return String(node.raw ?? node.value);
	}
	if (node.type === AST_NODE.templateLiteral) {
		return node.raw ?? "";
	}
	if (node.type === AST_NODE.parenthesizedExpression) {
		return describeExpression(node.expression);
	}
	if (node.type === AST_NODE.asExpression) {
		return describeExpression(node.expression);
	}
	if (node.type === AST_NODE.callExpression) {
		return `${describeExpression(node.callee) ?? "call"}(...)`;
	}
	return null;
};

const pushNullableArgumentMismatch = (
	errors,
	argument,
	param,
	argumentType,
) => {
	errors.push(
		makeDiagnostic({
			code: ERROR_CODE.argumentTypeMismatch,
			params: {
				name: param.name,
				expected: param.type,
				actual: argumentType,
				value: describeExpression(argument),
			},
			location: argument.loc,
		}),
	);
};

// A literal never stands for an enum value: an enum-typed parameter only accepts
// one of its own members (e.g. `SpiBitOrder.MSB_FIRST`), mirroring the function
// argument path. Numeric literals are checked against the type's range instead.
const literalMatchesMethodParam = (argument, type, libEnumTypeNames) => {
	if (libEnumTypeNames.has(type)) {
		return false;
	}
	return literalMatchesType(argument, type);
};

const isOutsideParameterRange = (value, param) => {
	if (param.minimum === undefined || param.maximum === undefined) {
		return false;
	}
	return value < param.minimum || value > param.maximum;
};

const checkLiteralParameterRange = (argument, param, errors) => {
	if (!isOutsideParameterRange(argument.value, param)) {
		return;
	}
	errors.push(
		makeDiagnostic({
			code: ERROR_CODE.valueOutOfRange,
			params: {
				name: param.name,
				value: argument.value,
				type: param.type,
				min: param.minimum,
				max: param.maximum,
			},
			location: argument.loc,
		}),
	);
};

export const checkMethodArgument = (
	argument,
	param,
	errors,
	resolveVariableTypeAt,
	libEnumMembersByType,
	libEnumTypeNames,
	resolveExpressionType = null,
) => {
	checkAllowedArgumentValue(errors, argument, param);
	if (!param?.type) {
		return;
	}

	if (
		checkArrayArgument(
			argument,
			param,
			errors,
			resolveVariableTypeAt,
			resolveExpressionType,
		)
	) {
		return;
	}

	const memberTypes = splitUnionTypes(param.type);
	const hasNumericMember = memberTypes.some((type) => TYPE_RANGES[type]);

	if (argument.type === AST_NODE.literal) {
		const accepted = memberTypes.some((type) =>
			literalMatchesMethodParam(argument, type, libEnumTypeNames),
		);

		if (!accepted) {
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.argumentTypeMismatch,
					params: {
						name: param.name,
						expected: param.type,
						actual:
							typeof argument.value === "string"
								? resolveLiteralDataType(argument)
								: typeof argument.value === "number"
									? inferLiteralType(argument.value)
									: typeof argument.value,
						value: argument.value,
					},
					location: argument.loc,
				}),
			);
			return;
		}
		checkLiteralParameterRange(argument, param, errors);
		return;
	}

	if (argument.type === AST_NODE.identifier) {
		const argumentType = resolveVariableTypeAt(argument.name, argument.loc);

		if (!argumentType) {
			return;
		}

		if (isNullableType(argumentType) && !isNullableType(param.type)) {
			pushNullableArgumentMismatch(errors, argument, param, argumentType);
			return;
		}

		const accepted = memberTypes.some((type) =>
			identifierMatchesType(argumentType, type),
		);

		if (!accepted) {
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.argumentTypeMismatch,
					params: {
						name: param.name,
						expected: param.type,
						actual: argumentType,
						value: argument.name,
					},
					location: argument.loc,
					severity:
						hasNumericMember && INTEGER_TYPES.has(argumentType)
							? SEVERITY.warning
							: SEVERITY.error,
				}),
			);
		}
		return;
	}

	if (argument.type === AST_NODE.memberExpression) {
		const objectName = argument.object?.name;
		const propertyName = argument.property?.name;

		if (
			objectName &&
			propertyName &&
			libEnumTypeNames.has(param.type) &&
			!libEnumMembersByType[param.type]?.has(propertyName)
		) {
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.argumentTypeMismatch,
					params: {
						name: param.name,
						expected: param.type,
						actual: `${objectName}.${propertyName}`,
						value: `${objectName}.${propertyName}`,
					},
					location: argument.loc,
				}),
			);
		}
		return;
	}

	if (
		argument.type === AST_NODE.callExpression ||
		argument.type === AST_NODE.templateLiteral ||
		argument.type === AST_NODE.asExpression ||
		argument.type === AST_NODE.arrayLiteral
	) {
		const argumentType = resolveExpressionType?.(argument) ?? null;

		if (!argumentType) {
			return;
		}

		if (isNullableType(argumentType) && !isNullableType(param.type)) {
			pushNullableArgumentMismatch(errors, argument, param, argumentType);
			return;
		}

		const accepted = memberTypes.some((type) =>
			identifierMatchesType(argumentType, type),
		);

		if (!accepted) {
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.argumentTypeMismatch,
					params: {
						name: param.name,
						expected: param.type,
						actual: argumentType,
						value: describeExpression(argument),
					},
					location: argument.loc,
					severity:
						hasNumericMember &&
						INTEGER_TYPES.has(getNonNullableType(argumentType))
							? SEVERITY.warning
							: SEVERITY.error,
				}),
			);
		}
	}
};
