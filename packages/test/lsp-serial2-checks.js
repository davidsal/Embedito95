// Editor-facing checks for the second serial batch: hover signatures, member
// completions and diagnostics for text search, float parsing and the
// configurable read timeout. The document lives beside the registry serial
// source so hover/completion read the real `core/serial/main.e95` surface, and
// the diagnostics reuse the same library introspection `check()` receives in
// the editor.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { formatDiagnosticMessage } from "embedito95-core";
import { onCompletion } from "../lsp/src/server/completions/index.js";
import { onHover } from "../lsp/src/server/hover/index.js";
import { SNAPSHOT_STATUS } from "./constants.js";
import { expectEqual } from "./reporting.js";
import { REPOSITORY_ROOT } from "./runner-harness.js";
import {
	checkSource,
	readLibraryContext,
} from "./src/language/language-snapshot-harness.mjs";

const SERIAL_PACKAGE = "@embedito95/serial";
const SERIAL_LIBRARY_PATH = join(
	REPOSITORY_ROOT,
	"packages",
	"registry",
	"src",
	"core",
	"serial",
	"main.e95",
);
// The shipped interface list is a postinstall marker; the editor reads the
// installed project, so a sample member stands in for it just like the
// serial-library snapshot generator does.
const SERIAL_ENUM_MARKER = "// e95.postinstall.serialEnum";
const SERIAL_ENUM_SAMPLE_MEMBER = "1,";

const SERIAL_DOCUMENT_URI = pathToFileURL(SERIAL_LIBRARY_PATH).href;

const SERIAL_SOURCE = [
	"import { Serial, getSerial } from '@embedito95/serial'",
	"const serial = getSerial(Serial.1)",
	"export const text = serial.readText()",
	"export const untilSemicolon = serial.readTextUntil(';')",
	'export const found = serial.findText("needle")',
	"export const foundUntil = serial.findTextUntil(\"needle\", ';')",
	"export const real = serial.readFloat()",
	"serial.setReadTimeout(0)",
	"export const timeout = serial.getReadTimeout()",
].join("\n");

const SERIAL_COMPLETION_SOURCE = [
	"import { Serial, getSerial } from '@embedito95/serial'",
	"const serial = getSerial(Serial.1)",
	"serial.",
].join("\n");

const SERIAL_NESTED_DIAGNOSTIC_SOURCE = [
	"import { Serial, getSerial } from '@embedito95/serial'",
	"export const inspect = (flag: boolean): boolean => {",
	"    const serial = getSerial(Serial.1)",
	"    if (flag) {",
	'        if (serial.findText("needle")) {',
	"            serial.setReadTimeout(0)",
	"            const until = serial.readTextUntil(';')",
	"            serial.send(until)",
	"            return serial.findTextUntil(\"stop\", ';')",
	"        }",
	"    }",
	"    return false",
	"}",
].join("\n");

const SERIAL_READ_TEXT_UNTIL_ARITY_DIAGNOSTIC_SOURCE = [
	"import { Serial, getSerial } from '@embedito95/serial'",
	"const serial = getSerial(Serial.1)",
	"export const badCount = serial.readTextUntil()",
].join("\n");

const SERIAL_READ_TEXT_UNTIL_TYPE_DIAGNOSTIC_SOURCE = [
	"import { Serial, getSerial } from '@embedito95/serial'",
	"const serial = getSerial(Serial.1)",
	"export const badTerminator = () => {",
	'    serial.readTextUntil("newline")',
	"}",
].join("\n");

const SERIAL_ARITY_DIAGNOSTIC_SOURCE = [
	"import { Serial, getSerial } from '@embedito95/serial'",
	"const serial = getSerial(Serial.1)",
	"export const badCount = serial.findText()",
].join("\n");

const SERIAL_TYPE_DIAGNOSTIC_SOURCE = [
	"import { Serial, getSerial } from '@embedito95/serial'",
	"const serial = getSerial(Serial.1)",
	"export const badTerminator = () => {",
	'    serial.findTextUntil("needle", "newline")',
	"}",
].join("\n");

const SERIAL_TIMEOUT_TYPE_DIAGNOSTIC_SOURCE = [
	"import { Serial, getSerial } from '@embedito95/serial'",
	"const serial = getSerial(Serial.1)",
	"export const badTimeout = () => {",
	'    serial.setReadTimeout("fast")',
	"}",
].join("\n");

const SERIAL_METHOD_HOVER_CASES = [
	{
		description: "readText returns string",
		marker: "serial.readText",
		expected:
			"```e95\nreadText: () => string\n```\n\nReads text from the stream, appending every byte that arrives until the  \nreceive line stays quiet for the configured read timeout.  \n@returns The received text, empty when the timeout expires first",
	},
	{
		description: "readTextUntil returns string from a char terminator",
		marker: "serial.readTextUntil",
		expected:
			"```e95\nreadTextUntil: (terminator: char) => string\n```\n\nReads text from the stream, excluding the terminator. Collection stops  \nwhen the terminator arrives or when no data shows up before the timeout.  \n@param terminator - Byte that ends the collection  \n@returns The received text, empty when the timeout expires first",
	},
	{
		description: "findText returns boolean from a string needle",
		marker: "serial.findText(",
		expected:
			"```e95\nfindText: (needle: string) => boolean\n```\n\nConsumes bytes until the needle arrives, including its last byte.  \n@param needle - Text to search for in the incoming stream  \n@returns True when the needle was found, false when the timeout expires",
	},
	{
		description: "findTextUntil returns boolean from a needle and a char",
		marker: "serial.findTextUntil(",
		expected:
			"```e95\nfindTextUntil: (needle: string, terminator: char) => boolean\n```\n\nConsumes bytes until the needle arrives or the terminator shows up,  \nwhichever happens first. The needle bytes are consumed; the terminator is  \ndropped.  \n@param needle - Text to search for in the incoming stream  \n@param terminator - Byte that ends the search before the needle arrives  \n@returns True when the needle was found, false on terminator or timeout",
	},
	{
		description: "readFloat returns f32",
		marker: "serial.readFloat",
		expected:
			"```e95\nreadFloat: () => f32\n```\n\nReads a floating-point number from the stream, skipping leading  \nnon-numeric characters. Accepts an optional sign, a decimal point and an  \nexponent. Collection stops at the first character that is not part of the  \nnumber or when no data shows up before the timeout.  \n@returns The received value, or 0 when no number arrives",
	},
	{
		description: "setReadTimeout accepts a u32 duration",
		marker: "serial.setReadTimeout(",
		expected:
			"```e95\nsetReadTimeout: (milliseconds: u32) => void\n```\n\nSets how long a blocking read waits for the next byte.  \n@param milliseconds - Wait budget per byte in milliseconds; 0 makes every  \nread return immediately with whatever data is already buffered",
	},
	{
		description: "getReadTimeout returns u32",
		marker: "serial.getReadTimeout",
		expected:
			"```e95\ngetReadTimeout: () => u32\n```\n\nReports how long a blocking read waits for the next byte.  \n@returns The wait budget per byte in milliseconds",
	},
];

const SERIAL2_COMPLETION_LABELS =
	"initialize,close,flushOutput,send,sendLine,read,peekByte,getWriteSpace,readBlock,readBlockUntil,sendBuffer,readLine,readTextUntil,readText,findText,findTextUntil,readInteger,readFloat,setReadTimeout,getReadTimeout,hasData";

const SERIAL_LIBRARY_CONTEXT = readLibraryContext({
	libraryPath: SERIAL_LIBRARY_PATH,
	packageName: SERIAL_PACKAGE,
	marker: SERIAL_ENUM_MARKER,
	sample: SERIAL_ENUM_SAMPLE_MEMBER,
});

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

const hoverInDocument = async (documentUri, source, position) => {
	const documents = new Map([
		[documentUri, { uri: documentUri, getText: () => source }],
	]);
	const hover = await onHover(
		{
			textDocument: { uri: documentUri },
			position,
		},
		documents,
	);
	return hover?.contents?.value ?? null;
};

const checkSerialMethodHover = async (testCase) => {
	const position = findPosition(
		SERIAL_SOURCE,
		testCase.marker,
		"serial.".length,
	);
	const hover = await hoverInDocument(
		SERIAL_DOCUMENT_URI,
		SERIAL_SOURCE,
		position,
	);
	return expectEqual(
		`LSP hover of a serial method shows its signature (${testCase.description})`,
		hover,
		testCase.expected,
	);
};

const checkSerialMethodHovers = async () => {
	const results = [];
	for (const testCase of SERIAL_METHOD_HOVER_CASES) {
		results.push(await checkSerialMethodHover(testCase));
	}
	return results;
};

const checkSerialMethodCompletions = async () => {
	const documents = new Map([
		[
			SERIAL_DOCUMENT_URI,
			{ uri: SERIAL_DOCUMENT_URI, getText: () => SERIAL_COMPLETION_SOURCE },
		],
	]);
	const completions = await onCompletion(
		{
			textDocument: { uri: SERIAL_DOCUMENT_URI },
			position: { line: 2, character: "serial.".length },
		},
		documents,
	);
	const labels = completions
		.map((completion) => {
			return completion.label;
		})
		.join(",");
	return expectEqual(
		"LSP completions on a serial port list the SerialPort surface",
		labels,
		SERIAL2_COMPLETION_LABELS,
	);
};

const parseDiagnostics = (source) => {
	const { errors } = checkSource(source, SERIAL_LIBRARY_CONTEXT.libraries);
	return errors.map((error) => {
		const start = error.location?.start;
		const position = start ? `${start.line}:${start.column}` : "?";
		return `${position} ${error.code} ${formatDiagnosticMessage(error)}`;
	});
};

const checkSerialNestedNoFalsePositives = () => {
	const diagnostics = parseDiagnostics(SERIAL_NESTED_DIAGNOSTIC_SOURCE);
	return expectEqual(
		"LSP reports no diagnostics for valid serial reads inside nested if blocks",
		diagnostics.join("\n"),
		"",
	);
};

const checkSerialReadTextUntilArityDiagnostics = () => {
	const diagnostics = parseDiagnostics(
		SERIAL_READ_TEXT_UNTIL_ARITY_DIAGNOSTIC_SOURCE,
	);
	return expectEqual(
		"LSP reports a readTextUntil arity error",
		diagnostics.join("\n"),
		"3:25 error.wrongArgumentCount 'serial.readTextUntil' expects 1 argument(s) but got 0",
	);
};

const checkSerialReadTextUntilTypeDiagnostics = () => {
	const diagnostics = parseDiagnostics(
		SERIAL_READ_TEXT_UNTIL_TYPE_DIAGNOSTIC_SOURCE,
	);
	return expectEqual(
		"LSP reports a readTextUntil terminator type mismatch",
		diagnostics.join("\n"),
		"4:26 error.argumentTypeMismatch Argument 'terminator' expects type 'char' but 'newline' is 'string'",
	);
};

const checkSerialFindTextArityDiagnostics = () => {
	const diagnostics = parseDiagnostics(SERIAL_ARITY_DIAGNOSTIC_SOURCE);
	return expectEqual(
		"LSP reports a findText arity error",
		diagnostics.join("\n"),
		"3:25 error.wrongArgumentCount 'serial.findText' expects 1 argument(s) but got 0",
	);
};

const checkSerialFindTextUntilTypeDiagnostics = () => {
	const diagnostics = parseDiagnostics(SERIAL_TYPE_DIAGNOSTIC_SOURCE);
	return expectEqual(
		"LSP reports a findTextUntil terminator type mismatch",
		diagnostics.join("\n"),
		"4:36 error.argumentTypeMismatch Argument 'terminator' expects type 'char' but 'newline' is 'string'",
	);
};

const checkSerialSetReadTimeoutTypeDiagnostics = () => {
	const diagnostics = parseDiagnostics(SERIAL_TIMEOUT_TYPE_DIAGNOSTIC_SOURCE);
	return expectEqual(
		"LSP reports a setReadTimeout duration type mismatch",
		diagnostics.join("\n"),
		"4:27 error.argumentTypeMismatch Argument 'milliseconds' expects type 'u32' but 'fast' is 'string'",
	);
};

export const runLspSerial2Checks = async () => {
	return [
		...(await checkSerialMethodHovers()),
		await checkSerialMethodCompletions(),
		checkSerialNestedNoFalsePositives(),
		checkSerialReadTextUntilArityDiagnostics(),
		checkSerialReadTextUntilTypeDiagnostics(),
		checkSerialFindTextArityDiagnostics(),
		checkSerialFindTextUntilTypeDiagnostics(),
		checkSerialSetReadTimeoutTypeDiagnostics(),
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
	const results = await runLspSerial2Checks();
	process.exit(reportResults(results) > 0 ? 1 : 0);
}
