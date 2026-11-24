// Empty template-literal interpolations must be rejected by the parser and
// preserved verbatim by the formatter. Before this check, `${}` parsed without
// errors and the formatter silently dropped the following quasis.
import {
	ERROR_CODE,
	format,
	formatDiagnosticMessage,
	parse,
	tokenize,
} from "embedito95-core";
import { computeDiagnostics } from "../lsp/src/diagnostics.js";
import { expectEqual } from "./reporting.js";

const LSP_ERROR_SEVERITY = 1;
const LSP_WARNING_SEVERITY = 2;
const LSP_HINT_SEVERITY = 4;

const EMPTY_INTERPOLATION_CASES = [
	{
		source: "const a = `${}`",
		startColumn: 12,
		endColumn: 15,
	},
	{
		source: "const a = `${ }`",
		startColumn: 12,
		endColumn: 16,
	},
	{
		source: "const a = `${} texto`",
		startColumn: 12,
		endColumn: 15,
	},
	{
		source: "const a = `texto ${} fin`",
		startColumn: 18,
		endColumn: 21,
	},
];

const VALID_TEMPLATE_SOURCES = [
	"const a = `${nombre}`",
	"const a = `hola mundo`",
	"const a = `texto ${persona.name} fin`",
];

const formatSource = (source) => {
	const { tokens } = tokenize(source);
	const { ast, errors, comments } = parse(tokens);
	return {
		formatted: format(ast, comments, source),
		errors,
		comments,
	};
};

const parseSource = (source) => {
	const { tokens } = tokenize(source);
	return parse(tokens);
};

const describeError = (error) => {
	return [
		error?.code,
		error ? formatDiagnosticMessage(error) : "none",
		`${error?.location?.start?.line}:${error?.location?.start?.column}`,
		`${error?.location?.end?.line}:${error?.location?.end?.column}`,
	].join("|");
};

const buildParserResults = () => {
	return EMPTY_INTERPOLATION_CASES.map((testCase) => {
		const { errors } = parseSource(testCase.source);
		const unexpectedTokens = errors.filter((error) => {
			return error.code === ERROR_CODE.unexpectedToken;
		});
		const expectedError = [
			ERROR_CODE.unexpectedToken,
			formatDiagnosticMessage({
				code: ERROR_CODE.unexpectedToken,
				params: { expected: "expression", found: "'}'" },
			}),
			`1:${testCase.startColumn}`,
			`1:${testCase.endColumn}`,
		].join("|");
		return expectEqual(
			`empty interpolation is reported at the hole: ${testCase.source}`,
			describeError(unexpectedTokens[0]),
			expectedError,
		);
	});
};

const buildFormatterPreservationResults = () => {
	return EMPTY_INTERPOLATION_CASES.map((testCase) => {
		const { formatted } = formatSource(testCase.source);
		return expectEqual(
			`formatter preserves an invalid template verbatim: ${testCase.source}`,
			formatted.trimEnd(),
			testCase.source,
		);
	});
};

const buildValidTemplateResults = () => {
	return VALID_TEMPLATE_SOURCES.map((source) => {
		const { formatted, errors } = formatSource(source);
		const reformatted = formatSource(formatted).formatted;
		return expectEqual(
			`formatter keeps a valid template and stays idempotent: ${source}`,
			[errors.length, formatted.trimEnd(), reformatted].join("|"),
			[0, source, formatted].join("|"),
		);
	});
};

const findErrorDiagnostic = (diagnostics) => {
	return diagnostics.find((diagnostic) => {
		return diagnostic.severity === LSP_ERROR_SEVERITY;
	});
};

const buildLspDiagnosticResults = () => {
	const source = "const a = `texto ${} fin`";
	const diagnostics = computeDiagnostics(source, null, {}, false, true);
	const error = findErrorDiagnostic(diagnostics);
	const message = formatDiagnosticMessage({
		code: ERROR_CODE.unexpectedToken,
		params: { expected: "expression", found: "'}'" },
	});
	return [
		expectEqual(
			"LSP reports the empty interpolation with the expected message and position",
			[
				error?.code,
				error?.message,
				`${error?.range?.start?.line}:${error?.range?.start?.character}`,
				`${error?.range?.end?.line}:${error?.range?.end?.character}`,
			].join("|"),
			[ERROR_CODE.unexpectedToken, message, `0:${17}`, `0:${20}`].join("|"),
		),
		expectEqual(
			"LSP does not emit warnings or hints for the empty interpolation",
			diagnostics.filter((diagnostic) => {
				return (
					diagnostic.severity === LSP_WARNING_SEVERITY ||
					diagnostic.severity === LSP_HINT_SEVERITY
				);
			}).length,
			0,
		),
	];
};

export const runTemplateLiteralChecks = () => {
	return [
		...buildParserResults(),
		...buildFormatterPreservationResults(),
		...buildValidTemplateResults(),
		...buildLspDiagnosticResults(),
	];
};
