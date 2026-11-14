import { decodeObjectShape } from "../checker/index.js";
import { ANONYMOUS_OBJECT_FALLBACK_NAME, AST_NODE } from "../constants.js";
import { resolveSharedObjectFields } from "./classes.js";

// C++ types that own a refcounted box and can take part in a reference cycle.
// Scalars, enums, POD value structs and `core_string::String` are leaves: an
// object that only holds them cannot close a cycle, so it needs no trace.
const CYCLE_HANDLE_CTYPE_PREFIXES = [
	"core_object::Object<",
	"core_mem::AnyObject",
	"core_array::Array<",
];

const NULLABLE_CTYPE_PATTERN = /^nullable<(.*)>$/;
const TRACE_FUNCTION_PREFIX = "_e95Trace_";

const stripNullable = (cType) => {
	const match = NULLABLE_CTYPE_PATTERN.exec(cType);
	return match ? match[1] : null;
};

const isCycleHandleCType = (cType) => {
	const innerCType = stripNullable(cType) ?? cType;
	return CYCLE_HANDLE_CTYPE_PREFIXES.some((prefix) => {
		return innerCType.startsWith(prefix);
	});
};

const renderTraceField = (field) => {
	const isNullable = field.optional || stripNullable(field.cType) !== null;
	if (!isNullable) {
		return `\tvalue->${field.name}.traceChild(visit);`;
	}
	return [
		`\tif (!value->${field.name}.isNull) {`,
		`\t\tvalue->${field.name}.value.traceChild(visit);`,
		`\t}`,
	].join("\n");
};

const renderTraceBody = (qualifiedName, handleFields) => {
	const fieldLines = handleFields
		.map((field) => {
			return renderTraceField(field);
		})
		.join("\n");
	return [
		`\tcore_mem::RefBox<${qualifiedName}> *typed = (core_mem::RefBox<${qualifiedName}> *)box;`,
		`\t${qualifiedName} *value = &typed->value;`,
		fieldLines,
	].join("\n");
};

const sanitizeIdentifier = (name) => {
	return name.replace(/::/g, "_").replace(/[^A-Za-z0-9_]/g, "_");
};

// Emits, for one object struct that owns at least one handle field, a `trace`
// function that visits its handle children in declaration order and an explicit
// `core_mem::TypeInfoOf<Struct>` specialization that wires it into the collector.
// A struct with no handle fields returns "" and keeps the default leaf TypeInfo.
export const renderTypeInfoDeclaration = ({
	structName,
	fields,
	namespaceName,
}) => {
	const handleFields = fields.filter((field) => {
		return isCycleHandleCType(field.cType);
	});
	if (handleFields.length === 0) {
		return "";
	}
	const qualifiedName = namespaceName
		? `${namespaceName}::${structName}`
		: structName;
	const traceFunctionName = `${TRACE_FUNCTION_PREFIX}${sanitizeIdentifier(
		namespaceName ? `${namespaceName}_${structName}` : structName,
	)}`;
	return [
		`inline void ${traceFunctionName}(void *box, core_mem::TraceVisitor visit) {`,
		renderTraceBody(qualifiedName, handleFields),
		`}`,
		``,
		`namespace core_mem {`,
		`template <>`,
		`struct TypeInfoOf<${qualifiedName}> {`,
		`\tstatic const TypeInfo *get() noexcept {`,
		`\t\tstatic const TypeInfo typeInfo = {`,
		`\t\t\t&destroyRefBox<${qualifiedName}>,`,
		`\t\t\t&${traceFunctionName},`,
		`\t\t};`,
		`\t\treturn &typeInfo;`,
		`\t}`,
		`};`,
		`} // namespace core_mem`,
	].join("\n");
};

const renderNamedTypeInfoDeclarations = (ast, renderContext, namespaceName) => {
	const declarations = [];
	for (const statement of ast.body ?? []) {
		if (statement.type !== AST_NODE.typeDeclaration) {
			continue;
		}
		if (!renderContext.isObjectHandle?.(statement.name)) {
			continue;
		}
		const declaration = renderTypeInfoDeclaration({
			structName: statement.name,
			fields: resolveSharedObjectFields(
				statement.name,
				renderContext.objectTypes,
				renderContext,
			),
			namespaceName,
		});
		if (declaration) {
			declarations.push(declaration);
		}
	}
	return declarations;
};

const renderAnonymousTypeInfoDeclarations = (
	orderedAnonymousKeys,
	anonymousObjectTypes,
	renderContext,
	namespaceName,
) => {
	const declarations = [];
	for (const shapeType of orderedAnonymousKeys) {
		if (!renderContext.isObjectHandle?.(shapeType)) {
			continue;
		}
		const structName =
			anonymousObjectTypes[shapeType]?.name ?? ANONYMOUS_OBJECT_FALLBACK_NAME;
		const decodedFields = decodeObjectShape(shapeType) ?? {};
		const fields = Object.entries(decodedFields).map(([name, definition]) => {
			return {
				name,
				optional: Boolean(definition?.optional),
				cType: renderContext.toCType(definition?.type),
			};
		});
		const declaration = renderTypeInfoDeclaration({
			structName,
			fields,
			namespaceName,
		});
		if (declaration) {
			declarations.push(declaration);
		}
	}
	return declarations;
};

// All TypeInfo specializations for the object structs this unit declares (named
// and anonymous). They must appear after the struct definitions and before the
// first `Object<Struct>` instantiation. `orderedAnonymousKeys` is already in
// declaration order (`orderAnonymousObjectTypeKeys`), so the output follows the
// emitted struct order. With `enableCycleCollector: false` nothing is emitted:
// the collector is compiled out, so every struct keeps the default leaf
// TypeInfo.
export const renderTypeInfoDeclarations = ({
	ast,
	orderedAnonymousKeys,
	anonymousObjectTypes,
	renderContext,
	namespaceName = null,
	cycles = true,
}) => {
	if (!cycles) {
		return "";
	}
	return [
		...renderNamedTypeInfoDeclarations(ast, renderContext, namespaceName),
		...renderAnonymousTypeInfoDeclarations(
			orderedAnonymousKeys,
			anonymousObjectTypes,
			renderContext,
			namespaceName,
		),
	]
		.filter(Boolean)
		.join("\n\n");
};
