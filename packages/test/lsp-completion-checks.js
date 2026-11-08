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

export const runLspCompletionChecks = () => {
	return checkEepromBlockCompletions();
};
