import {
	AST_NODE,
	check,
	ERROR_CODE,
	formatDiagnosticMessage,
	parse,
	tokenize,
} from "embedito95-core";
import { expectEqual } from "./reporting.js";
import { parseSource } from "./src/language/language-snapshot-harness.mjs";

const FUNCTION_TYPE_ANNOTATION_SOURCE = [
	"const run = (callback: () => void) => { callback() }",
	"const compute = (callback: () => i16): i16 => { return callback() }",
	"const each = (callback: (value: i16) => void) => { callback(1) }",
	"type Handler = {",
	"    onEvent: (value: i16) => void",
	"}",
	"const nested = (callback: (inner: () => void) => void) => { callback() }",
	"const handler: (value: i16) => void = each",
].join("\n");

const INVALID_FUNCTION_TYPE_SOURCES = [
	"const broken: (value: ) => void = y",
	"const broken: () => = y",
	"const broken: (,) => void = y",
];

const parseWithErrors = (source) => {
	const { tokens } = tokenize(source);
	return parse(tokens);
};

const hasUnexpectedTokenError = (errors) => {
	return errors.some((error) => {
		return error.code === ERROR_CODE.unexpectedToken;
	});
};

const findVariableDeclaration = (ast, name) => {
	return ast.body.find((statement) => {
		return (
			statement.type === AST_NODE.variableDeclaration &&
			statement.declarations?.[0]?.id?.name === name
		);
	});
};

const findVariableAnnotation = (ast, name) => {
	return findVariableDeclaration(ast, name)?.declarations?.[0]?.id
		?.typeAnnotation;
};

const findFunctionInitializer = (ast, name) => {
	return findVariableDeclaration(ast, name)?.declarations?.[0]?.init ?? null;
};

const findFunctionParameterAnnotation = (ast, functionName, parameterIndex) => {
	const initializer = findFunctionInitializer(ast, functionName);
	return initializer?.params?.[parameterIndex]?.typeAnnotation ?? null;
};

const findTypeMember = (ast, typeName, memberName) => {
	const declaration = ast.body.find((statement) => {
		return (
			statement.type === AST_NODE.typeDeclaration && statement.name === typeName
		);
	});
	return (
		declaration?.members?.find((member) => {
			return member.name === memberName;
		}) ?? null
	);
};

const runChecker = (source) => {
	const { tokens } = tokenize(source);
	const { ast } = parse(tokens);
	return check(ast, { isLibrary: false, isEntry: false }).errors;
};

const hasDiagnostic = (errors, code) => {
	return errors.some((error) => {
		return error.code === code;
	});
};

const findDiagnostic = (errors, code) => {
	return errors.find((error) => {
		return error.code === code;
	});
};

const MISSING_PARAMETER_TYPE_SOURCE = [
	"const invoke = (callback) => { callback() }",
	"export const main = () => { invoke(() => {}) }",
].join("\n");

const MISSING_MEMBER_PARAMETER_TYPE_SOURCE = [
	"type Timer = { initialize: (period: u32, callback) => void }",
	"export const use = (timer: Timer) => { timer.initialize(1, () => {}) }",
].join("\n");

const NAMED_CALLBACK_SOURCE = [
	"const testFun = (value: i16): i16 => { return value }",
	"const invoke = (callback: (value: i16) => i16): i16 => { return callback(1) }",
	"export const main = () => { return invoke(testFun) }",
].join("\n");

const ARROW_CALLBACK_SOURCE = [
	"const invoke = (callback: (value: i16) => void) => { callback(1) }",
	"export const main = () => { invoke((value: i16) => {}) }",
].join("\n");

const PARAMETER_COUNT_MISMATCH_SOURCE = [
	"const invoke = (callback: (value: i16) => void) => { callback(1) }",
	"export const main = () => { invoke(() => {}) }",
].join("\n");

const PARAMETER_TYPE_MISMATCH_SOURCE = [
	"const invoke = (callback: (value: i16) => void) => { callback(1) }",
	"export const main = () => { invoke((value: u8) => {}) }",
].join("\n");

const RETURN_TYPE_MISMATCH_SOURCE = [
	"const invoke = (callback: () => void) => { callback() }",
	"export const main = () => { invoke(() => { return 8 }) }",
].join("\n");

const CAPTURING_CALLBACK_SOURCE = [
	"const invoke = (callback: () => void) => { callback() }",
	"export const main = () => {",
	"    const threshold = 1",
	"    invoke(() => { const value = threshold })",
	"}",
].join("\n");

const CAPTURELESS_CALLBACK_SOURCE = [
	"const mark = () => {}",
	"const invoke = (callback: () => void) => { callback() }",
	"export const main = () => { invoke(() => { mark() }) }",
].join("\n");

const FUNCTION_TYPE_UNION_SOURCE = [
	"const invoke = (callback: (value: i16 | null) => void) => { callback(null) }",
	"export const main = () => { invoke((value: i16 | null) => {}) }",
].join("\n");

const FUNCTION_TYPE_REFERENCE_SOURCE = [
	"type Payload = { value: i16 }",
	"const invoke = (callback: (payload: Payload) => void) => {}",
	"export const main = () => { invoke((payload: Payload) => {}) }",
].join("\n");

const buildCheckerResults = () => {
	const missingParameterErrors = runChecker(MISSING_PARAMETER_TYPE_SOURCE);
	const missingMemberErrors = runChecker(MISSING_MEMBER_PARAMETER_TYPE_SOURCE);
	const namedErrors = runChecker(NAMED_CALLBACK_SOURCE);
	const arrowErrors = runChecker(ARROW_CALLBACK_SOURCE);
	const countMismatchErrors = runChecker(PARAMETER_COUNT_MISMATCH_SOURCE);
	const parameterMismatchErrors = runChecker(PARAMETER_TYPE_MISMATCH_SOURCE);
	const returnMismatchErrors = runChecker(RETURN_TYPE_MISMATCH_SOURCE);
	const capturingErrors = runChecker(CAPTURING_CALLBACK_SOURCE);
	const capturelessErrors = runChecker(CAPTURELESS_CALLBACK_SOURCE);
	const functionUnionErrors = runChecker(FUNCTION_TYPE_UNION_SOURCE);
	const referenceErrors = runChecker(FUNCTION_TYPE_REFERENCE_SOURCE);
	const countMismatch = findDiagnostic(
		countMismatchErrors,
		ERROR_CODE.callbackSignatureMismatch,
	);
	const parameterMismatch = findDiagnostic(
		parameterMismatchErrors,
		ERROR_CODE.callbackSignatureMismatch,
	);
	const returnMismatch = findDiagnostic(
		returnMismatchErrors,
		ERROR_CODE.callbackSignatureMismatch,
	);

	return [
		expectEqual(
			"an untyped parameter is reported without a callback slot",
			hasDiagnostic(missingParameterErrors, ERROR_CODE.missingTypeAnnotation),
			true,
		),
		expectEqual(
			"an untyped method parameter of a type member is reported",
			hasDiagnostic(missingMemberErrors, ERROR_CODE.missingTypeAnnotation),
			true,
		),
		expectEqual(
			"a named function matches a function-typed parameter",
			hasDiagnostic(namedErrors, ERROR_CODE.callbackSignatureMismatch),
			false,
		),
		expectEqual(
			"an anonymous arrow matches a function-typed parameter",
			hasDiagnostic(arrowErrors, ERROR_CODE.callbackSignatureMismatch),
			false,
		),
		expectEqual(
			"a parameter count mismatch is reported",
			countMismatch !== undefined,
			true,
		),
		expectEqual(
			"a parameter count mismatch names the failing dimension",
			formatDiagnosticMessage(countMismatch).includes("parameter count"),
			true,
		),
		expectEqual(
			"a parameter type mismatch names the failing dimension",
			formatDiagnosticMessage(parameterMismatch).includes("type"),
			true,
		),
		expectEqual(
			"a return type mismatch names the failing dimension",
			formatDiagnosticMessage(returnMismatch).includes("return type"),
			true,
		),
		expectEqual(
			"an arrow that captures local state is reported",
			hasDiagnostic(capturingErrors, ERROR_CODE.callbackCapturesLocalState),
			true,
		),
		expectEqual(
			"an arrow without captures is accepted",
			hasDiagnostic(capturelessErrors, ERROR_CODE.callbackCapturesLocalState),
			false,
		),
		expectEqual(
			"a union inside a function type is not an arbitrary union",
			hasDiagnostic(functionUnionErrors, ERROR_CODE.arbitraryUnion),
			false,
		),
		expectEqual(
			"a type referenced only inside a function type is used",
			hasDiagnostic(referenceErrors, ERROR_CODE.unusedType),
			false,
		),
	];
};

const describeAnnotation = (annotation) => {
	return `${annotation?.type}:${annotation?.functionType?.returnType}`;
};

const describeParameter = (parameter) => {
	return `${parameter?.name}:${parameter?.type}:${parameter?.typeAnnotation?.type}`;
};

export const runFunctionTypeParserChecks = () => {
	const { ast } = parseSource(FUNCTION_TYPE_ANNOTATION_SOURCE);
	const runAnnotation = findFunctionParameterAnnotation(ast, "run", 0);
	const computeAnnotation = findFunctionParameterAnnotation(ast, "compute", 0);
	const eachAnnotation = findFunctionParameterAnnotation(ast, "each", 0);
	const nestedAnnotation = findFunctionParameterAnnotation(ast, "nested", 0);
	const handlerAnnotation = findVariableAnnotation(ast, "handler");
	const onEventMember = findTypeMember(ast, "Handler", "onEvent");
	const invalidInputResults = INVALID_FUNCTION_TYPE_SOURCES.flatMap(
		(source) => {
			const { ast: invalidAst, errors } = parseWithErrors(source);
			const invalidAnnotation = findVariableAnnotation(invalidAst, "broken");
			return [
				expectEqual(
					"malformed function annotation reports an unexpected token",
					hasUnexpectedTokenError(errors),
					true,
				),
				expectEqual(
					"malformed function annotation keeps the type readable without a placeholder",
					invalidAnnotation?.type?.includes("?"),
					false,
				),
			];
		},
	);

	return [
		expectEqual(
			"zero-argument function annotation keeps a structured signature",
			describeAnnotation(runAnnotation),
			"() => void:void",
		),
		expectEqual(
			"zero-argument function annotation exposes its parameters",
			runAnnotation?.functionType?.params?.length,
			0,
		),
		expectEqual(
			"function annotation with arguments keeps the parameter name and type",
			describeParameter(eachAnnotation?.functionType?.params?.[0]),
			"value:i16:i16",
		),
		expectEqual(
			"function annotation keeps a readable type string",
			eachAnnotation?.type,
			"(value: i16) => void",
		),
		expectEqual(
			"function annotation return type keeps its annotation",
			computeAnnotation?.functionType?.returnTypeAnnotation?.type,
			"i16",
		),
		expectEqual(
			"type member function annotations stay structured",
			`${onEventMember?.kind}:${describeParameter(onEventMember?.params?.[0])}:${onEventMember?.returnType}`,
			"method:value:i16:i16:void",
		),
		expectEqual(
			"nested function annotations keep their inner signature",
			nestedAnnotation?.functionType?.params?.[0]?.typeAnnotation?.functionType
				?.returnType,
			"void",
		),
		expectEqual(
			"variable annotations accept function types",
			handlerAnnotation?.type,
			"(value: i16) => void",
		),
		...invalidInputResults,
		...buildCheckerResults(),
	];
};
