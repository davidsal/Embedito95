import {
	decodeObjectShape,
	isNullLiteralNode,
	isObjectShapeType,
	parseArrayType,
} from "../checker/index.js";
import { AST_NODE } from "../constants.js";
import { optionalName } from "./c-types.js";
import { renderExpression } from "./expression.js";
import { hasDataFields } from "./object-info.js";
import { renderOptionalZero, resolveOptionalEntry } from "./optional-value.js";

// Returns the field definitions of a data-object type, whether it is a declared
// NAMED object (`context.objectTypes[name]`) or an ANONYMOUS shape (`object:{…}`).
const getObjectStorageFields = (context, type) => {
	return (
		context.objectTypes?.[type]?.fields ??
		(isObjectShapeType(type) ? decodeObjectShape(type) : null) ??
		null
	);
};

// Storage members in the order the struct declares them. A named non-handle
// object may also carry function-pointer members (declared with method syntax,
// emitted as `ret (*name)(...)`), so they take part in literal initialization
// too (e.g. `_AsyncHandlers`). A HANDLE type with data fields stores only its
// fields: its methods are free functions over `Object<T>` and never live in the
// struct. A CALLBACK RECORD handle (0 fields, >=1 method) is the exception: its
// methods ARE function-pointer members, so they are initialized from the literal.
const getObjectStorageMembers = (context, type) => {
	const info = context.objectTypes?.[type];
	if (info) {
		const fields = info.fields ?? {};
		if (context.isObjectHandle?.(type)) {
			return hasDataFields(info)
				? fields
				: { ...fields, ...(info.methods ?? {}) };
		}
		return { ...fields, ...(info.methods ?? {}) };
	}
	return isObjectShapeType(type) ? (decodeObjectShape(type) ?? {}) : {};
};

export const renderObjectLiteral = (node, context, lines) => {
	const values = node.properties
		.filter((property) => property.value?.type !== AST_NODE.functionExpression)
		.map((property) => renderExpression(property.value, context, lines));
	return `{ ${values.join(", ")} }`;
};

// Boxes an object literal as its own shared handle (`Object<Y>(Y{…})`) because
// the enclosing field is a `core_object::Object<Y>` member.
const renderTypedObjectValue = (node, typeName, context, lines) => {
	const typedLiteral = renderTypedObjectLiteral(node, typeName, context, lines);
	return `${context.toCType(typeName)}(${context.objectStorageCType(typeName)}${typedLiteral})`;
};

// Renders one element of an array literal when building an array that is stored
// as an object field. An element that is itself an object literal is boxed as
// its own shared handle (`Object<Point>(Point{…})`).
const renderArrayElementValue = (elementNode, elementType, context, lines) => {
	const nestedArrayType = parseArrayType(elementType);
	if (
		elementNode?.type === AST_NODE.objectLiteral &&
		!nestedArrayType &&
		context.isObjectHandle?.(elementType)
	) {
		return renderTypedObjectValue(elementNode, elementType, context, lines);
	}
	return renderExpression(elementNode, context, lines);
};

// Builds the expression for an array literal stored as an object field: the
// enclosing field is a `core_array::Array<E>` member, so it is constructed
// element-wise (`core_array::Array<E>(e1, e2, ...)`) via the variadic ctor; an
// empty array falls back to the default ctor.
const renderArrayFieldValue = (node, fieldType, context, lines) => {
	const arrayType = parseArrayType(fieldType);
	const elementType = arrayType?.elementType;
	const elements = (node.elements ?? []).map((element) =>
		renderArrayElementValue(element, elementType, context, lines),
	);
	const fullType = context.toCType(fieldType);
	if (elements.length === 0) {
		return `${fullType}()`;
	}
	return `${fullType}(${elements.join(", ")})`;
};

// Renders a single object-literal property value. When the declared field type
// is an ARRAY, an array literal is built element-wise; when it is a named
// object handle, a nested object literal is boxed as its own shared handle.
const renderFieldInit = (propertyNode, fieldType, context, lines) => {
	if (parseArrayType(fieldType)) {
		if (propertyNode?.type === AST_NODE.arrayLiteral) {
			return renderArrayFieldValue(propertyNode, fieldType, context, lines);
		}
		return renderExpression(propertyNode, context, lines);
	}
	const isNestedObjectLiteral =
		propertyNode?.type === AST_NODE.objectLiteral &&
		fieldType &&
		context.isObjectHandle?.(fieldType) &&
		getObjectStorageFields(context, fieldType);
	if (isNestedObjectLiteral) {
		return renderTypedObjectValue(propertyNode, fieldType, context, lines);
	}
	return renderExpression(propertyNode, context, lines);
};

export const renderTypedObjectLiteral = (node, typeName, context, lines) => {
	const fields = getObjectStorageMembers(context, typeName);
	const providedValues = {};
	for (const property of node.properties ?? []) {
		if (property.value?.type === AST_NODE.functionExpression) {
			// A callback-record method member: the inline arrow becomes a plain
			// function (captureless lambda) stored in the function-pointer slot.
			if (fields[property.key] && context.renderFunctionExpression) {
				providedValues[property.key] = context.renderFunctionExpression(
					property.value,
					context,
					fields[property.key],
				);
			}
			continue;
		}
		if (isNullLiteralNode(property.value)) {
			continue;
		}
		providedValues[property.key] = renderFieldInit(
			property.value,
			fields[property.key]?.type,
			context,
			lines,
		);
	}

	const values = [];
	for (const [fieldName, definition] of Object.entries(fields)) {
		if (definition?.optional) {
			const hasValue = providedValues[fieldName] !== undefined;
			const entry = resolveOptionalEntry(definition.type, context);
			const value = hasValue
				? providedValues[fieldName]
				: renderOptionalZero(entry);
			values.push(
				`${optionalName(entry.ctype)}{ ${hasValue ? "false" : "true"}, ${value} }`,
			);
		} else {
			values.push(providedValues[fieldName] ?? "0");
		}
	}

	return `{ ${values.join(", ")} }`;
};
