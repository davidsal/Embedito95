import { decodeObjectShape } from "../checker/index.js";
import { isFloatType, optionalName } from "./c-types.js";
import { renderExpression } from "./expression.js";
import { renderFunctionPointer } from "./function-pointer.js";
import { hasDataFields } from "./object-info.js";
import { renderMethod } from "./object-methods.js";

// A declared callback-record slot with no implementation in the factory: a null
// function pointer (C++17 `nullptr`, which converts to any function-pointer type).
const NULL_FUNCTION_POINTER = "nullptr";

const renderFunctionPointerField = (member, context) => {
	return `\t${renderFunctionPointer(
		member.name,
		{ params: member.params ?? [], returnType: member.returnType },
		context.toCType,
	)};`;
};

export const renderTypeDeclaration = (node, context) => {
	// A named type that survives as a shared handle (see `isObjectFieldCandidate`):
	// its methods are free functions (or function-pointer members for a callback
	// record), so the struct declares only the data fields.
	if (context.isObjectHandle?.(node.name)) {
		return renderSharedObjectStruct(node.name, context.objectTypes, context);
	}
	const lines = [`struct ${node.name} {`];
	for (const member of node.members ?? []) {
		if (member.kind === "method") {
			lines.push(renderFunctionPointerField(member, context));
			continue;
		}
		if (member.kind !== "field") {
			continue;
		}
		const cType = context.toCType(member.returnType);
		if (member.optional) {
			lines.push(`\t${optionalName(cType)} ${member.name};`);
		} else {
			lines.push(`\t${cType} ${member.name};`);
		}
	}
	lines.push(`};`);
	return lines.join("\n");
};

// A SHARED closure keeps no private `Ref<Body>` box: its captured state becomes
// the fields of the public struct, and the value is held in a
// `core_object::Object<T>` handle exactly like a data object. A plain named
// handle type with methods uses the same struct shape (fields only). A CALLBACK
// RECORD (0 data fields, >=1 method) has no state to back free functions, so its
// methods are declared as function-pointer members instead. A closure carries
// `fieldsInOrder` (captured fields, possibly none); a plain type falls back to
// its declared `fields` in declaration order.
export const resolveSharedObjectFields = (typeName, objectTypes, context) => {
	const info = objectTypes?.[typeName];
	if (!info) {
		return [];
	}
	const fields =
		info.fieldsInOrder ??
		Object.entries(info.fields ?? {}).map(([name, definition]) => ({
			name,
			type: definition?.type,
			optional: Boolean(definition?.optional),
		}));
	return fields.map((field) => {
		return {
			name: field.name,
			optional: Boolean(field.optional),
			cType: context.toCType(field.type),
		};
	});
};

const renderSharedObjectStruct = (typeName, objectTypes, context) => {
	const info = objectTypes[typeName];
	const fields = resolveSharedObjectFields(typeName, objectTypes, context);
	const lines = [`struct ${typeName} {`];
	for (const field of fields) {
		lines.push(
			`\t${field.optional ? optionalName(field.cType) : field.cType} ${field.name};`,
		);
	}
	if (!hasDataFields(info)) {
		for (const [methodName, method] of Object.entries(info.methods ?? {})) {
			lines.push(
				renderFunctionPointerField({ name: methodName, ...method }, context),
			);
		}
	}
	lines.push(`};`);
	return lines.join("\n");
};

// Renders one initializer expression for a shared object's fields value: a
// captured factory param forwards its name; a captured local renders its init
// expression (or `0`) under the field's float context so numeric literals get
// the right suffix.
const renderSharedObjectFieldInit = (field, context) => {
	if (field.isParam) {
		return field.name;
	}
	const savedFloatContext = context.floatContext;
	context.floatContext = isFloatType(field.type) ? field.type : null;
	const renderedInit = field.init
		? renderExpression(field.init, context, [])
		: "0";
	context.floatContext = savedFloatContext;
	return renderedInit;
};

export const renderSharedObjectFactory = (typeName, info, context) => {
	const params = (info.ctorParams ?? [])
		.map((param) => `${context.toCType(param.type)} ${param.name}`)
		.join(", ");
	const fields = (info.fieldsInOrder ?? [])
		.map((field) => renderSharedObjectFieldInit(field, context))
		.join(", ");
	return `${context.toCType(typeName)} ${info.factoryName}(${params}) {\n\treturn ${context.toCType(
		typeName,
	)}(${typeName}{ ${fields} });\n}`;
};

export const renderSharedObjectMethod = (
	typeName,
	methodName,
	functionExpression,
	objectTypes,
	context,
) => {
	return renderMethod(
		context,
		typeName,
		methodName,
		functionExpression,
		objectTypes,
		true,
	);
};

// A callback record's methods are plain free functions (no `self`: the record
// has no state to read), and the factory stores their addresses in the struct's
// function-pointer slots. This is what lets a stateless closure (0 captured
// fields) lower to the same `Object<T>` handle as a stateful one.
export const renderCallbackRecordMethod = (
	typeName,
	methodName,
	functionExpression,
	objectTypes,
	context,
) => {
	return renderMethod(
		context,
		typeName,
		methodName,
		functionExpression,
		objectTypes,
		false,
		true,
	);
};

export const renderCallbackRecordFactory = (typeName, info, context) => {
	const params = (info.ctorParams ?? [])
		.map((param) => `${context.toCType(param.type)} ${param.name}`)
		.join(", ");
	const implemented = new Set(
		(info.publicMethods ?? []).map((method) => method.name),
	);
	const slots = Object.keys(info.methods ?? {})
		.map((methodName) =>
			implemented.has(methodName) ? methodName : NULL_FUNCTION_POINTER,
		)
		.join(", ");
	return `${context.toCType(typeName)} ${info.factoryName}(${params}) {\n\treturn ${context.toCType(
		typeName,
	)}(${typeName}{ ${slots} });\n}`;
};

export const renderAnonymousObjectType = (
	shapeType,
	anonymousObjectTypes,
	context,
) => {
	const fields = decodeObjectShape(shapeType) ?? {};
	const name = anonymousObjectTypes[shapeType]?.name ?? "_e95_Object";
	const lines = [`struct ${name} {`];
	for (const [fieldName, definition] of Object.entries(fields)) {
		const cType = context.toCType(definition?.type);
		if (definition?.optional) {
			lines.push(`\t${optionalName(cType)} ${fieldName};`);
		} else {
			lines.push(`\t${cType} ${fieldName};`);
		}
	}
	lines.push(`};`);
	return lines.join("\n");
};
