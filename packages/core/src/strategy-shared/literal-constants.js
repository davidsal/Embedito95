import {
	collectFunctionDeclarations,
	inferLiteralType,
	isNullableType,
	isObjectShapeType,
	parseArrayType,
	resolveConstIntegerType,
} from "../checker/index.js";
import { evaluateConstant } from "../const-eval.js";
import {
	AST_NODE,
	CONST_KIND,
	DATA_TYPE,
	DATA_TYPE_TO_C_TYPE,
} from "../constants.js";
import { optionalName, resolveLiteralCType } from "./c-types.js";
import { renderExpression } from "./expression.js";
import { formatFloat32Value, formatFloat64Literal } from "./float-format.js";
import { renderTypedObjectLiteral } from "./object-literal-render.js";
import {
	renderOptionalNull,
	renderOptionalWrap,
	resolveOptionalEntry,
} from "./optional-value.js";
import { decodeEscapes } from "./rendering.js";

const STRING_C_TYPE = DATA_TYPE_TO_C_TYPE[DATA_TYPE.string];
const NULL_LITERAL_RAW = "null";

export const findDeclarationByName = (ast, name) => {
	for (const { statement, declaration } of collectFunctionDeclarations(ast)) {
		if (statement.kind !== CONST_KIND) {
			continue;
		}
		if (declaration.id?.name !== name) {
			continue;
		}
		return declaration;
	}
	return null;
};

export const extractLiteralConstants = (ast, variableTypes, renderContext) => {
	const constants = [];

	for (const statement of ast.body) {
		if (statement.type !== AST_NODE.variableDeclaration) {
			continue;
		}
		if (statement.kind !== CONST_KIND && statement.kind !== "let") {
			continue;
		}
		const declaration = statement.declarations?.[0];
		if (!declaration?.id?.name) {
			continue;
		}
		const initializer = declaration.init;
		const resolvedType = variableTypes
			? variableTypes.get(declaration.id.name)
			: null;

		if (
			initializer?.type === AST_NODE.arrayLiteral ||
			parseArrayType(declaration?.id?.typeAnnotation?.type)
		) {
			continue;
		}

		let raw = null;
		let value = null;

		if (initializer?.type === AST_NODE.literal) {
			raw = initializer.raw;
			value = initializer.value;
		} else if (
			initializer &&
			initializer.type !== AST_NODE.functionExpression
		) {
			const floatContext =
				resolvedType === DATA_TYPE.f32 || resolvedType === DATA_TYPE.f64
					? resolvedType
					: null;
			const resolved = evaluateConstant(ast, initializer, floatContext);

			if (
				typeof resolved === "number" ||
				typeof resolved === "boolean" ||
				typeof resolved === "string"
			) {
				raw = String(resolved);
				value = resolved;
			} else if (renderContext) {
				const objectType = declaration.id?.typeAnnotation?.type ?? resolvedType;
				const hasObjectFields =
					objectType &&
					(Boolean(renderContext.objectTypes?.[objectType]?.fields) ||
						isObjectShapeType(objectType));
				const renderedObject =
					initializer?.type === AST_NODE.objectLiteral && hasObjectFields
						? renderTypedObjectLiteral(
								initializer,
								objectType,
								renderContext,
								[],
							)
						: renderExpression(initializer, renderContext, []);
				raw = renderedObject;
			} else {
				continue;
			}
		} else {
			continue;
		}

		constants.push({
			name: declaration.id.name,
			raw,
			value,
			kind: statement.kind,
			line: statement.loc?.start?.line,
			type:
				declaration.id?.typeAnnotation?.type ??
				resolvedType ??
				(initializer?.type === AST_NODE.literal
					? statement.kind === CONST_KIND &&
						typeof initializer.value === "number" &&
						Number.isInteger(initializer.value)
						? resolveConstIntegerType(initializer.value)
						: inferLiteralType(initializer.value)
					: null) ??
				null,
		});
	}

	return constants;
};

const resolveConstantRaw = (constant, constantCType, float64Software) => {
	if (constantCType === DATA_TYPE.f32) {
		return Number.isInteger(constant.value)
			? String(constant.value)
			: `${formatFloat32Value(constant.value)}f`;
	}

	if (constantCType === DATA_TYPE.f64) {
		return formatFloat64Literal(constant.value, Boolean(float64Software));
	}

	return constant.raw;
};

// A module-level `let` owns storage, so its C type is the resolved annotation
// (or the platform word type when unannotated). A nullable annotation
// (`T | null`) lowers to `nullable<T>` and wraps its init the same way a local
// declaration does: `{ true, zero }` for `null`, `{ false, value }` otherwise.
const renderLetConstant = (constant, wordCType, renderContext) => {
	const nullable = isNullableType(constant.type);
	const entry = nullable
		? resolveOptionalEntry(constant.type, renderContext)
		: null;
	const cType = nullable
		? optionalName(entry.ctype)
		: (DATA_TYPE_TO_C_TYPE[constant.type] ?? wordCType);
	const storedCType = nullable ? entry.ctype : cType;
	const rendered =
		storedCType === STRING_C_TYPE
			? `core_string::String(${JSON.stringify(decodeEscapes(constant.raw))})`
			: storedCType === DATA_TYPE.f64
				? resolveConstantRaw(
						constant,
						storedCType,
						renderContext?.float64Software,
					)
				: constant.raw;
	if (!nullable) {
		return `${cType} ${constant.name} = ${rendered};`;
	}
	const stored =
		constant.raw === NULL_LITERAL_RAW
			? renderOptionalNull(entry)
			: renderOptionalWrap(entry, rendered);
	return `${cType} ${constant.name} = ${stored};`;
};

export const renderLiteralConstant = (
	constant,
	wordCType,
	flashStrings,
	userTypeNames,
	importNamespaces = null,
	objectTypeNames = null,
	renderContext = null,
) => {
	if (constant.kind === "let") {
		return renderLetConstant(constant, wordCType, renderContext);
	}

	// A data-object constant of a handle type (numeric-only, so no flash-string
	// `F("...")` which is illegal at global scope on AVR) must be a shared handle
	// at file scope. A braced init (`{ 0, 0 }`) is the value struct and must be
	// wrapped into the handle; any other init is already a handle expression.
	const handleType = renderContext?.isObjectHandle?.(constant.type)
		? renderContext.toCType(constant.type)
		: null;
	if (handleType) {
		const rawIsBraced = constant.raw?.trimStart().startsWith("{") ?? false;
		const init = rawIsBraced
			? `${handleType}(${renderContext.objectStorageCType(constant.type)}${constant.raw})`
			: constant.raw;
		// Handles are mutable (methods may write internal state through the box),
		// so the binding must NOT be `const`; `const` in the source only prevents
		// reassigning the handle, which codegen never does.
		return `${handleType} ${constant.name} = ${init};`;
	}

	const constantCType =
		DATA_TYPE_TO_C_TYPE[constant.type] ??
		(userTypeNames?.has(constant.type)
			? constant.type
			: importNamespaces?.has(constant.type)
				? `${importNamespaces.get(constant.type)}::${constant.type}`
				: resolveLiteralCType(constant.value));

	if (constantCType === "char") {
		return `const char ${constant.name} = '${constant.raw}';`;
	}

	if (constantCType === "core_string::String") {
		const rendered = JSON.stringify(decodeEscapes(constant.raw));
		if (flashStrings) {
			return `_E95_FLASH_STRING(${constant.name}, ${rendered});`;
		}
		return `const core_string::String ${constant.name} = core_string::String(${rendered});`;
	}

	const raw = resolveConstantRaw(
		constant,
		constantCType,
		renderContext?.float64Software,
	);
	const isObject = objectTypeNames?.has(constant.type);
	const constPrefix = isObject ? "" : "const ";

	return `${constPrefix}${constantCType} ${constant.name} = ${raw};`;
};
