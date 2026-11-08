// LSP view of the `i2c` core library step-by-step transaction surface. The
// document lives beside the registry sources so hover/completions read the real
// `core/i2c/main.e95` exports, and diagnostics run through the same library
// introspection (`readLibraryContext`) the language server uses.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { check, formatDiagnosticMessage } from "embedito95-core";
import { onCompletion } from "../lsp/src/server/completions/index.js";
import { onHover } from "../lsp/src/server/hover/index.js";
import { SNAPSHOT_STATUS } from "./constants.js";
import { expectEqual, reportUnitChecks } from "./reporting.js";
import {
	CORE_LIBRARY_DIRECTORY,
	isMainModule,
	parseSource,
	readLibraryContext,
} from "./src/language/language-snapshot-harness.mjs";

const I2C_PACKAGE = "@embedito95/i2c";
const I2C_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "i2c", "main.e95");
const I2C_ENUM_MARKER = "// e95.postinstall.i2cEnum";
const I2C_ENUM_SAMPLE_MEMBER = "1,";
const DOCUMENT_URI = pathToFileURL(I2C_LIBRARY_PATH).href;

const TRANSACTION_SOURCE = [
	"import { I2C, I2CBus, I2CStatus, getI2C } from '@embedito95/i2c'",
	"const bus: I2CBus = getI2C(I2C.1)",
	"bus.beginWrite(60)",
	"bus.sendByte(0)",
	"const status: I2CStatus = bus.endWrite()",
	"bus.close()",
	"export const result = status",
].join("\n");

const NESTED_SOURCE = [
	"import { I2C, I2CBus, I2CStatus, getI2C } from '@embedito95/i2c'",
	"const send = (bus: I2CBus, value: u8): I2CStatus => {",
	"    bus.beginWrite(60)",
	"    bus.sendByte(0)",
	"    bus.sendByte(value)",
	"    const status: I2CStatus = bus.endWrite()",
	"    if (status != I2CStatus.OK) {",
	"        if (status == I2CStatus.DATA_NACK) {",
	"            return status",
	"        }",
	"        bus.beginWrite(60)",
	"        bus.sendByte(value)",
	"        return bus.endWrite()",
	"    }",
	"    return status",
	"}",
	"export const nested = send(getI2C(I2C.1), 1)",
].join("\n");

const ARITY_SOURCE = [
	"import { I2C, I2CBus, getI2C } from '@embedito95/i2c'",
	"const bus: I2CBus = getI2C(I2C.1)",
	"export const badCount = bus.beginWrite()",
].join("\n");

const TYPE_SOURCE = [
	"import { I2C, I2CBus, getI2C } from '@embedito95/i2c'",
	"const bus: I2CBus = getI2C(I2C.1)",
	"export const wideValue: i32 = 300",
	"bus.beginWrite(60)",
	"export const widened = bus.sendByte(wideValue)",
].join("\n");

const METHOD_HOVER_CASES = [
	{
		description: "close releases the bus",
		marker: "bus.close(",
		expected:
			"```e95\nclose: () => void\n```\n\nReleases the bus and leaves it inactive. Any open write transaction is  \ndiscarded.",
	},
	{
		description: "beginWrite opens a transaction with a u8 address",
		marker: "bus.beginWrite(",
		expected:
			"```e95\nbeginWrite: (address: u8) => void\n```\n\nStarts a write transaction to `address` and clears the write buffer.  \nA transaction holds at most 32 bytes.  \n@param address - 7-bit I2C device address",
	},
	{
		description: "sendByte queues a u8 value",
		marker: "bus.sendByte(",
		expected:
			"```e95\nsendByte: (value: u8) => void\n```\n\nQueues one byte for the transaction opened by `beginWrite`. Does nothing  \nwhen no transaction is open or the write buffer is full.  \n@param value - Byte to queue",
	},
	{
		description: "endWrite returns the transaction status",
		marker: "bus.endWrite(",
		expected:
			"```e95\nendWrite: () => I2CStatus\n```\n\nEnds the open write transaction, sends the queued bytes and returns the  \nresult. Returns `OTHER` when no transaction is open.  \n@returns The transaction result code",
	},
];

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
	const { ast, comments } = parseSource(source);
	const context = readLibraryContext({
		libraryPath: I2C_LIBRARY_PATH,
		packageName: I2C_PACKAGE,
		marker: I2C_ENUM_MARKER,
		sample: I2C_ENUM_SAMPLE_MEMBER,
	});
	const { errors } = check(ast, { ...context.libraries, comments });
	return errors.map((error) => {
		const start = error.location?.start;
		const position = start ? `${start.line}:${start.column}` : "?";
		return `${position} ${error.code} ${formatDiagnosticMessage(error)}`;
	});
};

const checkMethodHovers = () => {
	return Promise.all(
		METHOD_HOVER_CASES.map(async (testCase) => {
			const position = findPosition(
				TRANSACTION_SOURCE,
				testCase.marker,
				"bus.".length,
			);
			const hover = await hoverInDocument(TRANSACTION_SOURCE, position);
			return expectEqual(
				`LSP hover at ${position.line}:${position.character} shows the i2c method signature (${testCase.description})`,
				hover,
				testCase.expected,
			);
		}),
	);
};

const checkCompletionSurface = async () => {
	const labels = await completeAt(TRANSACTION_SOURCE, {
		line: 2,
		character: "bus.".length,
	});
	return expectEqual(
		"LSP completions on an I2C bus list the step-by-step transaction surface",
		labels,
		"initialize,setClock,close,beginWrite,sendByte,endWrite,write,requestFrom,read,available,initializeSlave,onReceive,onRequest,sendResponse",
	);
};

const checkNestedTransactionNoFalsePositives = () => {
	const diagnostics = parseDiagnostics(NESTED_SOURCE);
	return expectEqual(
		"LSP reports no diagnostics for a valid i2c transaction inside nested if blocks",
		diagnostics.join("\n"),
		"",
	);
};

const checkBeginWriteArity = () => {
	const diagnostics = parseDiagnostics(ARITY_SOURCE);
	return expectEqual(
		"LSP reports the beginWrite arity error",
		diagnostics.join("\n"),
		"3:25 error.wrongArgumentCount 'bus.beginWrite' expects 1 argument(s) but got 0",
	);
};

const checkSendByteArgumentType = () => {
	const diagnostics = parseDiagnostics(TYPE_SOURCE);
	return expectEqual(
		"LSP reports a sendByte argument type mismatch",
		diagnostics.join("\n"),
		"5:37 error.argumentTypeMismatch Argument 'value' expects type 'u8' but 'wideValue' is 'i32'",
	);
};

export const runLspWireChecks = async () => {
	return [
		...(await checkMethodHovers()),
		await checkCompletionSurface(),
		checkNestedTransactionNoFalsePositives(),
		checkBeginWriteArity(),
		checkSendByteArgumentType(),
	];
};

if (isMainModule(import.meta.url)) {
	const results = await runLspWireChecks();
	reportUnitChecks("lsp-wire", results);
	const hasMismatch = results.some((result) => {
		return result.status === SNAPSHOT_STATUS.mismatch;
	});
	process.exit(hasMismatch ? 1 : 0);
}
