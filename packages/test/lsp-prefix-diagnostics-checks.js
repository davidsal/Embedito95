// Parser diagnostic ranges for truncated prefixes. Every prefix of a valid
// statement (cut character by character, with and without a trailing newline)
// must keep a non-empty, in-bounds range, and the LSP must surface the same
// single root-cause diagnostic the parser reports (TICKET-82/83 behavior).
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	ERROR_CODE,
	formatDiagnosticMessage,
	parse,
	tokenize,
} from "embedito95-core";
import { computeDiagnostics } from "../lsp/src/diagnostics.js";
import { SNAPSHOT_STATUS } from "./constants.js";
import { expectEqual } from "./reporting.js";
import { processSnapshotFile } from "./snapshot-comparison.js";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CORPUS_SNAPSHOT_PATH = join(
	MODULE_DIRECTORY,
	"snapshots/parser-prefix-diagnostics.txt",
);
const VISIBLE_ERROR_SEVERITY = 1;
const NEWLINE_SUFFIXES = ["", "\n"];
const EMPTY_LINE = "";
const NONE_LABEL = "none";
const MISSING_LINE_LENGTH = -1;
const PREFIX_DIAGNOSTIC_KIND = {
	lex: "lex",
	parse: "parse",
	none: "none",
};
const PREFIX_SOURCES = [
	"if (1) {}",
	"import { X } from 'm'",
	"const f = () => {}",
	"if (1\nfoo()\n",
	"const f = (a\nfoo()\n",
];

const EXPECTED_EOF_MESSAGE = formatDiagnosticMessage({
	code: ERROR_CODE.unexpectedEof,
	params: {},
});

const TABLE_CASES = [
	{
		source: "if () {}",
		expectedCode: ERROR_CODE.unexpectedToken,
		expectedRange: "1:4-1:5",
	},
	{
		source: "import {}",
		expectedCode: ERROR_CODE.emptyImport,
		expectedRange: "1:8-1:9",
	},
	{
		source: "import { X } from ''",
		expectedCode: ERROR_CODE.emptyImportSource,
		expectedRange: "1:18-1:20",
	},
	{
		source: "import { X",
		expectedCode: ERROR_CODE.unexpectedEof,
		expectedRange: "1:7-1:10",
	},
	{
		source: "const f = () => {",
		expectedCode: ERROR_CODE.unexpectedEof,
		expectedRange: "1:16-1:17",
	},
	{
		source: "if (1) {\n\n",
		expectedCode: ERROR_CODE.unexpectedEof,
		expectedRange: "1:7-1:8",
	},
	{
		source: "const f = () => {\n\n\n",
		expectedCode: ERROR_CODE.unexpectedEof,
		expectedRange: "1:16-1:17",
	},
	{
		source: "import { X\n",
		expectedCode: ERROR_CODE.unexpectedEof,
		expectedRange: "1:7-1:10",
	},
	{
		source: "if (1\nfoo()\n",
		expectedCode: ERROR_CODE.unexpectedToken,
		expectedRange: "1:3-1:5",
	},
	{
		source: "if (1 {})",
		expectedCode: ERROR_CODE.unexpectedToken,
		expectedRange: "1:6-1:7",
	},
	{
		source: "const f = (a\nfoo()\n",
		expectedCode: ERROR_CODE.unexpectedToken,
		expectedRange: "1:10-1:12",
	},
];

const getVisibleError = (diagnostics) => {
	return diagnostics.find((diagnostic) => {
		return diagnostic.severity === VISIBLE_ERROR_SEVERITY;
	});
};

const renderLspRange = (diagnostic) => {
	const start = diagnostic.range.start;
	const end = diagnostic.range.end;
	return `${start.line + 1}:${start.character}-${end.line + 1}:${end.character}`;
};

const renderParserRange = (point) => {
	return `${point.line - 1}:${point.column - 1}`;
};

const renderParserDiagnostic = (diagnostic) => {
	const start = renderParserRange(diagnostic.location.start);
	const end = renderParserRange(diagnostic.location.end);
	return `${start}->${end} ${diagnostic.code} ${formatDiagnosticMessage(diagnostic)}`;
};

const readPrefixDiagnostics = (source) => {
	const { tokens, errors: lexErrors } = tokenize(source);
	if (lexErrors.length > 0) {
		return { kind: PREFIX_DIAGNOSTIC_KIND.lex, diagnostics: lexErrors };
	}
	const { errors: parseErrors } = parse(tokens);
	if (parseErrors.length > 0) {
		return { kind: PREFIX_DIAGNOSTIC_KIND.parse, diagnostics: parseErrors };
	}
	return { kind: PREFIX_DIAGNOSTIC_KIND.none, diagnostics: [] };
};

const buildPrefixCases = () => {
	const cases = [];
	for (
		let sourceIndex = 0;
		sourceIndex < PREFIX_SOURCES.length;
		sourceIndex++
	) {
		const prefixSource = PREFIX_SOURCES[sourceIndex];
		for (let length = 0; length <= prefixSource.length; length++) {
			for (const suffix of NEWLINE_SUFFIXES) {
				cases.push({
					label: `${sourceIndex}/${length}/${suffix === EMPTY_LINE ? "plain" : "newline"}`,
					source: `${prefixSource.slice(0, length)}${suffix}`,
				});
			}
		}
	}
	return cases;
};

const renderPrefixCase = ({ label, source }) => {
	const { kind, diagnostics } = readPrefixDiagnostics(source);
	const renderedDiagnostics =
		diagnostics.length > 0
			? diagnostics.map(renderParserDiagnostic).join(" ; ")
			: NONE_LABEL;
	return `${label} ${JSON.stringify(source)} [${kind}] => ${renderedDiagnostics}`;
};

const buildCorpusContent = () => {
	const header = [
		"// Parser diagnostics for every prefix of the reference statements.",
		"// Each line is: <source>/<length>/<suffix> <source-json> [<kind>] => <diagnostics>.",
		"// The range is rendered as 0-based line:character (LSP convention).",
		"",
	];
	const cases = buildPrefixCases().map(renderPrefixCase);
	return `${header.join("\n")}${cases.join("\n")}\n`;
};

const renderTableDiagnostic = (diagnostic) => {
	const eofMessage =
		diagnostic.code === ERROR_CODE.unexpectedEof
			? ` ${diagnostic.message}`
			: EMPTY_LINE;
	return `${diagnostic.code} ${renderLspRange(diagnostic)}${eofMessage}`;
};

const checkTableCases = async () => {
	const actual = [];
	for (const { source } of TABLE_CASES) {
		const diagnostic = getVisibleError(
			await computeDiagnostics(source, null, {}, false, true),
		);
		actual.push(diagnostic ? renderTableDiagnostic(diagnostic) : NONE_LABEL);
	}
	const expected = TABLE_CASES.map(({ expectedCode, expectedRange }) => {
		const eofMessage =
			expectedCode === ERROR_CODE.unexpectedEof
				? ` ${EXPECTED_EOF_MESSAGE}`
				: EMPTY_LINE;
		return `${expectedCode} ${expectedRange}${eofMessage}`;
	});
	return expectEqual(
		"parser diagnostics cover the reference ranges",
		actual.join("|"),
		expected.join("|"),
	);
};

const toLspShape = (diagnostic) => {
	return {
		code: diagnostic.code,
		message: formatDiagnosticMessage(diagnostic),
		severity: VISIBLE_ERROR_SEVERITY,
		range: {
			start: {
				line: diagnostic.location.start.line - 1,
				character: diagnostic.location.start.column - 1,
			},
			end: {
				line: diagnostic.location.end.line - 1,
				character: diagnostic.location.end.column - 1,
			},
		},
	};
};

const getLineLength = (source, line) => {
	const lines = source.split("\n");
	return lines[line] === undefined ? MISSING_LINE_LENGTH : lines[line].length;
};

const isFinalEmptyLine = (sourceLines, line) => {
	return (
		sourceLines.length > 1 &&
		sourceLines[sourceLines.length - 1] === EMPTY_LINE &&
		line === sourceLines.length - 1
	);
};

const collectRangeViolations = ({ label, source }, diagnostic) => {
	const violations = [];
	const { start, end } = diagnostic.location;
	const sourceLines = source.split("\n");

	if (start.line !== end.line) {
		violations.push(`${label}: crosses lines ${start.line}->${end.line}`);
	}
	if (end.column <= start.column) {
		violations.push(`${label}: width ${end.column - start.column}`);
	}
	if (start.line < 1 || start.line > sourceLines.length) {
		violations.push(`${label}: start line out of bounds ${start.line}`);
	}
	if (end.line < 1 || end.line > sourceLines.length) {
		violations.push(`${label}: end line out of bounds ${end.line}`);
	}
	const endLineLength = getLineLength(source, end.line - 1);
	if (endLineLength !== MISSING_LINE_LENGTH && end.column - 1 > endLineLength) {
		violations.push(
			`${label}: end character ${end.column - 1} > line length ${endLineLength}`,
		);
	}
	if (
		isFinalEmptyLine(sourceLines, start.line - 1) ||
		isFinalEmptyLine(sourceLines, end.line - 1)
	) {
		violations.push(`${label}: anchored on final empty line`);
	}
	return violations;
};

const collectCorpusViolations = () => {
	const violations = [];
	for (const prefixCase of buildPrefixCases()) {
		const { kind, diagnostics } = readPrefixDiagnostics(prefixCase.source);
		if (kind === PREFIX_DIAGNOSTIC_KIND.none) {
			continue;
		}
		for (const diagnostic of diagnostics) {
			violations.push(...collectRangeViolations(prefixCase, diagnostic));
		}
	}
	return violations;
};

const checkCorpusInvariants = () => {
	return expectEqual(
		"every diagnostic in the prefix corpus has a real range",
		collectCorpusViolations().join("|"),
		EMPTY_LINE,
	);
};

const checkVisibleErrorMatchesParser = async () => {
	const mismatches = [];
	for (const prefixCase of buildPrefixCases()) {
		const { diagnostics } = readPrefixDiagnostics(prefixCase.source);
		if (diagnostics.length === 0) {
			continue;
		}
		const visibleError = getVisibleError(
			await computeDiagnostics(prefixCase.source, null, {}, false, true),
		);
		const expectedRange = toLspShape(diagnostics[0]);
		if (!visibleError) {
			mismatches.push(`${prefixCase.label}: no visible error`);
			continue;
		}
		if (
			visibleError.code !== expectedRange.code ||
			visibleError.message !== expectedRange.message ||
			renderLspRange(visibleError) !== renderLspRange(expectedRange)
		) {
			mismatches.push(
				`${prefixCase.label}: ${visibleError.code} ${renderLspRange(visibleError)} != ${expectedRange.code} ${renderLspRange(expectedRange)}`,
			);
		}
	}
	return expectEqual(
		"the LSP surfaces the parser's first diagnostic for every prefix",
		mismatches.join("|"),
		EMPTY_LINE,
	);
};

const checkCorpusSnapshot = () => {
	const status = processSnapshotFile(
		CORPUS_SNAPSHOT_PATH,
		buildCorpusContent(),
		false,
	);
	return {
		label: "parser prefix diagnostics snapshot",
		...status,
	};
};

export const runLspPrefixDiagnosticsChecks = async () => {
	return [
		await checkTableCases(),
		checkCorpusInvariants(),
		await checkVisibleErrorMatchesParser(),
		checkCorpusSnapshot(),
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
	const results = await runLspPrefixDiagnosticsChecks();
	process.exit(reportResults(results) > 0 ? 1 : 0);
}
