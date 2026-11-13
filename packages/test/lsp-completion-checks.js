// Completion checks for the LSP surface the editor shows while importing a
// library. The document lives beside the registry sources so the completion
// step reads the real `libraries/eeprom/main.e95` exports instead of a fixture.
import { onCompletion } from "../lsp/src/server/completions/index.js";
import { expectEqual } from "./reporting.js";

const DOCUMENT_URI = new URL(
	"../registry/src/libraries/eeprom/main.e95",
	import.meta.url,
).href;
const PLATFORM_NAME = "arduino-nano";
// Loading the document from inside the console library lets the completion
// read the real `@embedito95/console` exports and its object-type surface.
const CONSOLE_DOCUMENT_URI = new URL(
	"../registry/src/core/console/main.e95",
	import.meta.url,
).href;
const CONSOLE_CONSTANT_NAME = "console";
const CONSOLE_LIBRARY_DETAIL = "@embedito95/console - Console";
const CONSOLE_LOG_SIGNATURE = "(data) => void";
const CONSOLE_IMPORT_SOURCE = "import { console } from '@embedito95/console'";
const SOURCE = "import { getCapacity, readEeprom } from '@embedito95/eeprom'";
const SOURCE_LINE = 0;
const BLOCK_LABEL_SUFFIX = "EepromBlock";
const READ_BLOCK_LABEL = "readEepromBlock";
const WRITE_BLOCK_LABEL = "writeEepromBlock";
const EXPECTED_BLOCK_LABELS = `${READ_BLOCK_LABEL}, ${WRITE_BLOCK_LABEL}`;
const EXPECTED_READ_BLOCK_DETAIL = "(address, length) => u8[]";

const listBlockLabels = (completions) => {
	return completions
		.map((completion) => {
			return completion.label;
		})
		.filter((label) => {
			return label.endsWith(BLOCK_LABEL_SUFFIX);
		})
		.sort()
		.join(", ");
};

const findCompletionDetail = (completions, label) => {
	const completion = completions.find((item) => {
		return item.label === label;
	});
	return completion?.detail ?? null;
};

const resolveEepromCompletions = () => {
	const documents = new Map([
		[DOCUMENT_URI, { uri: DOCUMENT_URI, getText: () => SOURCE }],
	]);
	return onCompletion(
		{
			textDocument: { uri: DOCUMENT_URI },
			position: { line: SOURCE_LINE, character: SOURCE.length },
		},
		documents,
		PLATFORM_NAME,
	);
};

const checkEepromBlockCompletions = () => {
	const completions = resolveEepromCompletions();
	return [
		expectEqual(
			"LSP completion of the eeprom import lists both block helpers",
			listBlockLabels(completions),
			EXPECTED_BLOCK_LABELS,
		),
		expectEqual(
			"LSP completion shows readEepromBlock returning u8[]",
			findCompletionDetail(completions, READ_BLOCK_LABEL),
			EXPECTED_READ_BLOCK_DETAIL,
		),
	];
};

const resolveCompletionsAt = (documentUri, source, line, character) => {
	const documents = new Map([
		[documentUri, { uri: documentUri, getText: () => source }],
	]);
	return onCompletion(
		{
			textDocument: { uri: documentUri },
			position: { line, character },
		},
		documents,
		PLATFORM_NAME,
	);
};

const resolveConsoleExpressionCompletions = (prefix) => {
	const expressionLine = `const value = ${prefix}`;
	const source = [CONSOLE_IMPORT_SOURCE, expressionLine].join("\n");
	return resolveCompletionsAt(
		CONSOLE_DOCUMENT_URI,
		source,
		1,
		expressionLine.length,
	);
};

const CONSOLE_EXPRESSION_PREFIXES = ["con", "cons"];

const checkConsoleConstantCompletions = () => {
	return CONSOLE_EXPRESSION_PREFIXES.map((prefix) => {
		const completions = resolveConsoleExpressionCompletions(prefix);
		const completion = completions.find((item) => {
			return item.label === CONSOLE_CONSTANT_NAME;
		});
		return expectEqual(
			`LSP completion of the '${prefix}' expression prefix includes the console constant`,
			completion?.detail ?? null,
			CONSOLE_LIBRARY_DETAIL,
		);
	});
};

const checkConsoleConstantHasNoDuplicateImport = () => {
	const completions = resolveConsoleExpressionCompletions("cons");
	const completion = completions.find((item) => {
		return item.label === CONSOLE_CONSTANT_NAME;
	});
	return expectEqual(
		"LSP completion of an already-imported console constant adds no import edit",
		completion?.additionalTextEdits?.length ?? null,
		0,
	);
};

const checkConsoleMemberCompletions = (memberPrefix) => {
	const memberLine = `${CONSOLE_CONSTANT_NAME}.${memberPrefix}`;
	const source = [CONSOLE_IMPORT_SOURCE, memberLine].join("\n");
	const completions = resolveCompletionsAt(
		CONSOLE_DOCUMENT_URI,
		source,
		1,
		memberLine.length,
	);
	const completion = completions.find((item) => {
		return item.label === "log";
	});
	return [
		expectEqual(
			`LSP completion after '${memberLine}' lists the log method`,
			completion?.label ?? null,
			"log",
		),
		expectEqual(
			`LSP completion after '${memberLine}' shows the log signature`,
			completion?.detail ?? null,
			CONSOLE_LOG_SIGNATURE,
		),
	];
};

const checkConsoleMemberCompletionList = () => {
	const memberLine = `${CONSOLE_CONSTANT_NAME}.`;
	const source = [CONSOLE_IMPORT_SOURCE, memberLine].join("\n");
	const completions = resolveCompletionsAt(
		CONSOLE_DOCUMENT_URI,
		source,
		1,
		memberLine.length,
	);
	return expectEqual(
		"LSP completion after 'console.' lists only the log method",
		completions
			.map((item) => {
				return item.label;
			})
			.join(","),
		"log",
	);
};

export const runLspCompletionChecks = () => {
	return [
		...checkEepromBlockCompletions(),
		...checkConsoleConstantCompletions(),
		checkConsoleConstantHasNoDuplicateImport(),
		checkConsoleMemberCompletionList(),
		...checkConsoleMemberCompletions(""),
		...checkConsoleMemberCompletions("lo"),
	];
};
