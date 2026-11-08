import { AST_NODE, ERROR_CODE, OBJECT_TYPE } from "../constants.js";
import { makeDiagnostic } from "../errors.js";
import { parseArrayType } from "./arrays.js";
import { resolveExpressionType } from "./expressions.js";
import { checkMethodOnlyObjectLiteral } from "./object-method-validation.js";
import { isAssignableTo, isValueAssignable } from "./operators.js";
import { isNullableType, isNullLiteralNode, TYPE_RANGES } from "./types.js";

const isEnumMemberOf = (node, expectedType) => {
	return (
		Boolean(expectedType) &&
		node?.type === AST_NODE.memberExpression &&
		node.object?.type === AST_NODE.identifier &&
		node.object.name === expectedType
	);
};

const isEnumMemberValue = (node, expectedType) => {
	if (isEnumMemberOf(node, expectedType)) {
		return true;
	}
	return (
		node?.type === AST_NODE.conditionalExpression &&
		isEnumMemberOf(node.consequent, expectedType) &&
		isEnumMemberOf(node.alternate, expectedType)
	);
};

// Constant value of an array element that is a plain literal or a negated
// literal (`-1` parses as a unary expression, not a literal).
const elementLiteralValue = (element) => {
	if (element?.type === AST_NODE.literal) {
		return element.value;
	}
	if (
		element?.type === AST_NODE.unaryExpression &&
		element.operator === "-" &&
		element.argument?.type === AST_NODE.literal &&
		typeof element.argument.value === "number"
	) {
		return -element.argument.value;
	}
	return null;
};

// An array literal is contextually typed by the target element type, so each
// literal element must fit it (e.g. `-1` cannot go into a `u8[]`). Nested
// literals recurse into the nested element type; object elements are validated
// against the declared object type.
const validateArrayLiteralElements = (
	arrayNode,
	elementType,
	objectTypes,
	resolveNameType,
	wordSize,
	localNames,
	errors,
	name,
) => {
	const nestedArray = parseArrayType(elementType);
	const elementRange = TYPE_RANGES[elementType];

	for (const element of arrayNode.elements ?? []) {
		if (nestedArray) {
			if (element?.type === AST_NODE.arrayLiteral) {
				validateArrayLiteralElements(
					element,
					nestedArray.elementType,
					objectTypes,
					resolveNameType,
					wordSize,
					localNames,
					errors,
					name,
				);
			}
			continue;
		}

		if (
			element?.type === AST_NODE.objectLiteral &&
			objectTypes?.[elementType]
		) {
			errors.push(
				...validateObjectAssignment(
					element,
					elementType,
					objectTypes,
					resolveNameType,
					wordSize,
					localNames,
				),
			);
			continue;
		}

		const literalValue = elementLiteralValue(element);

		if (
			literalValue !== null &&
			elementRange &&
			!isValueAssignable(literalValue, elementType)
		) {
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.valueOutOfRange,
					params: {
						name: name ?? elementType,
						value: literalValue,
						type: elementType,
						min: elementRange.min,
						max: elementRange.max,
					},
					location: element.loc,
				}),
			);
		}
	}
};

export const validateObjectAssignment = (
	objectNode,
	targetType,
	objectTypes,
	resolveNameType,
	wordSize,
	localNames = null,
) => {
	const declaredFields = objectTypes?.[targetType]?.fields ?? {};
	const declaredMethods = objectTypes?.[targetType]?.methods ?? {};

	const providedKeys = new Set(
		(objectNode.properties ?? []).map((property) => property.key),
	);
	const errors = [];

	const requiredMembers = [
		...Object.entries(declaredFields).map(([memberName, definition]) => ({
			memberName,
			definition,
		})),
		...Object.entries(declaredMethods).map(([memberName, definition]) => ({
			memberName,
			definition,
		})),
	];

	for (const { memberName, definition } of requiredMembers) {
		if (definition?.optional) {
			continue;
		}
		if (!providedKeys.has(memberName)) {
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.missingObjectField,
					params: { type: targetType, field: memberName },
					location: objectNode.loc,
				}),
			);
		}
	}

	for (const property of objectNode.properties ?? []) {
		const declaredField = declaredFields[property.key];

		if (!declaredField) {
			if (declaredMethods[property.key]) {
				continue;
			}
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.unknownObjectField,
					params: { type: targetType, field: property.key },
					location: property.loc,
				}),
			);
			continue;
		}

		const expectedType = declaredField.type;

		if (
			isNullLiteralNode(property.value) &&
			(declaredField.optional || isNullableType(expectedType))
		) {
			continue;
		}

		const isEnumMemberAssignment = isEnumMemberValue(
			property.value,
			expectedType,
		);

		if (isEnumMemberAssignment) {
			continue;
		}

		// An array literal is contextually typed by the field: its elements are
		// built into the declared element type, so the literal's own inferred
		// element type (e.g. i8 from small integer literals) must not be compared
		// against it. Each element is instead validated against the declared
		// element type.
		const expectedArray = parseArrayType(expectedType);

		if (expectedArray && property.value?.type === AST_NODE.arrayLiteral) {
			validateArrayLiteralElements(
				property.value,
				expectedArray.elementType,
				objectTypes,
				resolveNameType,
				wordSize,
				localNames,
				errors,
				property.key,
			);
			continue;
		}

		if (
			property.value?.type === AST_NODE.objectLiteral &&
			objectTypes?.[expectedType]
		) {
			errors.push(
				...validateObjectAssignment(
					property.value,
					expectedType,
					objectTypes,
					resolveNameType,
					wordSize,
					localNames,
				),
				...checkMethodOnlyObjectLiteral(
					property.value,
					expectedType,
					objectTypes,
					localNames,
				),
			);
			continue;
		}

		const actualType = resolveExpressionType(
			resolveNameType,
			property.value,
			null,
			undefined,
			wordSize,
			undefined,
			null,
			null,
			null,
			false,
		);

		if (
			expectedType === OBJECT_TYPE &&
			(actualType === OBJECT_TYPE || objectTypes?.[actualType])
		) {
			continue;
		}

		const literalValue =
			property.value?.type === AST_NODE.literal ? property.value.value : null;
		const valueAssignable =
			(typeof literalValue === "number" || typeof literalValue === "boolean") &&
			isValueAssignable(literalValue, expectedType);

		if (
			actualType &&
			expectedType &&
			actualType !== expectedType &&
			!valueAssignable &&
			!isAssignableTo(expectedType, actualType)
		) {
			errors.push(
				makeDiagnostic({
					code: ERROR_CODE.objectFieldTypeMismatch,
					params: {
						actual: actualType,
						field: property.key,
						expected: expectedType,
					},
					location: property.loc,
				}),
			);
		}
	}

	return errors;
};
