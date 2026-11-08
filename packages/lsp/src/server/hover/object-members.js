import {
	AST_NODE,
	DATA_TYPE,
	decodeObjectShape,
	inferArrayElementType,
	isObjectShapeType,
	parseArrayType,
	resolveArrayMethod,
	resolveLiteralDataType,
	resolveStringMethod,
} from "embedito95-core";
import { formatMethodParameterList } from "./formatting.js";

const resolveArrayMemberSignature = (key, typeName) => {
	const arrayType = parseArrayType(typeName);

	if (!arrayType) {
		return null;
	}

	const method = resolveArrayMethod(key, arrayType.elementType);

	if (!method) {
		return null;
	}

	const parameters = formatMethodParameterList(method.params);
	return `${key}: (${parameters}) => ${method.returnType}`;
};

const resolveStringMemberSignature = (key) => {
	const method = resolveStringMethod(key);

	if (!method) {
		return null;
	}

	const parameters = formatMethodParameterList(method.params);
	return `${key}: (${parameters}) => ${method.returnType}`;
};

const pushEnclosingObjectType = (node, objectTypes, typeStack) => {
	if (node.type === AST_NODE.variableDeclaration) {
		const annotation = node.declarations?.[0]?.id?.typeAnnotation?.type;

		if (annotation && objectTypes?.[annotation]) {
			typeStack.push(annotation);
			return true;
		}
	}

	if (node.type === AST_NODE.functionExpression) {
		const returnType = node.returnType?.name;

		if (returnType && objectTypes?.[returnType]) {
			typeStack.push(returnType);
			return true;
		}
	}

	return false;
};

export const resolveObjectMemberFromType = (
	property,
	typeName,
	objectTypes,
) => {
	if (typeName === DATA_TYPE.string) {
		const stringMember = resolveStringMemberSignature(property.key);

		if (stringMember) {
			return stringMember;
		}
	}

	const arrayMember = resolveArrayMemberSignature(property.key, typeName);

	if (arrayMember) {
		return arrayMember;
	}

	const type = objectTypes?.[typeName];
	const shapeFields = isObjectShapeType(typeName)
		? decodeObjectShape(typeName)
		: null;
	const field = type?.fields?.[property.key] ?? shapeFields?.[property.key];

	if (field) {
		return `${property.key}: ${field.type ?? "unknown"}`;
	}

	const method = type?.methods?.[property.key];

	if (method) {
		const parameters = formatMethodParameterList(method.params);
		return `${property.key}: (${parameters}) => ${method.returnType ?? "void"}`;
	}

	return null;
};

const resolveObjectMemberFromValue = (
	key,
	value,
	resolveNameType,
	resolveCallType,
) => {
	if (!value) {
		return null;
	}

	if (value.type === AST_NODE.literal) {
		const type = resolveLiteralDataType(value);

		if (!type) {
			return null;
		}

		return `${key}: ${type}`;
	}

	if (value.type === AST_NODE.identifier) {
		const type = resolveNameType(value.name);

		if (type) {
			return `${key}: ${type}`;
		}
	}

	if (value.type === AST_NODE.arrayLiteral) {
		const elementType = inferArrayElementType(
			null,
			value.elements,
			resolveNameType,
			null,
			null,
			false,
		);

		if (elementType) {
			return `${key}: ${elementType}[]`;
		}
	}

	if (value.type === AST_NODE.callExpression) {
		const type = resolveCallType(value.callee?.name);

		if (type) {
			return `${key}: ${type}`;
		}
	}

	if (value.type === AST_NODE.functionExpression) {
		const parameters = value.params
			.map(
				(parameter) =>
					`${parameter.name}: ${parameter.typeAnnotation?.type ?? "unknown"}`,
			)
			.join(", ");
		const returnType = value.returnType?.name ?? "unknown";
		return `${key}: (${parameters}) => ${returnType}`;
	}

	return null;
};

const resolveObjectLiteralMemberHover = (
	node,
	targetProperty,
	typeStack,
	objectTypes,
	resolveNameType,
	resolveCallType,
) => {
	const hasTarget = node.properties?.some((property) => {
		return property === targetProperty;
	});

	if (!hasTarget) {
		return null;
	}

	const typeName = typeStack[typeStack.length - 1] ?? null;
	const memberFromType = typeName
		? resolveObjectMemberFromType(targetProperty, typeName, objectTypes)
		: null;

	return (
		memberFromType ??
		resolveObjectMemberFromValue(
			targetProperty.key,
			targetProperty.value,
			resolveNameType,
			resolveCallType,
		)
	);
};

const findObjectMemberHoverInChildren = (
	node,
	targetProperty,
	typeStack,
	objectTypes,
	resolveNameType,
	resolveCallType,
) => {
	for (const [propertyName, childValue] of Object.entries(node)) {
		if (propertyName === "loc") {
			continue;
		}

		const children = Array.isArray(childValue) ? childValue : [childValue];

		for (const child of children) {
			const result = resolveObjectMemberHover(
				child,
				targetProperty,
				typeStack,
				objectTypes,
				resolveNameType,
				resolveCallType,
			);

			if (result) {
				return result;
			}
		}
	}

	return null;
};

export const resolveObjectMemberHover = (
	node,
	targetProperty,
	typeStack,
	objectTypes,
	resolveNameType,
	resolveCallType,
) => {
	if (!node || typeof node !== "object") {
		return null;
	}

	const pushedType = pushEnclosingObjectType(node, objectTypes, typeStack);
	const member =
		node.type === AST_NODE.objectLiteral
			? resolveObjectLiteralMemberHover(
					node,
					targetProperty,
					typeStack,
					objectTypes,
					resolveNameType,
					resolveCallType,
				)
			: null;
	const result =
		member ??
		findObjectMemberHoverInChildren(
			node,
			targetProperty,
			typeStack,
			objectTypes,
			resolveNameType,
			resolveCallType,
		);

	if (pushedType) {
		typeStack.pop();
	}

	return result;
};
