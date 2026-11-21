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
const UNRESOLVED_DOT_CASES = [
	{ description: "numeric literal dot", source: "const INTERVAL = 1000." },
	{ description: "enum member dot", source: "Pin.A0." },
	{ description: "function name dot", source: "blinkLed." },
	{ description: "void call dot", source: "setDigital(LED_BUILTIN, LOW)." },
	{ description: "object literal dot", source: "{." },
];

const PERSONA_DOT_LINE = "persona.";
const PERSONA_ADDRESS_DOT_LINE = "persona.address.";
const ANONYMOUS_SHAPE_SOURCE = [
	"const getPersona = () => { return { name: 'David', age: 31 } }",
	"const persona = getPersona()",
	PERSONA_DOT_LINE,
].join("\n");
const ANONYMOUS_SHAPE_LINE = 2;
const EXPECTED_PERSONA_LABELS = "age,name";
const NESTED_SHAPE_SOURCE = [
	"const getPersona = () => { return { name: 'David', address: { city: 'X' } } }",
	"const persona = getPersona()",
	PERSONA_ADDRESS_DOT_LINE,
].join("\n");
const EXPECTED_NESTED_LABELS = "city";
const TEMPLATE_NOMINAL_SOURCE = [
	"type Persona = { name: string, age: i32 }",
	"const getPersona = (): Persona => { return { name: 'David', age: 31 } }",
	"const persona = getPersona()",
	"const value = `${persona.",
].join("\n");
const TEMPLATE_ANONYMOUS_SOURCE = [
	"const getPersona = () => { return { name: 'David', age: 31 } }",
	"const persona = getPersona()",
	"const value = `${persona.",
].join("\n");
const TEMPLATE_NESTED_SOURCE = [
	"const getPersona = () => { return { name: 'David', address: { city: 'X' } } }",
	"const persona = getPersona()",
	"const value = `${persona.address.",
].join("\n");
const TEMPLATE_PERSONA_DOT_LINE = "const value = `${persona.";
const TEMPLATE_PERSONA_ADDRESS_DOT_LINE = "const value = `${persona.address.";
const TEMPLATE_PREFIX_LINE = "const value = `${";
const TEMPLATE_PREFIXES = ["per", "pers"];
const TEMPLATE_CLOSED_MEMBER_LINE = `const value = \`\${persona.name}\``;
const INTERPOLATION_CLOSE_BRACE = "}";
const TEMPLATE_CLOSED_MEMBER_BRACE_INDEX = TEMPLATE_CLOSED_MEMBER_LINE.indexOf(
	INTERPOLATION_CLOSE_BRACE,
);
const OUTSIDE_TEMPLATE_MEMBER_LINE = "persona.name";
const TEMPLATE_DEFAULT_EXCLUDED_LABELS = ["age", "name"];

const hasLabel = (completions, label) => {
	return completions.some((item) => {
		return item.label === label;
	});
};

const listsAnyLabel = (completions, labels) => {
	return labels.some((label) => {
		return hasLabel(completions, label);
	});
};

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

const listSortedLabels = (completions) => {
	return completions
		.map((completion) => {
			return completion.label;
		})
		.sort()
		.join(",");
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

const checkUnresolvedDotCompletionsAreEmpty = () => {
	return UNRESOLVED_DOT_CASES.map(({ description, source }) => {
		const completions = resolveCompletionsAt(
			DOCUMENT_URI,
			source,
			SOURCE_LINE,
			source.length,
		);
		return expectEqual(
			`LSP completion after ${description} is empty`,
			completions.length,
			0,
		);
	});
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

const checkAnonymousShapeMemberCompletions = () => {
	return [
		expectEqual(
			"LSP completion after 'persona.' lists the anonymous return shape fields",
			listSortedLabels(
				resolveCompletionsAt(
					DOCUMENT_URI,
					ANONYMOUS_SHAPE_SOURCE,
					ANONYMOUS_SHAPE_LINE,
					PERSONA_DOT_LINE.length,
				),
			),
			EXPECTED_PERSONA_LABELS,
		),
		expectEqual(
			"LSP completion after 'persona.address.' lists the nested anonymous shape fields",
			listSortedLabels(
				resolveCompletionsAt(
					DOCUMENT_URI,
					NESTED_SHAPE_SOURCE,
					ANONYMOUS_SHAPE_LINE,
					PERSONA_ADDRESS_DOT_LINE.length,
				),
			),
			EXPECTED_NESTED_LABELS,
		),
	];
};

const checkTemplateMemberCompletions = () => {
	return [
		expectEqual(
			"LSP completion after '${persona.' inside a template lists the nominal fields",
			listSortedLabels(
				resolveCompletionsAt(
					DOCUMENT_URI,
					TEMPLATE_NOMINAL_SOURCE,
					3,
					TEMPLATE_PERSONA_DOT_LINE.length,
				),
			),
			EXPECTED_PERSONA_LABELS,
		),
		expectEqual(
			"LSP completion after '${persona.' inside a template lists the anonymous shape fields",
			listSortedLabels(
				resolveCompletionsAt(
					DOCUMENT_URI,
					TEMPLATE_ANONYMOUS_SOURCE,
					2,
					TEMPLATE_PERSONA_DOT_LINE.length,
				),
			),
			EXPECTED_PERSONA_LABELS,
		),
		expectEqual(
			"LSP completion after '${persona.address.' inside a template lists the nested fields",
			listSortedLabels(
				resolveCompletionsAt(
					DOCUMENT_URI,
					TEMPLATE_NESTED_SOURCE,
					2,
					TEMPLATE_PERSONA_ADDRESS_DOT_LINE.length,
				),
			),
			EXPECTED_NESTED_LABELS,
		),
	];
};

const checkTemplateInterpolationPrefixCompletions = () => {
	return TEMPLATE_PREFIXES.map((prefix) => {
		const prefixLine = `${TEMPLATE_PREFIX_LINE}${prefix}`;
		const source = [
			"type Persona = { name: string, age: i32 }",
			"const getPersona = (): Persona => { return { name: 'David', age: 31 } }",
			"const persona = getPersona()",
			prefixLine,
		].join("\n");
		const completions = resolveCompletionsAt(
			DOCUMENT_URI,
			source,
			3,
			prefixLine.length,
		);
		return expectEqual(
			`LSP completion after '\${${prefix}' inside a template includes the persona variable`,
			hasLabel(completions, "persona"),
			true,
		);
	});
};

const checkTemplateClosedAccessCompletions = () => {
	const closedSource = [
		"type Persona = { name: string, age: i32 }",
		"const getPersona = (): Persona => { return { name: 'David', age: 31 } }",
		"const persona = getPersona()",
		TEMPLATE_CLOSED_MEMBER_LINE,
	].join("\n");
	const closedMemberCompletions = resolveCompletionsAt(
		DOCUMENT_URI,
		closedSource,
		3,
		TEMPLATE_CLOSED_MEMBER_LINE.length,
	);
	return [
		expectEqual(
			`LSP completion before the interpolation close brace of '\${persona.name}' lists the field`,
			listSortedLabels(
				resolveCompletionsAt(
					DOCUMENT_URI,
					closedSource,
					3,
					TEMPLATE_CLOSED_MEMBER_BRACE_INDEX,
				),
			),
			"name",
		),
		expectEqual(
			`LSP completion after a completed '\${persona.name}' lists no member fields`,
			listsAnyLabel(closedMemberCompletions, TEMPLATE_DEFAULT_EXCLUDED_LABELS),
			false,
		),
		expectEqual(
			"LSP completion after 'persona.name' outside a template still lists the field",
			listSortedLabels(
				resolveCompletionsAt(
					DOCUMENT_URI,
					[
						"type Persona = { name: string, age: i32 }",
						"const getPersona = (): Persona => { return { name: 'David', age: 31 } }",
						"const persona = getPersona()",
						OUTSIDE_TEMPLATE_MEMBER_LINE,
					].join("\n"),
					3,
					OUTSIDE_TEMPLATE_MEMBER_LINE.length,
				),
			),
			"name",
		),
	];
};

export const runLspCompletionChecks = () => {
	return [
		...checkEepromBlockCompletions(),
		...checkUnresolvedDotCompletionsAreEmpty(),
		...checkConsoleConstantCompletions(),
		checkConsoleConstantHasNoDuplicateImport(),
		checkConsoleMemberCompletionList(),
		...checkConsoleMemberCompletions(""),
		...checkConsoleMemberCompletions("lo"),
		...checkAnonymousShapeMemberCompletions(),
		...checkTemplateMemberCompletions(),
		...checkTemplateInterpolationPrefixCompletions(),
		...checkTemplateClosedAccessCompletions(),
	];
};
