// LSP diagnostics checks. Covers parser error-recovery (each malformed statement
// reports a single root-cause parse error and still returns a traversable AST)
// and diagnostic priority (the earliest local error wins over entry-global
// errors, one visible error per file). Diagnostics come from
// `computeDiagnostics`, the same pipeline the language server runs.
import { pathToFileURL } from "node:url";
import {
	AST_NODE,
	ERROR_CODE,
	formatDiagnosticMessage,
	parse,
	tokenize,
	walk,
} from "embedito95-core";
import { computeDiagnostics } from "../lsp/src/diagnostics.js";
import { ASYNC_TASK_DECLARATION } from "./async-task-type-parser-checks.js";
import { SNAPSHOT_STATUS } from "./constants.js";
import { expectEqual } from "./reporting.js";

const LSP_SEVERITY = {
	error: 1,
	warning: 2,
	info: 3,
	hint: 4,
};

const LSP_SEVERITY_NAMES = {
	[LSP_SEVERITY.error]: "error",
	[LSP_SEVERITY.warning]: "warning",
	[LSP_SEVERITY.info]: "info",
	[LSP_SEVERITY.hint]: "hint",
};

const ERROR_SEVERITY_LABEL = LSP_SEVERITY_NAMES[LSP_SEVERITY.error];

const TYPE_MISMATCH_SOURCE = 'const x: u8 = "hola";';
const UNKNOWN_MEMBER_SOURCE = [
	"type Persona = { name: string, age: i32 }",
	'const getPersona = (): Persona => { return { name: "ana", age: 30 } }',
	"const probando = (value: string) => {}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = getPersona()",
	"    probando(persona.nom)",
	"}",
].join("\n");
const INFERRED_UNKNOWN_MEMBER_SOURCE = [
	'const getPersona = () => { return { name: "ana", age: 30 } }',
	"const probando = (value: string) => {}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = getPersona()",
	"    probando(persona.nom)",
	"}",
].join("\n");
const ASYNC_TASK_MEMBER_ACCESS_SOURCE = [
	ASYNC_TASK_DECLARATION,
	'const getPersona = async () => { return { name: "David", age: 31 } }',
	"const consume = (value: string) => {}",
	"const test = async () => {",
	"    const persona = getPersona()",
	"    consume(persona.name)",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    test()",
	"}",
	"main()",
].join("\n");
const ASYNC_TASK_ARGUMENT_SOURCE = [
	ASYNC_TASK_DECLARATION,
	'const getPersona = async () => { return { name: "David", age: 31 } }',
	"type Persona = { name: string, age: i32 }",
	"const consume = (value: Persona) => { return value.name }",
	"const test = async () => {",
	"    const persona = getPersona()",
	"    consume(persona)",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    test()",
	"}",
	"main()",
].join("\n");
const UNCONVERTIBLE_INTERPOLATION_SOURCE = [
	"type Persona = { name: string, age: i32 }",
	'const getPersona = (): Persona => { return { name: "ana", age: 30 } }',
	"const probando = (value: string) => {}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = getPersona()",
	"    probando(`${persona}`)",
	"}",
].join("\n");
const SETUP_ONLY_SOURCE = "const setup = () => {}";
const EMPTY_SOURCE = "";
const EMPTY_ARRAY_INTERPOLATION_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const valor = `${[]}`",
	"}",
].join("\n");
const NUMBER_ARRAY_INTERPOLATION_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const valor = `${[1, 2]}`",
	"}",
].join("\n");
const SELF_MEMBER_INTERPOLATION_SOURCE = [
	"type Labeled = { value: i32, text: string, describe: () => string }",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	'    const item: Labeled = { value: 1, text: "x",',
	"        describe: () => { return `${this.text}-${this.value}-${this.describe()}` } }",
	"}",
].join("\n");
const SHADOWED_FUNCTION_INTERPOLATION_SOURCE = [
	"const peek = () => { return 1 }",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const probando = (peek: i32) => { const valor = `${peek}` }",
	"}",
].join("\n");
const LOCAL_ERROR_LINE_FIVE_SOURCE = [
	"const setup = () => {}",
	"",
	"",
	"",
	'const broken: u8 = "hola";',
].join("\n");
const TWO_UNUSED_CONSTANTS_SOURCE = [
	"const first = 1;",
	"const second = 2;",
].join("\n");
const UNUSED_PARAMETER_SOURCE = [
	"const setup = () => {}",
	"const f = (unused: i32) => { return 1 }",
	"const main = () => {",
	"    setup()",
	"    f(1)",
	"}",
].join("\n");
const SHADOWED_UNUSED_LOCAL_SOURCE = [
	"type Persona = { name: string, age: i32 }",
	'const getPersona = (): Persona => { return { name: "ana", age: 30 } }',
	"const other = () => {",
	"    const persona = 1",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    const persona = 2",
	`    const value = \`\${persona}\``,
	"}",
].join("\n");
const TWO_LOCAL_ERRORS_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"setup()",
	'const first: u8 = "hola";',
	'const second: u8 = "mundo";',
	"}",
].join("\n");
const TWO_LOCAL_ERRORS_SAME_LINE_SOURCE = [
	"const setup = () => {}",
	'const main = () => { setup(); const first: u8 = "hola"; const second: u8 = "mundo"; }',
].join("\n");
const MISSING_SETUP_CALL_WITH_LOCAL_ERROR_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	'const broken: u8 = "hola";',
	"}",
].join("\n");
const MISSING_SETUP_CALL_ONLY_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"}",
].join("\n");
const ENTRY_POINT_NOT_CALLED_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"}",
].join("\n");
const EXPECTED_TYPE_MISMATCH_MESSAGE = formatDiagnosticMessage({
	code: ERROR_CODE.assignmentTypeMismatch,
	params: { rhsType: "string", name: "x", type: "u8" },
});
const EXPECTED_UNKNOWN_MEMBER_MESSAGE = formatDiagnosticMessage({
	code: ERROR_CODE.unknownMember,
	params: { name: "nom", type: "Persona" },
});
const EXPECTED_INFERRED_UNKNOWN_MEMBER_MESSAGE = formatDiagnosticMessage({
	code: ERROR_CODE.unknownMember,
	params: { name: "nom", type: "object:{name:string;age:i8}" },
});
const EXPECTED_ASYNC_TASK_MEMBER_ACCESS_MESSAGE = formatDiagnosticMessage({
	code: ERROR_CODE.asyncTaskMemberAccess,
	params: { name: "name", type: "AsyncTask<object:{name:string;age:i8}>" },
});
const EXPECTED_ASYNC_TASK_ARGUMENT_MESSAGE = formatDiagnosticMessage({
	code: ERROR_CODE.asyncTaskArgument,
	params: {
		name: "value",
		expected: "Persona",
		actual: "AsyncTask<object:{name:string;age:i8}>",
	},
});
const EXPECTED_UNCONVERTIBLE_INTERPOLATION_MESSAGE = formatDiagnosticMessage({
	code: ERROR_CODE.unconvertibleTemplateExpression,
	params: { type: "Persona" },
});
const EXPECTED_UNCONVERTIBLE_ARRAY_INTERPOLATION_MESSAGE =
	formatDiagnosticMessage({
		code: ERROR_CODE.unconvertibleTemplateExpression,
		params: { type: "array" },
	});
const EXPECTED_MISSING_MAIN_MESSAGE = formatDiagnosticMessage({
	code: ERROR_CODE.missingRequiredFunction,
	params: { name: "main" },
});
const EXPECTED_MISSING_SETUP_MESSAGE = formatDiagnosticMessage({
	code: ERROR_CODE.missingRequiredFunction,
	params: { name: "setup" },
});
const EXPECTED_MISSING_SETUP_CALL_MESSAGE = formatDiagnosticMessage({
	code: ERROR_CODE.missingSetupCall,
	params: {},
});
const EXPECTED_ENTRY_POINT_NOT_CALLED_MESSAGE = formatDiagnosticMessage({
	code: ERROR_CODE.entryPointNotCalled,
	params: { name: "main" },
});
const EXPECTED_EOF_MESSAGE = formatDiagnosticMessage({
	code: ERROR_CODE.unexpectedEof,
	params: {},
});

const MISSING_IMPORT_BRACE_SOURCE = "import { X";
const MISSING_IMPORT_BRACE_TRAILING_SOURCE = [
	"import { X",
	"const setup = () => {}",
].join("\n");
const DANGLING_MEMBER_TEMPLATE_SOURCE = `const a = \`\${persona.}\``;
const DANGLING_MEMBER_STATEMENT_SOURCE = [
	"const nombre = persona.",
	"const otro = 1",
].join("\n");
const FOUND_DOT = '"."';
const MISSING_IF_PARENTHESIS_SOURCE = "if (1 {}) {}";
const NESTED_MISSING_IF_PARENTHESIS_SOURCE = [
	"if (1) {",
	"    if (2 {}) {}",
	"}",
].join("\n");

const EXPECTED_IMPORT_BRACE = '"}"';
const EXPECTED_IF_PARENTHESIS = '")"';
const FOUND_KEYWORD = "keyword";
const FOUND_LEFT_BRACE = '"{"';

const parseSource = (source) => {
	const { tokens, errors: lexErrors } = tokenize(source);
	return { lexErrors, ...parse(tokens) };
};

const formatUnexpectedToken = ({ expected, found }) => {
	return formatDiagnosticMessage({
		code: ERROR_CODE.unexpectedToken,
		params: { expected, found },
	});
};

const renderDiagnostic = (diagnostic) => {
	const start = diagnostic.range.start;
	const severity = LSP_SEVERITY_NAMES[diagnostic.severity] ?? "unknown";
	return `${start.line + 1}:${start.character + 1} ${severity} ${diagnostic.code} ${diagnostic.message}`;
};

const findErrorDiagnostic = (diagnostics) => {
	return diagnostics.find((diagnostic) => {
		return diagnostic.severity === LSP_SEVERITY.error;
	});
};

const countErrorDiagnostics = (diagnostics) => {
	return diagnostics.filter((diagnostic) => {
		return diagnostic.severity === LSP_SEVERITY.error;
	}).length;
};

const countWarningDiagnostics = (diagnostics) => {
	return diagnostics.filter((diagnostic) => {
		return diagnostic.severity === LSP_SEVERITY.warning;
	}).length;
};

const computeEntryDiagnostics = (source) => {
	return computeDiagnostics(source, null, {}, false, true);
};

const makeNodeCounter = (nodeType, counts) => {
	return (node) => {
		if (node.type === nodeType) {
			counts.total++;
		}
	};
};

const countNodesOfType = (ast, nodeType) => {
	const counts = { total: 0 };
	const countNode = makeNodeCounter(nodeType, counts);
	walk(ast, { enter: countNode });
	return counts.total;
};

const checkMissingImportBraceReportsSingleError = () => {
	const { lexErrors, ast, errors } = parseSource(MISSING_IMPORT_BRACE_SOURCE);
	const parseError = errors[0];
	return expectEqual(
		"parser reports only the missing import brace",
		[
			lexErrors.length,
			errors.length,
			parseError?.code,
			formatDiagnosticMessage(parseError ?? {}),
			ast.body.length,
			ast.body[0]?.type,
			ast.body[0]?.specifiers.length,
		].join("|"),
		[
			0,
			1,
			ERROR_CODE.unexpectedEof,
			EXPECTED_EOF_MESSAGE,
			1,
			AST_NODE.importDeclaration,
			1,
		].join("|"),
	);
};

const checkMissingImportBraceLspDiagnostic = async () => {
	const diagnostics = await computeDiagnostics(
		MISSING_IMPORT_BRACE_SOURCE,
		null,
		{},
		false,
		true,
	);
	const diagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows one diagnostic for an unterminated import",
		[
			countErrorDiagnostics(diagnostics),
			diagnostic ? renderDiagnostic(diagnostic) : "none",
		].join("|"),
		[
			1,
			`1:8 ${ERROR_SEVERITY_LABEL} ${ERROR_CODE.unexpectedEof} ${EXPECTED_EOF_MESSAGE}`,
		].join("|"),
	);
};

const checkMissingImportBraceKeepsTrailingStatement = () => {
	const { lexErrors, ast, errors } = parseSource(
		MISSING_IMPORT_BRACE_TRAILING_SOURCE,
	);
	const parseError = errors[0];
	const trailingStatement = ast.body[1];
	return expectEqual(
		"parser reports the missing import brace and keeps the trailing statement",
		[
			lexErrors.length,
			errors.length,
			parseError?.code,
			formatUnexpectedToken(parseError?.params ?? {}),
			parseError?.location?.start?.line,
			parseError?.location?.start?.column,
			ast.body.length,
			ast.body[0]?.type,
			ast.body[0]?.specifiers.length,
			trailingStatement?.type,
			trailingStatement?.kind,
			trailingStatement?.declarations[0]?.init?.type,
		].join("|"),
		[
			0,
			1,
			ERROR_CODE.unexpectedToken,
			formatUnexpectedToken({
				expected: EXPECTED_IMPORT_BRACE,
				found: FOUND_KEYWORD,
			}),
			1,
			8,
			2,
			AST_NODE.importDeclaration,
			1,
			AST_NODE.variableDeclaration,
			"const",
			AST_NODE.functionExpression,
		].join("|"),
	);
};

const checkMissingImportBraceTrailingStatementLspDiagnostic = async () => {
	const diagnostics = await computeDiagnostics(
		MISSING_IMPORT_BRACE_TRAILING_SOURCE,
		null,
		{},
		false,
		true,
	);
	const diagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows one diagnostic at the import line and keeps the trailing statement",
		[
			countErrorDiagnostics(diagnostics),
			diagnostic ? renderDiagnostic(diagnostic) : "none",
		].join("|"),
		[
			1,
			`1:8 ${ERROR_SEVERITY_LABEL} ${ERROR_CODE.unexpectedToken} ${formatUnexpectedToken(
				{
					expected: EXPECTED_IMPORT_BRACE,
					found: FOUND_KEYWORD,
				},
			)}`,
		].join("|"),
	);
};

const checkMissingIfParenthesisReportsSingleError = () => {
	const { lexErrors, ast, errors } = parseSource(MISSING_IF_PARENTHESIS_SOURCE);
	const parseError = errors[0];
	const ifStatement = ast.body[0];
	return expectEqual(
		"parser reports only the missing if parenthesis",
		[
			lexErrors.length,
			errors.length,
			parseError?.code,
			formatUnexpectedToken(parseError?.params ?? {}),
			ast.body.length,
			ifStatement?.type,
			ifStatement?.consequent?.type,
			ifStatement?.consequent?.body.length,
		].join("|"),
		[
			0,
			1,
			ERROR_CODE.unexpectedToken,
			formatUnexpectedToken({
				expected: EXPECTED_IF_PARENTHESIS,
				found: FOUND_LEFT_BRACE,
			}),
			1,
			AST_NODE.ifStatement,
			AST_NODE.blockStatement,
			0,
		].join("|"),
	);
};

const checkMissingIfParenthesisLspDiagnostic = async () => {
	const diagnostics = await computeDiagnostics(
		MISSING_IF_PARENTHESIS_SOURCE,
		null,
		{},
		false,
		true,
	);
	const diagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows one diagnostic for a missing if parenthesis",
		[
			countErrorDiagnostics(diagnostics),
			diagnostic ? renderDiagnostic(diagnostic) : "none",
		].join("|"),
		[
			1,
			`1:7 ${ERROR_SEVERITY_LABEL} ${ERROR_CODE.unexpectedToken} ${formatUnexpectedToken(
				{
					expected: EXPECTED_IF_PARENTHESIS,
					found: FOUND_LEFT_BRACE,
				},
			)}`,
		].join("|"),
	);
};

const checkNestedMissingIfParenthesis = () => {
	const { errors, ast } = parseSource(NESTED_MISSING_IF_PARENTHESIS_SOURCE);
	const parseError = errors[0];
	return expectEqual(
		"parser recovers inside a nested if without cascading",
		[
			errors.length,
			formatUnexpectedToken(parseError?.params ?? {}),
			countNodesOfType(ast, AST_NODE.ifStatement),
			countNodesOfType(ast, AST_NODE.blockStatement),
		].join("|"),
		[
			1,
			formatUnexpectedToken({
				expected: EXPECTED_IF_PARENTHESIS,
				found: FOUND_LEFT_BRACE,
			}),
			2,
			2,
		].join("|"),
	);
};

const checkParserAlwaysReturnsTraversableAst = () => {
	const malformedSources = [
		")",
		"}",
		"if (",
		"import {",
		"switch (1) { 1 }",
		"if (1) {",
	];
	const results = malformedSources.map((source) => {
		const { ast, errors } = parseSource(source);
		return `${Array.isArray(ast.body)}:${errors.length > 0}`;
	});
	return expectEqual(
		"parser terminates and returns an AST for malformed statements",
		results.join("|"),
		malformedSources.map(() => "true:true").join("|"),
	);
};

const checkValidSourceStillParses = () => {
	const { errors, ast } = parseSource('import { X } from "lib"');
	return expectEqual(
		"parser keeps accepting a complete import declaration",
		[errors.length, ast.body[0]?.type].join("|"),
		[0, AST_NODE.importDeclaration].join("|"),
	);
};

const checkLocalTypeErrorHasPriorityOverMissingSetup = () => {
	const diagnostics = computeEntryDiagnostics(TYPE_MISMATCH_SOURCE);
	const errorDiagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows the local type error instead of the missing setup error",
		[
			countErrorDiagnostics(diagnostics),
			errorDiagnostic?.code,
			errorDiagnostic?.message,
			errorDiagnostic
				? `${errorDiagnostic.range.start.line + 1}:${errorDiagnostic.range.start.character + 1}`
				: "none",
		].join("|"),
		[
			1,
			ERROR_CODE.assignmentTypeMismatch,
			EXPECTED_TYPE_MISMATCH_MESSAGE,
			"1:15",
		].join("|"),
	);
};

const checkUnknownMemberLspDiagnostic = () => {
	const diagnostics = computeEntryDiagnostics(UNKNOWN_MEMBER_SOURCE);
	const errorDiagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows an unknown object member at the property location",
		[
			countErrorDiagnostics(diagnostics),
			errorDiagnostic?.code,
			errorDiagnostic?.message,
			errorDiagnostic
				? `${errorDiagnostic.range.start.line + 1}:${errorDiagnostic.range.start.character + 1}`
				: "none",
		].join("|"),
		[1, ERROR_CODE.unknownMember, EXPECTED_UNKNOWN_MEMBER_MESSAGE, "8:22"].join(
			"|",
		),
	);
};

const checkUnconvertibleInterpolationLspDiagnostic = () => {
	const diagnostics = computeEntryDiagnostics(
		UNCONVERTIBLE_INTERPOLATION_SOURCE,
	);
	const errorDiagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows an unconvertible template interpolation at the expression location",
		[
			countErrorDiagnostics(diagnostics),
			errorDiagnostic?.code,
			errorDiagnostic?.message,
			errorDiagnostic
				? `${errorDiagnostic.range.start.line + 1}:${errorDiagnostic.range.start.character + 1}`
				: "none",
		].join("|"),
		[
			1,
			ERROR_CODE.unconvertibleTemplateExpression,
			EXPECTED_UNCONVERTIBLE_INTERPOLATION_MESSAGE,
			"8:17",
		].join("|"),
	);
};

const checkCompoundLiteralInterpolationLspDiagnostic = () => {
	const emptyArrayDiagnostics = computeEntryDiagnostics(
		EMPTY_ARRAY_INTERPOLATION_SOURCE,
	);
	const numberArrayDiagnostics = computeEntryDiagnostics(
		NUMBER_ARRAY_INTERPOLATION_SOURCE,
	);
	const emptyArrayError = findErrorDiagnostic(emptyArrayDiagnostics);
	const numberArrayError = findErrorDiagnostic(numberArrayDiagnostics);
	const renderRange = (diagnostic) => {
		if (!diagnostic) {
			return "none";
		}
		const start = diagnostic.range.start;
		const end = diagnostic.range.end;
		return `${start.line + 1}:${start.character + 1}-${end.line + 1}:${end.character + 1}`;
	};
	return expectEqual(
		"LSP shows unannotated array interpolations at the expression range",
		[
			countErrorDiagnostics(emptyArrayDiagnostics),
			emptyArrayError?.code,
			emptyArrayError?.message,
			renderRange(emptyArrayError),
			countErrorDiagnostics(numberArrayDiagnostics),
			numberArrayError?.code,
			numberArrayError?.message,
			renderRange(numberArrayError),
		].join("|"),
		[
			1,
			ERROR_CODE.unconvertibleTemplateExpression,
			EXPECTED_UNCONVERTIBLE_ARRAY_INTERPOLATION_MESSAGE,
			"4:22-4:23",
			1,
			ERROR_CODE.unconvertibleTemplateExpression,
			EXPECTED_UNCONVERTIBLE_ARRAY_INTERPOLATION_MESSAGE,
			"4:22-4:27",
		].join("|"),
	);
};

const checkConvertibleInterpolationLspDiagnostics = () => {
	const sources = [
		SELF_MEMBER_INTERPOLATION_SOURCE,
		SHADOWED_FUNCTION_INTERPOLATION_SOURCE,
	];
	const counts = sources.map((source) => {
		return computeEntryDiagnostics(source).filter((diagnostic) => {
			return diagnostic.code === ERROR_CODE.unconvertibleTemplateExpression;
		}).length;
	});
	return expectEqual(
		"LSP does not flag this.<field>, this.<method>() or shadowed function names as unconvertible",
		counts.join("|"),
		"0|0",
	);
};

const checkInferredUnknownMemberLspDiagnostic = () => {
	const diagnostics = computeEntryDiagnostics(INFERRED_UNKNOWN_MEMBER_SOURCE);
	const errorDiagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows an unknown member of an inferred anonymous shape at the property location",
		[
			countErrorDiagnostics(diagnostics),
			errorDiagnostic?.code,
			errorDiagnostic?.message,
			errorDiagnostic
				? `${errorDiagnostic.range.start.line + 1}:${errorDiagnostic.range.start.character + 1}`
				: "none",
		].join("|"),
		[
			1,
			ERROR_CODE.unknownMember,
			EXPECTED_INFERRED_UNKNOWN_MEMBER_MESSAGE,
			"7:22",
		].join("|"),
	);
};

const checkAsyncTaskMemberAccessLspDiagnostic = () => {
	const diagnostics = computeEntryDiagnostics(ASYNC_TASK_MEMBER_ACCESS_SOURCE);
	const errorDiagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows an un-awaited AsyncTask member access at the property location",
		[
			countErrorDiagnostics(diagnostics),
			errorDiagnostic?.code,
			errorDiagnostic?.message,
			errorDiagnostic
				? `${errorDiagnostic.range.start.line + 1}:${errorDiagnostic.range.start.character + 1}-${errorDiagnostic.range.end.character + 1}`
				: "none",
		].join("|"),
		[
			1,
			ERROR_CODE.asyncTaskMemberAccess,
			EXPECTED_ASYNC_TASK_MEMBER_ACCESS_MESSAGE,
			"9:21-25",
		].join("|"),
	);
};

const checkAsyncTaskArgumentLspDiagnostic = () => {
	const diagnostics = computeEntryDiagnostics(ASYNC_TASK_ARGUMENT_SOURCE);
	const errorDiagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows an un-awaited AsyncTask argument at the source argument",
		[
			countErrorDiagnostics(diagnostics),
			errorDiagnostic?.code,
			errorDiagnostic?.message,
			errorDiagnostic
				? `${errorDiagnostic.range.start.line + 1}:${errorDiagnostic.range.start.character + 1}-${errorDiagnostic.range.end.character + 1}`
				: "none",
		].join("|"),
		[
			1,
			ERROR_CODE.asyncTaskArgument,
			EXPECTED_ASYNC_TASK_ARGUMENT_MESSAGE,
			"10:13-20",
		].join("|"),
	);
};

const checkDanglingMemberParserErrorKeepsNextStatement = () => {
	const templateResult = parseSource(DANGLING_MEMBER_TEMPLATE_SOURCE);
	const templateError = templateResult.errors[0];
	const statementResult = parseSource(DANGLING_MEMBER_STATEMENT_SOURCE);
	const statementError = statementResult.errors[0];
	const trailingStatement = statementResult.ast.body[1];
	return expectEqual(
		"parser reports a dangling member at the dot and keeps the next statement",
		[
			templateResult.errors.length,
			templateError?.code,
			formatUnexpectedToken(templateError?.params ?? {}),
			`${templateError?.location?.start?.line}:${templateError?.location?.start?.column}`,
			statementResult.errors.length,
			statementError?.code,
			formatUnexpectedToken(statementError?.params ?? {}),
			`${statementError?.location?.start?.line}:${statementError?.location?.start?.column}`,
			trailingStatement?.type,
			trailingStatement?.declarations?.[0]?.id?.name,
		].join("|"),
		[
			1,
			ERROR_CODE.unexpectedToken,
			formatUnexpectedToken({ expected: "identifier", found: FOUND_DOT }),
			"1:21",
			1,
			ERROR_CODE.unexpectedToken,
			formatUnexpectedToken({ expected: "identifier", found: FOUND_DOT }),
			"1:23",
			AST_NODE.variableDeclaration,
			"otro",
		].join("|"),
	);
};

const checkDanglingMemberLspDiagnostic = async () => {
	const templateDiagnostics = await computeDiagnostics(
		DANGLING_MEMBER_TEMPLATE_SOURCE,
		null,
		{},
		false,
		true,
	);
	const templateError = findErrorDiagnostic(templateDiagnostics);
	const statementDiagnostics = await computeDiagnostics(
		DANGLING_MEMBER_STATEMENT_SOURCE,
		null,
		{},
		false,
		true,
	);
	const statementError = findErrorDiagnostic(statementDiagnostics);
	return expectEqual(
		"LSP shows a dangling member syntax error at the dot",
		[
			countErrorDiagnostics(templateDiagnostics),
			templateError?.code,
			templateError?.message,
			templateError
				? `${templateError.range.start.line + 1}:${templateError.range.start.character + 1}`
				: "none",
			countErrorDiagnostics(statementDiagnostics),
			statementError?.code,
			statementError?.message,
			statementError
				? `${statementError.range.start.line + 1}:${statementError.range.start.character + 1}`
				: "none",
		].join("|"),
		[
			1,
			ERROR_CODE.unexpectedToken,
			formatUnexpectedToken({ expected: "identifier", found: FOUND_DOT }),
			"1:21",
			1,
			ERROR_CODE.unexpectedToken,
			formatUnexpectedToken({ expected: "identifier", found: FOUND_DOT }),
			"1:23",
		].join("|"),
	);
};

const checkMissingRequiredFunctionStillShownWithoutLocalErrors = () => {
	const setupOnlyDiagnostics = computeEntryDiagnostics(SETUP_ONLY_SOURCE);
	const setupOnlyError = findErrorDiagnostic(setupOnlyDiagnostics);
	const emptyDiagnostics = computeEntryDiagnostics(EMPTY_SOURCE);
	const emptyError = findErrorDiagnostic(emptyDiagnostics);
	return expectEqual(
		"LSP keeps reporting the missing entry function when there is no local error",
		[
			countErrorDiagnostics(setupOnlyDiagnostics),
			setupOnlyError?.code,
			setupOnlyError?.message,
			countErrorDiagnostics(emptyDiagnostics),
			emptyError?.code,
			emptyError?.message,
		].join("|"),
		[
			1,
			ERROR_CODE.missingRequiredFunction,
			EXPECTED_MISSING_MAIN_MESSAGE,
			1,
			ERROR_CODE.missingRequiredFunction,
			EXPECTED_MISSING_SETUP_MESSAGE,
		].join("|"),
	);
};

const checkLocalErrorOnLineFiveHasPriorityOverMissingMain = () => {
	const diagnostics = computeEntryDiagnostics(LOCAL_ERROR_LINE_FIVE_SOURCE);
	const errorDiagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows the local error on line five instead of the missing main error",
		[
			countErrorDiagnostics(diagnostics),
			errorDiagnostic?.code,
			errorDiagnostic?.message,
			errorDiagnostic
				? `${errorDiagnostic.range.start.line + 1}:${errorDiagnostic.range.start.character + 1}`
				: "none",
		].join("|"),
		[
			1,
			ERROR_CODE.assignmentTypeMismatch,
			formatDiagnosticMessage({
				code: ERROR_CODE.assignmentTypeMismatch,
				params: { rhsType: "string", name: "broken", type: "u8" },
			}),
			"5:20",
		].join("|"),
	);
};

const checkEarliestLocalErrorByLineIsVisible = () => {
	const diagnostics = computeEntryDiagnostics(TWO_LOCAL_ERRORS_SOURCE);
	const errorDiagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows the earliest local error by line when there are several local errors",
		[
			countErrorDiagnostics(diagnostics),
			errorDiagnostic?.code,
			errorDiagnostic?.message,
			errorDiagnostic
				? `${errorDiagnostic.range.start.line + 1}:${errorDiagnostic.range.start.character + 1}`
				: "none",
		].join("|"),
		[
			1,
			ERROR_CODE.assignmentTypeMismatch,
			formatDiagnosticMessage({
				code: ERROR_CODE.assignmentTypeMismatch,
				params: { rhsType: "string", name: "first", type: "u8" },
			}),
			"4:19",
		].join("|"),
	);
};

const checkEarliestLocalErrorByColumnIsVisible = () => {
	const diagnostics = computeEntryDiagnostics(
		TWO_LOCAL_ERRORS_SAME_LINE_SOURCE,
	);
	const errorDiagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows the earliest local error by column when several errors share a line",
		[
			countErrorDiagnostics(diagnostics),
			errorDiagnostic?.code,
			errorDiagnostic?.message,
			errorDiagnostic
				? `${errorDiagnostic.range.start.line + 1}:${errorDiagnostic.range.start.character + 1}`
				: "none",
		].join("|"),
		[
			1,
			ERROR_CODE.assignmentTypeMismatch,
			formatDiagnosticMessage({
				code: ERROR_CODE.assignmentTypeMismatch,
				params: { rhsType: "string", name: "first", type: "u8" },
			}),
			"2:49",
		].join("|"),
	);
};

const checkLocalErrorHasPriorityOverMissingSetupCall = () => {
	const diagnostics = computeEntryDiagnostics(
		MISSING_SETUP_CALL_WITH_LOCAL_ERROR_SOURCE,
	);
	const errorDiagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP shows the local error instead of the missing setup call error",
		[
			countErrorDiagnostics(diagnostics),
			errorDiagnostic?.code,
			errorDiagnostic?.message,
			errorDiagnostic
				? `${errorDiagnostic.range.start.line + 1}:${errorDiagnostic.range.start.character + 1}`
				: "none",
		].join("|"),
		[
			1,
			ERROR_CODE.assignmentTypeMismatch,
			formatDiagnosticMessage({
				code: ERROR_CODE.assignmentTypeMismatch,
				params: { rhsType: "string", name: "broken", type: "u8" },
			}),
			"3:20",
		].join("|"),
	);
};

const checkMissingSetupCallShownWithoutLocalErrors = () => {
	const diagnostics = computeEntryDiagnostics(MISSING_SETUP_CALL_ONLY_SOURCE);
	const errorDiagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP falls back to the missing setup call error without local errors",
		[
			countErrorDiagnostics(diagnostics),
			errorDiagnostic?.code,
			errorDiagnostic?.message,
		].join("|"),
		[1, ERROR_CODE.missingSetupCall, EXPECTED_MISSING_SETUP_CALL_MESSAGE].join(
			"|",
		),
	);
};

const checkEntryPointNotCalledLspDiagnostic = () => {
	const diagnostics = computeEntryDiagnostics(ENTRY_POINT_NOT_CALLED_SOURCE);
	const errorDiagnostic = findErrorDiagnostic(diagnostics);
	return expectEqual(
		"LSP reports the uncalled entry point error at the main declaration",
		[
			countErrorDiagnostics(diagnostics),
			errorDiagnostic?.code,
			errorDiagnostic?.message,
			errorDiagnostic
				? `${errorDiagnostic.range.start.line + 1}:${errorDiagnostic.range.start.character + 1}`
				: "none",
		].join("|"),
		[
			1,
			ERROR_CODE.entryPointNotCalled,
			EXPECTED_ENTRY_POINT_NOT_CALLED_MESSAGE,
			"2:7",
		].join("|"),
	);
};

const checkExactlyOneVisibleErrorPerFile = () => {
	const sources = [
		TYPE_MISMATCH_SOURCE,
		SETUP_ONLY_SOURCE,
		EMPTY_SOURCE,
		LOCAL_ERROR_LINE_FIVE_SOURCE,
		TWO_UNUSED_CONSTANTS_SOURCE,
	];
	const errorCounts = sources.map((source) => {
		return countErrorDiagnostics(computeEntryDiagnostics(source));
	});
	return expectEqual(
		"LSP shows exactly one visible error per file",
		errorCounts.join("|"),
		sources.map(() => 1).join("|"),
	);
};

const checkWarningsAreAllEmitted = () => {
	const diagnostics = computeEntryDiagnostics(TWO_UNUSED_CONSTANTS_SOURCE);
	const warningCodes = diagnostics
		.filter((diagnostic) => {
			return diagnostic.severity === LSP_SEVERITY.warning;
		})
		.map((diagnostic) => {
			return diagnostic.code;
		});
	return expectEqual(
		"LSP keeps emitting every warning while showing one error",
		[
			countWarningDiagnostics(diagnostics),
			warningCodes.join(","),
			countErrorDiagnostics(diagnostics),
		].join("|"),
		[2, `${ERROR_CODE.unusedConstant},${ERROR_CODE.unusedConstant}`, 1].join(
			"|",
		),
	);
};

const checkShadowedUnusedLocalLspDiagnostic = () => {
	const diagnostics = computeEntryDiagnostics(SHADOWED_UNUSED_LOCAL_SOURCE);
	const unusedConstants = diagnostics.filter((diagnostic) => {
		return diagnostic.code === ERROR_CODE.unusedConstant;
	});
	const otherDeclarationLine = 3;
	const mainDeclarationLine = 8;
	const otherDeclarationShown = unusedConstants.some((diagnostic) => {
		return diagnostic.range.start.line === otherDeclarationLine;
	});
	const mainDeclarationShown = unusedConstants.some((diagnostic) => {
		return diagnostic.range.start.line === mainDeclarationLine;
	});
	return expectEqual(
		"LSP keeps the unused warning for a local shadowed by a used homonym",
		[unusedConstants.length, otherDeclarationShown, mainDeclarationShown].join(
			"|",
		),
		"2|true|false",
	);
};

const checkUnusedParameterLspDiagnostic = () => {
	const diagnostics = computeEntryDiagnostics(UNUSED_PARAMETER_SOURCE);
	const unusedParameters = diagnostics.filter((diagnostic) => {
		return diagnostic.code === ERROR_CODE.unusedParameter;
	});
	const [diagnostic] = unusedParameters;
	return expectEqual(
		"LSP shows the unused parameter warning at the parameter range",
		[
			unusedParameters.length,
			diagnostic?.severity,
			diagnostic?.range.start.line,
			diagnostic?.range.start.character,
		].join("|"),
		[1, LSP_SEVERITY.warning, 1, 11].join("|"),
	);
};

export const runLspDiagnosticsChecks = async () => {
	return [
		checkMissingImportBraceReportsSingleError(),
		await checkMissingImportBraceLspDiagnostic(),
		checkMissingImportBraceKeepsTrailingStatement(),
		await checkMissingImportBraceTrailingStatementLspDiagnostic(),
		checkMissingIfParenthesisReportsSingleError(),
		await checkMissingIfParenthesisLspDiagnostic(),
		checkNestedMissingIfParenthesis(),
		checkParserAlwaysReturnsTraversableAst(),
		checkValidSourceStillParses(),
		checkLocalTypeErrorHasPriorityOverMissingSetup(),
		checkUnknownMemberLspDiagnostic(),
		checkInferredUnknownMemberLspDiagnostic(),
		checkAsyncTaskMemberAccessLspDiagnostic(),
		checkAsyncTaskArgumentLspDiagnostic(),
		checkUnconvertibleInterpolationLspDiagnostic(),
		checkCompoundLiteralInterpolationLspDiagnostic(),
		checkConvertibleInterpolationLspDiagnostics(),
		checkDanglingMemberParserErrorKeepsNextStatement(),
		await checkDanglingMemberLspDiagnostic(),
		checkMissingRequiredFunctionStillShownWithoutLocalErrors(),
		checkLocalErrorOnLineFiveHasPriorityOverMissingMain(),
		checkEarliestLocalErrorByLineIsVisible(),
		checkEarliestLocalErrorByColumnIsVisible(),
		checkLocalErrorHasPriorityOverMissingSetupCall(),
		checkMissingSetupCallShownWithoutLocalErrors(),
		checkEntryPointNotCalledLspDiagnostic(),
		checkExactlyOneVisibleErrorPerFile(),
		checkWarningsAreAllEmitted(),
		checkShadowedUnusedLocalLspDiagnostic(),
		checkUnusedParameterLspDiagnostic(),
	];
};

const reportResults = (results) => {
	for (const result of results) {
		const status = result.status === SNAPSHOT_STATUS.match ? "PASS" : "FAIL";
		process.stdout.write(`${status} ${result.label}\n`);
		if (result.status !== SNAPSHOT_STATUS.match) {
			process.stderr.write(
				`  expected ${JSON.stringify(result.expected)}\n  actual   ${JSON.stringify(result.actual)}\n`,
			);
		}
	}
	return results.filter((result) => {
		return result.status !== SNAPSHOT_STATUS.match;
	}).length;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const results = await runLspDiagnosticsChecks();
	process.exit(reportResults(results) > 0 ? 1 : 0);
}
