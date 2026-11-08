// Editor-facing checks for strict equality rejection. Diagnostics come from
// `computeDiagnostics`, the same pipeline the language server runs, so the
// message, severity and range match what the editor shows. `===` and `!==` are
// not part of e95: the parser reports them instead of dropping the rest of the
// expression.
import { pathToFileURL } from "node:url";
import { ERROR_CODE, formatDiagnosticMessage } from "embedito95-core";
import { computeDiagnostics } from "../lsp/src/diagnostics.js";
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

const PROGRAM_TAIL = [
	"const setup = () => {}",
	"const main = () => { setup() }",
	"main()",
];

const STRICT_EQUAL_SOURCE = [
	"const a = 1",
	"const b = 2",
	"const c = a === b",
	...PROGRAM_TAIL,
].join("\n");

const STRICT_NOT_EQUAL_SOURCE = [
	"const a = 1",
	"const b = 2",
	"const c = a !== b",
	...PROGRAM_TAIL,
].join("\n");

const NESTED_SOURCE = [
	"const a = 1",
	"const b = 2",
	"const check = (): boolean => {",
	"    if (a == b) {",
	"        if (a !== b) {",
	"            return true",
	"        }",
	"    }",
	"    return false",
	"}",
	...PROGRAM_TAIL,
].join("\n");

const SAFE_SOURCE = [
	"const a = 1",
	"const b = 2",
	"const c = a == b",
	"const d = a != b",
	"const text = 'a === b'",
	'const other = "a !== b"',
	"// a === b",
	"/* a !== b */",
	...PROGRAM_TAIL,
].join("\n");

const findDiagnostic = (diagnostics, code) => {
	return diagnostics.find((diagnostic) => {
		return diagnostic.code === code;
	});
};

const renderDiagnostic = (diagnostic) => {
	const start = diagnostic.range.start;
	const severity = LSP_SEVERITY_NAMES[diagnostic.severity] ?? "unknown";
	return `${start.line + 1}:${start.character + 1} ${severity} ${diagnostic.code} ${diagnostic.message}`;
};

const renderStrictEqualityDiagnostic = (diagnostic) => {
	return diagnostic ? renderDiagnostic(diagnostic) : "none";
};

const renderExpected = ({ line, column, operator, suggested }) => {
	return `${line}:${column} ${ERROR_SEVERITY_LABEL} ${ERROR_CODE.strictEquality} ${formatDiagnosticMessage(
		{
			code: ERROR_CODE.strictEquality,
			params: { operator, suggested },
		},
	)}`;
};

const computeUserDiagnostics = async (source) => {
	return computeDiagnostics(source, null, {}, false, true);
};

const checkStrictEqualDiagnostic = async () => {
	const diagnostics = await computeUserDiagnostics(STRICT_EQUAL_SOURCE);
	const diagnostic = findDiagnostic(diagnostics, ERROR_CODE.strictEquality);
	return expectEqual(
		"LSP reports '===' at the operator position",
		renderStrictEqualityDiagnostic(diagnostic),
		renderExpected({
			line: 3,
			column: 13,
			operator: "===",
			suggested: "==",
		}),
	);
};

const checkStrictNotEqualDiagnostic = async () => {
	const diagnostics = await computeUserDiagnostics(STRICT_NOT_EQUAL_SOURCE);
	const diagnostic = findDiagnostic(diagnostics, ERROR_CODE.strictEquality);
	return expectEqual(
		"LSP reports '!==' at the operator position",
		renderStrictEqualityDiagnostic(diagnostic),
		renderExpected({
			line: 3,
			column: 13,
			operator: "!==",
			suggested: "!=",
		}),
	);
};

const checkNestedStrictNotEqualDiagnostic = async () => {
	const diagnostics = await computeUserDiagnostics(NESTED_SOURCE);
	const diagnostic = findDiagnostic(diagnostics, ERROR_CODE.strictEquality);
	return expectEqual(
		"LSP reports '!==' nested in an if inside an if",
		renderStrictEqualityDiagnostic(diagnostic),
		renderExpected({
			line: 5,
			column: 15,
			operator: "!==",
			suggested: "!=",
		}),
	);
};

const checkStrictEqualityAbsentInSafeSource = async () => {
	const diagnostics = await computeUserDiagnostics(SAFE_SOURCE);
	const diagnostic = findDiagnostic(diagnostics, ERROR_CODE.strictEquality);
	return expectEqual(
		"LSP has no strict equality diagnostic for ==, !=, strings or comments",
		renderStrictEqualityDiagnostic(diagnostic),
		"none",
	);
};

export const runLspStrictEqualityChecks = async () => {
	return [
		await checkStrictEqualDiagnostic(),
		await checkStrictNotEqualDiagnostic(),
		await checkNestedStrictNotEqualDiagnostic(),
		await checkStrictEqualityAbsentInSafeSource(),
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
	const results = await runLspStrictEqualityChecks();
	process.exit(reportResults(results) > 0 ? 1 : 0);
}
