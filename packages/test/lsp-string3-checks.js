// LSP checks for the String numeric conversion and buffer-copy surface
// (TICKET-51): hover, completions and diagnostics for parseInteger,
// parseFloat32, parseFloat64, toByteArray, toCharacterArray and
// reserveCapacity. The checks consume the same STRING_METHODS table and the
// same check() the language server runs, so the editor output cannot drift
// from the codegen.
import { fileURLToPath } from "node:url";
import {
	check,
	formatDiagnosticMessage,
	parse,
	tokenize,
} from "embedito95-core";
import { onCompletion } from "../lsp/src/server/completions/index.js";
import { onHover } from "../lsp/src/server/hover/index.js";
import { SNAPSHOT_STATUS } from "./constants.js";
import { expectEqual, reportUnitChecks } from "./reporting.js";

const CHECKS_GROUP_NAME = "lsp-string3-checks";
const DOCUMENT_URI = "file:///tmp/embedito95-lsp-string3/main.e95";

const STRING3_SOURCE = [
	'const text: string = "42.5"',
	"text.parseInteger()",
	"text.parseFloat32()",
	"text.parseFloat64()",
	"text.toByteArray()",
	"text.toCharacterArray()",
	"text.reserveCapacity(64)",
].join("\n");

const STRING3_COMPLETION_SOURCE = [
	'const text: string = "Hello"',
	"text.",
].join("\n");

const STRING3_COMPLETION_LABELS =
	"length,push,pop,getCharacter,getSlice,findTextFrom,findLastTextFrom,hasPrefix,hasSuffix,matchesText,matchesTextIgnoringCase,setCharacter,appendText,replaceText,removeRange,trimWhitespace,toUpperCase,toLowerCase,parseInteger,parseFloat32,parseFloat64,toByteArray,toCharacterArray,reserveCapacity";

const STRING3_HOVER_CASES = [
	{
		description: "parseInteger returns a saturated i32",
		marker: "text.parseInteger(",
		expected: "```e95\nparseInteger: () => i32\n```",
	},
	{
		description: "parseFloat32 returns an f32",
		marker: "text.parseFloat32(",
		expected: "```e95\nparseFloat32: () => f32\n```",
	},
	{
		description: "parseFloat64 returns an f64",
		marker: "text.parseFloat64(",
		expected: "```e95\nparseFloat64: () => f64\n```",
	},
	{
		description: "toByteArray returns a u8 array without a terminator",
		marker: "text.toByteArray(",
		expected: "```e95\ntoByteArray: () => u8[]\n```",
	},
	{
		description: "toCharacterArray returns a char array with a terminator",
		marker: "text.toCharacterArray(",
		expected: "```e95\ntoCharacterArray: () => char[]\n```",
	},
	{
		description: "reserveCapacity takes a u16 minimum capacity",
		marker: "text.reserveCapacity(",
		expected: "```e95\nreserveCapacity: (minimumCapacity: u16) => void\n```",
	},
];

const STRING3_ARITY_DIAGNOSTIC_SOURCE = [
	"const convert = (text: string, flag: boolean): i32 => {",
	"    if (flag) {",
	"        if (text.length() > 0) {",
	"            text.reserveCapacity()",
	"            return text.parseInteger(1)",
	"        }",
	"    }",
	"    return 0",
	"}",
	'const source: string = "42"',
	"export const nested = convert(source, true)",
].join("\n");

const STRING3_TYPE_DIAGNOSTIC_SOURCE = [
	'const text: string = "Hello"',
	'export const badCapacity = text.reserveCapacity("large")',
].join("\n");

const STRING3_NESTED_NO_FALSE_POSITIVE_SOURCE = [
	"const convert = (text: string, flag: boolean): i32 => {",
	"    if (flag) {",
	"        if (text.length() > 0) {",
	"            const bytes = text.toByteArray()",
	"            const characters = text.toCharacterArray()",
	"            text.reserveCapacity(8)",
	"            return text.parseInteger() + bytes.length() + characters.length()",
	"        }",
	"    }",
	"    return 0",
	"}",
	'const source: string = "42"',
	"export const nested = convert(source, true)",
].join("\n");

const findPosition = (source, marker, offset = 0) => {
	const index = source.indexOf(marker);
	const point = index + offset;
	const before = source.slice(0, point);
	const lines = before.split("\n");
	return {
		line: lines.length - 1,
		character: lines[lines.length - 1].length,
	};
};

const hoverInDocument = async (source, position) => {
	const documents = new Map([
		[DOCUMENT_URI, { uri: DOCUMENT_URI, getText: () => source }],
	]);
	const hover = await onHover(
		{
			textDocument: { uri: DOCUMENT_URI },
			position,
		},
		documents,
	);
	return hover?.contents?.value ?? null;
};

const completeAt = async (source, position) => {
	const documents = new Map([
		[DOCUMENT_URI, { uri: DOCUMENT_URI, getText: () => source }],
	]);
	const items = await onCompletion(
		{
			textDocument: { uri: DOCUMENT_URI },
			position,
		},
		documents,
	);
	return items.map((item) => item.label).join(",");
};

const parseDiagnostics = (source) => {
	const { tokens } = tokenize(source);
	const { ast, comments } = parse(tokens, source);
	const { errors } = check(ast, { isLibrary: true, comments });
	return errors.map((error) => {
		const start = error.location?.start;
		const position = start ? `${start.line}:${start.column}` : "?";
		return `${position} ${error.code} ${formatDiagnosticMessage(error)}`;
	});
};

const checkString3MethodHover = async (testCase) => {
	const position = findPosition(
		STRING3_SOURCE,
		testCase.marker,
		"text.".length,
	);
	const hover = await hoverInDocument(STRING3_SOURCE, position);
	return expectEqual(
		`LSP hover of a string conversion method shows its signature (${testCase.description})`,
		hover,
		testCase.expected,
	);
};

const checkString3MethodHovers = () => {
	return Promise.all(STRING3_HOVER_CASES.map(checkString3MethodHover));
};

const checkString3Completions = async () => {
	const labels = await completeAt(STRING3_COMPLETION_SOURCE, {
		line: 1,
		character: "text.".length,
	});
	return expectEqual(
		"LSP completions on a string receiver include the conversion surface",
		labels,
		STRING3_COMPLETION_LABELS,
	);
};

const checkString3NestedArityDiagnostics = () => {
	const diagnostics = parseDiagnostics(STRING3_ARITY_DIAGNOSTIC_SOURCE);
	return expectEqual(
		"LSP reports conversion arity errors inside nested if blocks",
		diagnostics.join("\n"),
		"4:13 error.wrongArgumentCount 'text.reserveCapacity' expects 1 argument(s) but got 0\n5:20 error.wrongArgumentCount 'text.parseInteger' expects 0 argument(s) but got 1",
	);
};

const checkString3ArgumentTypeDiagnostics = () => {
	const diagnostics = parseDiagnostics(STRING3_TYPE_DIAGNOSTIC_SOURCE);
	return expectEqual(
		"LSP reports a conversion argument type mismatch",
		diagnostics.join("\n"),
		"2:49 error.argumentTypeMismatch Argument 'minimumCapacity' expects type 'u16' but 'large' is 'string'",
	);
};

const checkString3NestedNoFalsePositives = () => {
	const diagnostics = parseDiagnostics(STRING3_NESTED_NO_FALSE_POSITIVE_SOURCE);
	return expectEqual(
		"LSP reports no diagnostics for valid conversion calls inside nested if blocks",
		diagnostics.join("\n"),
		"",
	);
};

export const runLspString3Checks = async () => {
	return [
		...(await checkString3MethodHovers()),
		await checkString3Completions(),
		checkString3NestedArityDiagnostics(),
		checkString3ArgumentTypeDiagnostics(),
		checkString3NestedNoFalsePositives(),
	];
};

const reportDirectRun = async () => {
	const results = await runLspString3Checks();
	reportUnitChecks(CHECKS_GROUP_NAME, results);
	const hasMismatch = results.some((result) => {
		return result.status === SNAPSHOT_STATUS.mismatch;
	});
	if (hasMismatch) {
		process.exitCode = 1;
	}
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
	await reportDirectRun();
}
