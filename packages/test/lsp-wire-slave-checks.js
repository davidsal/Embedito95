// LSP view of the `i2c` core library slave surface. The document lives beside
// the registry sources so hover/completions read the real `core/i2c/main.e95`
// exports, and diagnostics run through the same library introspection
// (`readLibraryContext`) the language server uses.
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
const SLAVE_ADDRESS = 66;
const INVALID_SLAVE_ADDRESS = 200;

const SLAVE_SOURCE = [
	"import { I2C, I2CBus, getI2C } from '@embedito95/i2c'",
	"const bus: I2CBus = getI2C(I2C.1)",
	"const onSlaveReceive = () => {",
	"    const receivedByte: u8 = bus.read()",
	"    const pending: u8 = bus.available()",
	"}",
	"const onSlaveRequest = () => {",
	"    bus.sendResponse([1, 2])",
	"}",
	"export const start = () => {",
	`    bus.initializeSlave(${SLAVE_ADDRESS})`,
	"    bus.onReceive(onSlaveReceive)",
	"    bus.onRequest(onSlaveRequest)",
	"}",
].join("\n");

const INVALID_ADDRESS_SOURCE = [
	"import { I2C, I2CBus, getI2C } from '@embedito95/i2c'",
	"const bus: I2CBus = getI2C(I2C.1)",
	"export const start = () => {",
	`    bus.initializeSlave(${INVALID_SLAVE_ADDRESS})`,
	"}",
].join("\n");

const NESTED_INVALID_ADDRESS_SOURCE = [
	"import { I2C, I2CBus, getI2C } from '@embedito95/i2c'",
	"const bus: I2CBus = getI2C(I2C.1)",
	"export const start = () => {",
	"    if (bus.available() > 0) {",
	"        if (bus.available() > 1) {",
	`            bus.initializeSlave(${INVALID_SLAVE_ADDRESS})`,
	"        }",
	"    }",
	"}",
].join("\n");

const CAPTURED_HANDLER_SOURCE = [
	"import { I2C, I2CBus, getI2C } from '@embedito95/i2c'",
	"const bus: I2CBus = getI2C(I2C.1)",
	"export const start = () => {",
	"    const payload: u8 = 1",
	`    bus.initializeSlave(${SLAVE_ADDRESS})`,
	"    bus.onRequest(() => {",
	"        bus.sendResponse([payload])",
	"    })",
	"}",
].join("\n");

const NESTED_SOURCE = [
	"import { I2C, I2CBus, getI2C } from '@embedito95/i2c'",
	"const bus: I2CBus = getI2C(I2C.1)",
	"const onSlaveReceive = () => {",
	"    if (bus.available() > 0) {",
	"        if (bus.available() > 1) {",
	"            bus.read()",
	"        }",
	"        bus.read()",
	"    }",
	"}",
	"const onSlaveRequest = () => {",
	"    if (bus.available() > 0) {",
	"        bus.sendResponse([1, 2])",
	"    }",
	"}",
	"export const start = () => {",
	`    bus.initializeSlave(${SLAVE_ADDRESS})`,
	"    bus.onReceive(onSlaveReceive)",
	"    bus.onRequest(onSlaveRequest)",
	"}",
].join("\n");

const NON_FUNCTION_HANDLER_SOURCE = [
	"import { I2C, I2CBus, getI2C } from '@embedito95/i2c'",
	"const bus: I2CBus = getI2C(I2C.1)",
	"const notAHandler: u8 = 1",
	"export const start = () => {",
	"    bus.onReceive(notAHandler)",
	"}",
].join("\n");

const PARAMETER_HANDLER_SOURCE = [
	"import { I2C, I2CBus, getI2C } from '@embedito95/i2c'",
	"const bus: I2CBus = getI2C(I2C.1)",
	"const onSlaveReceive = (value: u8) => {}",
	"export const start = () => {",
	`    bus.initializeSlave(${SLAVE_ADDRESS})`,
	"    bus.onReceive(onSlaveReceive)",
	"}",
].join("\n");

const SCOPED_HANDLER_SOURCE = [
	"import { I2C, I2CBus, getI2C } from '@embedito95/i2c'",
	"const bus: I2CBus = getI2C(I2C.1)",
	"const onSlaveRequest = () => {",
	"    const localBus: I2CBus = getI2C(I2C.1)",
	"    localBus.sendResponse([1, 2])",
	"}",
	"export const start = () => {",
	`    bus.initializeSlave(${SLAVE_ADDRESS})`,
	"    bus.onRequest(onSlaveRequest)",
	"}",
].join("\n");

const METHOD_HOVER_CASES = [
	{
		description: "initializeSlave configures the slave address",
		marker: "bus.initializeSlave(",
		expected:
			"```e95\ninitializeSlave: (address: u8) => void\n```\n\nConfigures the bus as a slave at `address` and starts listening for  \ntransactions from a master. Only one bus can listen as a slave at a  \ntime: the most recently configured bus owns the slave callbacks.  \n@param address - 7-bit slave address (0..127)  \n@range address 0 127",
	},
	{
		description: "onReceive registers the write-transaction handler",
		marker: "bus.onReceive(",
		expected:
			"```e95\nonReceive: (handler: () => void) => void\n```\n\nRegisters the function invoked when a master writes bytes to the slave.  \nThe function takes no arguments and reads the received bytes with `read`  \nand `available`. It is declared as `() => void`, so pass a named function  \nor a captureless inline arrow with that exact signature.  \n@param handler - Function invoked when a write transaction arrives",
	},
	{
		description: "onRequest registers the read-transaction handler",
		marker: "bus.onRequest(",
		expected:
			"```e95\nonRequest: (handler: () => void) => void\n```\n\nRegisters the function invoked when a master requests bytes from the  \nslave. Inside it, call `sendResponse` to queue the bytes sent back. It  \nmust match the `() => void` signature: a named function or a captureless  \ninline arrow with that exact signature.  \n@param handler - Function invoked when a read transaction arrives",
	},
	{
		description: "sendResponse queues the slave response bytes",
		marker: "bus.sendResponse(",
		expected:
			"```e95\nsendResponse: (data: u8[]) => void\n```\n\nQueues `data` as the response to the master that requested a read. It  \nonly has an effect while an `onRequest` handler runs; otherwise it does  \nnothing. Bytes beyond the bus response buffer are not sent.  \n@param data - Bytes to send back to the master",
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
				SLAVE_SOURCE,
				testCase.marker,
				"bus.".length,
			);
			const hover = await hoverInDocument(SLAVE_SOURCE, position);
			return expectEqual(
				`LSP hover at ${position.line}:${position.character} shows the i2c slave method signature (${testCase.description})`,
				hover,
				testCase.expected,
			);
		}),
	);
};

const checkCompletionSurface = async () => {
	const position = findPosition(SLAVE_SOURCE, "bus.", "bus.".length);
	const labels = await completeAt(SLAVE_SOURCE, position);
	return expectEqual(
		"LSP completions on an I2C bus include the slave surface",
		labels,
		"initialize,setClock,close,beginWrite,sendByte,endWrite,write,requestFrom,read,available,initializeSlave,onReceive,onRequest,sendResponse",
	);
};

const checkInvalidSlaveAddress = () => {
	const diagnostics = parseDiagnostics(INVALID_ADDRESS_SOURCE);
	return expectEqual(
		"LSP reports a slave address above the 7-bit range",
		diagnostics.join("\n"),
		`4:25 error.valueOutOfRange Value '${INVALID_SLAVE_ADDRESS}' overflows type 'u8' (0..127) in 'address'`,
	);
};

const checkNestedInvalidSlaveAddress = () => {
	const diagnostics = parseDiagnostics(NESTED_INVALID_ADDRESS_SOURCE);
	return expectEqual(
		"LSP reports a slave address above the 7-bit range inside nested conditionals",
		diagnostics.join("\n"),
		`6:33 error.valueOutOfRange Value '${INVALID_SLAVE_ADDRESS}' overflows type 'u8' (0..127) in 'address'`,
	);
};

const checkCapturedHandler = () => {
	const diagnostics = parseDiagnostics(CAPTURED_HANDLER_SOURCE);
	return expectEqual(
		"LSP reports an inline slave handler that captures local state",
		diagnostics.join("\n"),
		"6:25 error.callbackCapturesLocalState Callback handler for 'handler' captures local state; register a top-level function instead.",
	);
};

const checkNestedHandlersNoFalsePositives = () => {
	const diagnostics = parseDiagnostics(NESTED_SOURCE);
	return expectEqual(
		"LSP reports no diagnostics for slave handlers with nested conditionals",
		diagnostics.join("\n"),
		"",
	);
};

const checkNonFunctionHandler = () => {
	const diagnostics = parseDiagnostics(NON_FUNCTION_HANDLER_SOURCE);
	return expectEqual(
		"LSP reports a non-function callback identifier",
		diagnostics.join("\n"),
		"5:19 error.expectedFunction 'notAHandler' must be a function",
	);
};

const checkParameterHandler = () => {
	const diagnostics = parseDiagnostics(PARAMETER_HANDLER_SOURCE);
	return expectEqual(
		"LSP reports a callback handler that takes parameters",
		diagnostics.join("\n"),
		`6:19 error.callbackSignatureMismatch Callback handler 'handler' does not match the expected signature '() => void' (found '(value: u8) => void'): parameter count (expected 0, found 1).`,
	);
};

const checkScopedHandlerNoFalsePositives = () => {
	const diagnostics = parseDiagnostics(SCOPED_HANDLER_SOURCE);
	return expectEqual(
		"LSP accepts a top-level handler that obtains the bus with getI2C",
		diagnostics.join("\n"),
		"",
	);
};

export const runLspWireSlaveChecks = async () => {
	return [
		...(await checkMethodHovers()),
		await checkCompletionSurface(),
		checkInvalidSlaveAddress(),
		checkNestedInvalidSlaveAddress(),
		checkCapturedHandler(),
		checkNestedHandlersNoFalsePositives(),
		checkNonFunctionHandler(),
		checkParameterHandler(),
		checkScopedHandlerNoFalsePositives(),
	];
};

if (isMainModule(import.meta.url)) {
	const results = await runLspWireSlaveChecks();
	reportUnitChecks("lsp-wire-slave", results);
	const hasMismatch = results.some((result) => {
		return result.status === SNAPSHOT_STATUS.mismatch;
	});
	process.exit(hasMismatch ? 1 : 0);
}
