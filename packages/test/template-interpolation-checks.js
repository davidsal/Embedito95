// Interpolating a value that is not convertible to `string` must be reported by
// the checker. The codegen emits `core_string::String(<expr>)`, which only has
// overloads for primitives, so objects, shapes, arrays and functions would fail
// in C++ instead of producing an e95 diagnostic.
import {
	AST_NODE,
	ERROR_CODE,
	format,
	parse,
	tokenize,
	walk,
} from "embedito95-core";
import { renderTemplateLiteral } from "../core/src/strategy-shared/render-delegates.js";
import { expectEqual } from "./reporting.js";
import {
	checkSource,
	createLibraries,
	hasErrorCode,
	PLATFORM_TYPES,
} from "./src/language/language-snapshot-harness.mjs";

// `char` is a real primitive with a `String(...)` overload, but it is not part
// of the default platform types. Registering it here keeps the `char` case from
// failing with `unsupportedType` and actually exercises convertibility.
const LIBRARIES = createLibraries({
	platformTypes: new Set([...PLATFORM_TYPES, "char"]),
});

const PERSONA_SOURCE = [
	"type Persona = { name: string, age: i32 }",
	'const getPersona = (): Persona => { return { name: "ana", age: 30 } }',
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = getPersona()",
	"    const valor = `${persona}`",
	"}",
].join("\n");

const ANONYMOUS_PERSONA_SOURCE = [
	'const getAnonymousPersona = () => { return { name: "ana", age: 30 } }',
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = getAnonymousPersona()",
	"    const valor = `${persona}`",
	"}",
].join("\n");

const NESTED_PERSONA_SOURCE = [
	"type Direccion = { city: string }",
	"type Persona = { name: string, direccion: Direccion }",
	'const getPersona = (): Persona => { return { name: "ana", direccion: { city: "Madrid" } } }',
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = getPersona()",
	"    const valor = `${persona.direccion}`",
	"}",
].join("\n");

const ARRAY_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const lista = [1, 2]",
	"    const valor = `${lista}`",
	"}",
].join("\n");

const FUNCTION_SOURCE = [
	"const peekBufferedByte = () => { return 1 }",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const valor = `${peekBufferedByte}`",
	"}",
].join("\n");

const VOID_CALL_SOURCE = [
	"const imprime = () => {}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const valor = `${imprime()}`",
	"}",
].join("\n");

const SELF_MEMBER_SOURCE = [
	"type Labeled = { value: i32, text: string, describe: () => string }",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	'    const item: Labeled = { value: 1, text: "x",',
	"        describe: () => { return `${this.text}-${this.value}-${this.describe()}` } }",
	"}",
].join("\n");

const SELF_ONLY_SOURCE = [
	"type Labeled = { text: string, show: () => string }",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	'    const item: Labeled = { text: "x",',
	"        show: () => { return `${this}` } }",
	"}",
].join("\n");

const SELF_NESTED_SOURCE = [
	"type Inner = { city: string, sub: () => string }",
	"type Outer = { inner: Inner, show: () => string }",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	'    const outer: Outer = { inner: { city: "Madrid", sub: () => { return "x" } },',
	"        show: () => { return `${this.inner.city}-${this.inner.sub()}` } }",
	"}",
].join("\n");

const SELF_NESTED_OBJECT_SOURCE = [
	"type Inner = { city: string }",
	"type Outer = { inner: Inner, show: () => string }",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	'    const outer: Outer = { inner: { city: "Madrid" },',
	"        show: () => { return `${this.inner}` } }",
	"}",
].join("\n");

const SELF_FACTORY_SOURCE = [
	"type Config = { label: string }",
	"type Widget = { cfg: Config, render: () => string }",
	'const createWidget = (): Widget => { return { cfg: { label: "ok" },',
	"    render: () => { return `${this.cfg.label}` } } }",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const widget = createWidget()",
	"}",
].join("\n");

const SHADOWED_FUNCTION_SOURCE = [
	"const peek = () => { return 1 }",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const probando = (peek: i32) => { const valor = `${peek}` }",
	"}",
].join("\n");

const PRIMITIVE_NEGATIVE_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	'    const nombre = "ana"',
	"    const contador: i32 = 1",
	"    const ratio: f32 = 1.5",
	"    const doble: f64 = 1.5",
	"    const flag: boolean = true",
	"    const letra: char = 'a'",
	"    const quizas: i32 | null = 1",
	"    const primero = `${nombre}`",
	"    const segundo = `${contador}`",
	"    const tercero = `${ratio}`",
	"    const cuarto = `${doble}`",
	"    const quinto = `${flag}`",
	"    const sexto = `${letra}`",
	"    const septimo = `${quizas}`",
	"}",
].join("\n");

const LITERAL_NEGATIVE_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const primero = `${1}`",
	"    const segundo = `${1.5}`",
	"    const tercero = `${`x`}`",
	"}",
].join("\n");

const COMPOUND_LITERAL_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const primero = `${[]}`",
	"    const segundo = `${[1, 2]}`",
	"    const tercero = `${ {a: 1} }`",
	"    const cuarto = `${[{a: 1}]}`",
	"}",
].join("\n");

const ENUM_NEGATIVE_SOURCE = [
	"enum Color { RED, GREEN }",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const color = Color.RED",
	"    const valor = `${color}`",
	"    const directo = `${Color.GREEN}`",
	"}",
].join("\n");

const FORMATTER_SOURCE = "const a = `${nombre}`";

const findUnconvertible = (errors) => {
	return errors.find((error) => {
		return error.code === ERROR_CODE.unconvertibleTemplateExpression;
	});
};

const collectUnconvertibles = (errors) => {
	return errors.filter((error) => {
		return error.code === ERROR_CODE.unconvertibleTemplateExpression;
	});
};

const checkSourceBody = (source) => {
	return checkSource(source, LIBRARIES).errors;
};

const checkObjectInterpolation = () => {
	const errors = checkSourceBody(PERSONA_SOURCE);
	const diagnostic = findUnconvertible(errors);
	return [
		expectEqual(
			"interpolating a nominal object reports unconvertibleTemplateExpression",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			true,
		),
		expectEqual(
			"the object interpolation keeps the effective type",
			diagnostic?.params?.type,
			"Persona",
		),
		expectEqual(
			"the object interpolation points at the interpolated expression",
			`${diagnostic?.location?.start?.line}:${diagnostic?.location?.start?.column}`,
			"7:22",
		),
	];
};

const checkAnonymousShapeInterpolation = () => {
	const errors = checkSourceBody(ANONYMOUS_PERSONA_SOURCE);
	const diagnostic = findUnconvertible(errors);
	return [
		expectEqual(
			"interpolating an anonymous shape reports unconvertibleTemplateExpression",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			true,
		),
		expectEqual(
			"the anonymous shape interpolation keeps the inferred shape type",
			typeof diagnostic?.params?.type === "string" &&
				diagnostic.params.type.startsWith("object:"),
			true,
		),
	];
};

const checkNestedObjectInterpolation = () => {
	const errors = checkSourceBody(NESTED_PERSONA_SOURCE);
	const diagnostic = findUnconvertible(errors);
	return [
		expectEqual(
			"interpolating a nested object field reports unconvertibleTemplateExpression",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			true,
		),
		expectEqual(
			"the nested object interpolation keeps the field type",
			diagnostic?.params?.type,
			"Direccion",
		),
	];
};

const checkArrayInterpolation = () => {
	const errors = checkSourceBody(ARRAY_SOURCE);
	const diagnostic = findUnconvertible(errors);
	return [
		expectEqual(
			"interpolating an array reports unconvertibleTemplateExpression",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			true,
		),
		expectEqual(
			"the array interpolation reports the array type",
			typeof diagnostic?.params?.type === "string" &&
				diagnostic.params.type.endsWith("[]"),
			true,
		),
	];
};

const checkFunctionInterpolation = () => {
	const errors = checkSourceBody(FUNCTION_SOURCE);
	const diagnostic = findUnconvertible(errors);
	return [
		expectEqual(
			"interpolating a function reference reports unconvertibleTemplateExpression",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			true,
		),
		expectEqual(
			"the function interpolation is reported as a function",
			diagnostic?.params?.type,
			"function",
		),
	];
};

const checkVoidCallInterpolation = () => {
	const errors = checkSourceBody(VOID_CALL_SOURCE);
	const diagnostic = findUnconvertible(errors);
	return [
		expectEqual(
			"interpolating a void call reports unconvertibleTemplateExpression",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			true,
		),
		expectEqual(
			"the void call interpolation reports the void type",
			diagnostic?.params?.type,
			"void",
		),
	];
};

const checkSelfMemberInterpolation = () => {
	const errors = checkSourceBody(SELF_MEMBER_SOURCE);
	return [
		expectEqual(
			"this.<field> and this.<method>() interpolations inside a typed object literal are convertible",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			false,
		),
	];
};

const checkSelfOnlyInterpolation = () => {
	const errors = checkSourceBody(SELF_ONLY_SOURCE);
	const diagnostic = findUnconvertible(errors);
	return [
		expectEqual(
			"interpolating bare this (an object) still reports unconvertibleTemplateExpression",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			true,
		),
		expectEqual(
			"the bare this interpolation stays unresolved",
			diagnostic?.params?.type,
			"unknown",
		),
	];
};

const checkSelfNestedInterpolation = () => {
	const errors = checkSourceBody(SELF_NESTED_SOURCE);
	return [
		expectEqual(
			"nested this.<field>.<field> and this.<field>.<method>() interpolations are convertible",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			false,
		),
	];
};

const checkSelfNestedObjectInterpolation = () => {
	const errors = checkSourceBody(SELF_NESTED_OBJECT_SOURCE);
	return [
		expectEqual(
			"interpolating a nested this.<field> object still reports unconvertibleTemplateExpression",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			true,
		),
	];
};

const checkSelfFactoryInterpolation = () => {
	const errors = checkSourceBody(SELF_FACTORY_SOURCE);
	return [
		expectEqual(
			"nested this.<field>.<field> interpolation inside a typed factory result is convertible",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			false,
		),
	];
};

const checkShadowedFunctionInterpolation = () => {
	const errors = checkSourceBody(SHADOWED_FUNCTION_SOURCE);
	return [
		expectEqual(
			"a parameter that shadows a function name is classified by its declared type",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			false,
		),
	];
};

const checkConvertiblePrimitives = () => {
	const errors = checkSourceBody(PRIMITIVE_NEGATIVE_SOURCE);
	return [
		expectEqual(
			"primitive and nullable primitive interpolations are convertible",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			false,
		),
		expectEqual(
			"the convertible primitive fixtures declare only supported types",
			hasErrorCode(errors, ERROR_CODE.unsupportedType),
			false,
		),
	];
};

const checkConvertibleLiterals = () => {
	const errors = checkSourceBody(LITERAL_NEGATIVE_SOURCE);
	return expectEqual(
		"literal interpolations are convertible",
		hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
		false,
	);
};

const checkCompoundLiteralInterpolation = () => {
	const diagnostics = collectUnconvertibles(
		checkSourceBody(COMPOUND_LITERAL_SOURCE),
	);
	const summary = diagnostics.map((diagnostic) => {
		const start = diagnostic.location?.start;
		return `${diagnostic.params?.type}@${start?.line}:${start?.column}`;
	});
	return [
		expectEqual(
			"unannotated compound literal interpolations are always rejected",
			summary.join("|"),
			"array@4:24|array@5:24|object@6:25|array@7:23",
		),
	];
};

const checkConvertibleEnums = () => {
	const errors = checkSourceBody(ENUM_NEGATIVE_SOURCE);
	return [
		expectEqual(
			"enum interpolations are convertible",
			hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression),
			false,
		),
		expectEqual(
			"the enum fixture declares only supported types",
			hasErrorCode(errors, ERROR_CODE.unsupportedType),
			false,
		),
	];
};

const MINIMAL_RENDER_CONTEXT = {
	renderStringLiteral: (value) => `"${value}"`,
};

const renderTemplates = (source) => {
	const { tokens } = tokenize(source);
	const { ast } = parse(tokens);
	const rendered = [];
	walk(ast, {
		enter: (node) => {
			if (node.type !== AST_NODE.templateLiteral) {
				return;
			}
			rendered.push(renderTemplateLiteral(node, MINIMAL_RENDER_CONTEXT, []));
		},
	});
	return rendered;
};

// A build stops before code generation when the checker reports an
// unconvertible interpolation, so only accepted sources reach the renderer.
// This mirrors that pipeline: whatever the checker accepts must never render a
// compound `String({ ... })` initialization (there is no such overload in C++).
const renderAcceptedTemplates = (source) => {
	const errors = checkSourceBody(source);
	if (hasErrorCode(errors, ERROR_CODE.unconvertibleTemplateExpression)) {
		return [];
	}
	return renderTemplates(source);
};

const checkCodegenNeverEmitsCompoundString = () => {
	const compoundOutput = renderAcceptedTemplates(COMPOUND_LITERAL_SOURCE);
	const primitiveOutput = renderAcceptedTemplates(PRIMITIVE_NEGATIVE_SOURCE);
	const acceptedOutputs = [...compoundOutput, ...primitiveOutput];
	return [
		expectEqual(
			"compound literal interpolations are blocked before code generation",
			compoundOutput.length,
			0,
		),
		expectEqual(
			"the valid primitive fixtures still reach code generation",
			primitiveOutput.length > 0,
			true,
		),
		expectEqual(
			"no accepted interpolation renders a compound String({...}) overload",
			acceptedOutputs.some((output) => {
				return output.includes("core_string::String({");
			}),
			false,
		),
	];
};

const formatSource = (source) => {
	const { tokens } = tokenize(source);
	const { ast, errors, comments } = parse(tokens);
	return {
		formatted: format(ast, comments, source),
		errors,
	};
};

const checkFormatterPreservesValidTemplate = () => {
	const { formatted, errors } = formatSource(FORMATTER_SOURCE);
	const reformatted = formatSource(formatted).formatted;
	return expectEqual(
		"formatter keeps a valid interpolation and stays idempotent",
		[errors.length, formatted.trimEnd(), reformatted].join("|"),
		[0, FORMATTER_SOURCE, formatted].join("|"),
	);
};

// The checker runs before code generation, so an unconvertible interpolation
// stops the build with this diagnostic instead of reaching `String(...)` in C++.
const checkBuildStopsBeforeCodegen = () => {
	const errors = checkSourceBody(PERSONA_SOURCE);
	return expectEqual(
		"the invalid interpolation is an error the build can stop on",
		findUnconvertible(errors)?.severity,
		0,
	);
};

export const runTemplateInterpolationChecks = () => {
	return [
		...checkObjectInterpolation(),
		...checkAnonymousShapeInterpolation(),
		...checkNestedObjectInterpolation(),
		...checkArrayInterpolation(),
		...checkFunctionInterpolation(),
		...checkVoidCallInterpolation(),
		...checkSelfMemberInterpolation(),
		...checkSelfOnlyInterpolation(),
		...checkSelfNestedInterpolation(),
		...checkSelfNestedObjectInterpolation(),
		...checkSelfFactoryInterpolation(),
		...checkShadowedFunctionInterpolation(),
		...checkConvertiblePrimitives(),
		checkConvertibleLiterals(),
		...checkCompoundLiteralInterpolation(),
		...checkConvertibleEnums(),
		...checkCodegenNeverEmitsCompoundString(),
		checkFormatterPreservesValidTemplate(),
		checkBuildStopsBeforeCodegen(),
	];
};
