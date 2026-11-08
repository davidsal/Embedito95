// LSP checks for the String mutation surface (TICKET-50): hover, completions
// and diagnostics for setCharacter, appendText, replaceText, removeRange,
// trimWhitespace, toUpperCase and toLowerCase. The checks consume the same
// STRING_METHODS table and the same check() the language server runs, so the
// editor output cannot drift from the codegen.
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

const CHECKS_GROUP_NAME = "lsp-string2-checks";
const DOCUMENT_URI = "file:///tmp/embedito95-lsp-string2/main.e95";

const STRING2_SOURCE = [
	'const text: string = "  Hello, world  "',
	"text.setCharacter(0, 'x')",
	'text.appendText("!")',
	'text.replaceText("l", "L")',
	"text.removeRange(0, 1)",
	"text.trimWhitespace()",
	"text.toUpperCase()",
	"text.toLowerCase()",
].join("\n");

const STRING2_COMPLETION_SOURCE = [
	'const text: string = "Hello"',
	"text.",
].join("\n");

const STRING2_COMPLETION_LABELS =
	"length,push,pop,getCharacter,getSlice,findTextFrom,findLastTextFrom,hasPrefix,hasSuffix,matchesText,matchesTextIgnoringCase,setCharacter,appendText,replaceText,removeRange,trimWhitespace,toUpperCase,toLowerCase,parseInteger,parseFloat32,parseFloat64,toByteArray,toCharacterArray,reserveCapacity";

const STRING2_HOVER_CASES = [
	{
		description: "setCharacter writes a char at a u16 index",
		marker: "text.setCharacter(",
		expected: "```e95\nsetCharacter: (index: u16, value: char) => void\n```",
	},
	{
		description: "appendText appends another string",
		marker: "text.appendText(",
		expected: "```e95\nappendText: (other: string) => void\n```",
	},
	{
		description: "replaceText returns boolean from two strings",
		marker: "text.replaceText(",
		expected:
			"```e95\nreplaceText: (search: string, replacement: string) => boolean\n```",
	},
	{
		description: "removeRange trims a u16 half-open range",
		marker: "text.removeRange(",
		expected: "```e95\nremoveRange: (start: u16, end: u16) => void\n```",
	},
	{
		description: "trimWhitespace takes no arguments",
		marker: "text.trimWhitespace(",
		expected: "```e95\ntrimWhitespace: () => void\n```",
	},
	{
		description: "toUpperCase takes no arguments",
		marker: "text.toUpperCase(",
		expected: "```e95\ntoUpperCase: () => void\n```",
	},
	{
		description: "toLowerCase takes no arguments",
		marker: "text.toLowerCase(",
		expected: "```e95\ntoLowerCase: () => void\n```",
	},
];

const STRING2_ARITY_DIAGNOSTIC_SOURCE = [
	"const mutate = (text: string, flag: boolean): boolean => {",
	"    if (flag) {",
	'        if (text.hasPrefix("He")) {',
	"            text.setCharacter(1, 'a')",
	'            return text.replaceText("l")',
	"        }",
	"    }",
	"    return false",
	"}",
	'export const nested = mutate("Hello", true)',
].join("\n");

const STRING2_TYPE_DIAGNOSTIC_SOURCE = [
	'const text: string = "Hello"',
	'export const badReplacement = text.replaceText("l", 1)',
].join("\n");

const STRING2_NESTED_NO_FALSE_POSITIVE_SOURCE = [
	"const mutate = (text: string, flag: boolean): boolean => {",
	"    if (flag) {",
	'        if (text.hasPrefix("He")) {',
	"            text.setCharacter(1, 'a')",
	'            text.appendText("!")',
	"            text.removeRange(0, 1)",
	"            text.trimWhitespace()",
	"            text.toUpperCase()",
	"            text.toLowerCase()",
	'            return text.replaceText("l", "L")',
	"        }",
	"    }",
	"    return false",
	"}",
	'export const nested = mutate("Hello", true)',
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

const checkString2MethodHover = async (testCase) => {
	const position = findPosition(
		STRING2_SOURCE,
		testCase.marker,
		"text.".length,
	);
	const hover = await hoverInDocument(STRING2_SOURCE, position);
	return expectEqual(
		`LSP hover of a string mutator shows its signature (${testCase.description})`,
		hover,
		testCase.expected,
	);
};

const checkString2MethodHovers = () => {
	return Promise.all(STRING2_HOVER_CASES.map(checkString2MethodHover));
};

const checkString2Completions = async () => {
	const labels = await completeAt(STRING2_COMPLETION_SOURCE, {
		line: 1,
		character: "text.".length,
	});
	return expectEqual(
		"LSP completions on a string receiver include the mutation surface",
		labels,
		STRING2_COMPLETION_LABELS,
	);
};

const checkString2NestedArityDiagnostics = () => {
	const diagnostics = parseDiagnostics(STRING2_ARITY_DIAGNOSTIC_SOURCE);
	return expectEqual(
		"LSP reports a string mutator arity error inside nested if blocks",
		diagnostics.join("\n"),
		"5:20 error.wrongArgumentCount 'text.replaceText' expects 2 argument(s) but got 1",
	);
};

const checkString2ArgumentTypeDiagnostics = () => {
	const diagnostics = parseDiagnostics(STRING2_TYPE_DIAGNOSTIC_SOURCE);
	return expectEqual(
		"LSP reports a string mutator argument type mismatch",
		diagnostics.join("\n"),
		"2:53 error.argumentTypeMismatch Argument 'replacement' expects type 'string' but literal 1 is 'u8'",
	);
};

const checkString2NestedNoFalsePositives = () => {
	const diagnostics = parseDiagnostics(STRING2_NESTED_NO_FALSE_POSITIVE_SOURCE);
	return expectEqual(
		"LSP reports no diagnostics for valid string mutators inside nested if blocks",
		diagnostics.join("\n"),
		"",
	);
};

export const runLspString2Checks = async () => {
	return [
		...(await checkString2MethodHovers()),
		await checkString2Completions(),
		checkString2NestedArityDiagnostics(),
		checkString2ArgumentTypeDiagnostics(),
		checkString2NestedNoFalsePositives(),
	];
};

const reportDirectRun = async () => {
	const results = await runLspString2Checks();
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
