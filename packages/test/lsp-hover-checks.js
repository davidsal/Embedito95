// The LSP package has no importable public entry point (`src/index.js` starts
// the language server), so the checks import the hover internals directly.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	check,
	ERROR_CODE,
	formatDiagnosticMessage,
	parse,
	resolvePlatformTypes,
	SEVERITY,
	tokenize,
} from "embedito95-core";
import { onCompletion } from "../lsp/src/server/completions/index.js";
import { onHover } from "../lsp/src/server/hover/index.js";
import { loadLibrariesFromContext } from "../lsp/src/server/shared/libraries.js";
import { REGISTRY_LIBRARIES_DIRECTORY } from "./constants.js";
import { expectEqual } from "./reporting.js";
import { REPOSITORY_ROOT, TESTERS_DIRECTORY } from "./runner-harness.js";

const DOCUMENT_URI = "file:///tmp/embedito95-lsp-hover/main.e95";
const MATH_LIBRARY_FUNCTION_NAME = "arcSine";
const MATH_LIBRARY_PACKAGE_NAME = "@embedito95/math";
// A document URI inside the registry lets the hover load the real core library
// exports (it resolves the registry base from the document path), so the math
// signature and doc comment under test are the ones the editor shows.
const MATH_DOCUMENT_URI = pathToFileURL(
	join(
		REPOSITORY_ROOT,
		"packages",
		"registry",
		"src",
		"core",
		"math",
		"main.e95",
	),
).href;
const MATH_SOURCE = [
	"import { arcSine, bitMask } from '@embedito95/math'",
	"export const angle = arcSine(0.5)",
	"export const mask = bitMask(7)",
].join("\n");
// A document inside the console core library loads the real
// `@embedito95/console` exports, so console hover/completions resolve the same
// library surface the editor sees in a host project.
const CONSOLE_DOCUMENT_URI = pathToFileURL(
	join(
		REPOSITORY_ROOT,
		"packages",
		"registry",
		"src",
		"core",
		"console",
		"main.e95",
	),
).href;
const CONSOLE_SOURCE = [
	"import { console } from '@embedito95/console'",
	'console.log("x")',
].join("\n");
const CONSOLE_LOG_DOC =
	"```e95\nlog: (data: string | char | u8 | i8 | u16 | i16 | u32 | i32 | u64 | i64 | f32 | f64 | boolean | null) => void\n```\n\nWrites one value followed by a line terminator.  \n@param data - Text, numeric, boolean or character value to write; `null`  \nwrites the literal text `null`";
const CONSOLE_CONSTANT_HOVER =
	"```e95\nconst console: Console\n```\n\nConsole bound to the standard output of the host platform.";
// A document inside the Arduino Nano project loads the AVR platform (word
// size 16), so the hover proves the editor and the codegen share the checker
// inference that widens `let` locals to the platform word type. The generated
// testers directory is gitignored, so fall back to the versioned project
// fixture when a fresh checkout has not created it yet.
const ASYNC_AVR_FIXTURE_PROJECT_DIRECTORY = join(
	REPOSITORY_ROOT,
	"packages",
	"test",
	"fixtures",
	"arduino-nano-lsp",
);
const ASYNC_AVR_PROJECT_DIRECTORY = existsSync(
	join(TESTERS_DIRECTORY, "config.json"),
)
	? TESTERS_DIRECTORY
	: ASYNC_AVR_FIXTURE_PROJECT_DIRECTORY;
const ASYNC_AVR_DOCUMENT_URI = pathToFileURL(
	join(ASYNC_AVR_PROJECT_DIRECTORY, "hover.e95"),
).href;
const ASYNC_NESTED_SOURCE = [
	"const fade = async () => {",
	"    let value = 0",
	"    let step = 1",
	"    while (value < 10) {",
	"        if (value > 0) {",
	"            if (step > 0) {",
	"                value = value + step",
	"            } else {",
	"                step = step + 1",
	"            }",
	"        }",
	"        value = value + step",
	"        step = step + value",
	"    }",
	"}",
].join("\n");

const ASYNC_TASK_DOCUMENT_URI = "file:///tmp/embedito95-lsp-async/main.e95";
const ASYNC_TASK_SOURCE = [
	"const getNumberAsync = async () => {",
	"    return 20",
	"}",
	"const task: AsyncTask<i8> = getNumberAsync()",
	"task.value",
	"const readTask = async (): AsyncTask => {",
	"    return 1",
	"}",
	"const readNumberAsync = async (): AsyncTask<i8> => {",
	"    return 1",
	"}",
].join("\n");
const ASYNC_TASK_ASSIGNMENT_DIAGNOSTIC_SOURCE = [
	"const getNumberAsync = async () => {",
	"    return 20",
	"}",
	"const n: i8 = getNumberAsync()",
].join("\n");
const ASYNC_TASK_AWAIT_DIAGNOSTIC_SOURCE = [
	"const getNumberAsync = async () => {",
	"    return 20",
	"}",
	"const readNumberAsync = async (): AsyncTask<i8> => {",
	"    const n: i8 = await getNumberAsync()",
	"    return n",
	"}",
].join("\n");
const ASYNC_TASK_INVALID_AWAIT_SOURCE = [
	"const readAsync = async () => {",
	"    const n: i8 = 20",
	"    await n",
	"}",
].join("\n");
const ASYNC_TASK_USER_GENERIC_SOURCE = "const x: Foo<i8> = 1";

const OBJECT_COMPLETION_SOURCE = [
	"type Reading = {",
	"    getValue: () => i8",
	"    value: i8",
	"}",
	"const reading: Reading = { getValue: () => 1, value: 1 }",
	"reading.",
].join("\n");
const OBJECT_COMPLETION_LABELS = "getValue,value";
// Narrowing is only observable through the receiver surface: inside the branch
// the nullable union collapses to its non-null member, while the wide union has
// no member surface outside it.
const NARROWED_STRING_COMPLETION_SOURCE = [
	"const inspect = (value: string | null): void => {",
	"    if (value != null) {",
	"        value.",
	"    }",
	"}",
].join("\n");
const NARROWED_OBJECT_COMPLETION_SOURCE = [
	"type Reading = {",
	"    getValue: () => i8",
	"    value: i8",
	"}",
	"const inspect = (reading: Reading | null): void => {",
	"    if (reading != null) {",
	"        reading.",
	"    }",
	"}",
].join("\n");
const WIDE_NULLABLE_OBJECT_COMPLETION_SOURCE = [
	"type Reading = {",
	"    getValue: () => i8",
	"}",
	"const inspect = (reading: Reading | null): void => {",
	"    reading.",
	"}",
].join("\n");
const FUNCTION_RECEIVER_COMPLETION_SOURCE = [
	"type Reading = {",
	"    getValue: () => i8",
	"    value: i8",
	"}",
	"const makeReading = (): Reading => {",
	"    return { getValue: () => 1, value: 1 }",
	"}",
	"makeReading().",
].join("\n");
const INDEX_RECEIVER_COMPLETION_SOURCE = [
	"type Reading = {",
	"    getValue: () => i8",
	"    value: i8",
	"}",
	"const readings: Reading[] = []",
	"readings[0].",
].join("\n");
const STRING_INDEX_RECEIVER_COMPLETION_SOURCE = [
	'const words: string[] = ["a"]',
	"words[0].",
].join("\n");
const CAST_RECEIVER_COMPLETION_SOURCE = [
	"const value: string | null = null",
	"(value as string).",
].join("\n");
// An indexed array is not an array literal: `bytes [0].` must resolve the
// element type rather than offer the array surface.
const INDEXED_ARRAY_FALSE_POSITIVE_SOURCE = [
	"const bytes: u8[] = [1, 2]",
	"bytes [0].",
].join("\n");
const ASYNC_TASK_COMPLETION_SOURCE = [
	"const getNumberAsync = async () => {",
	"    return 20",
	"}",
	"const task: AsyncTask<i8> = getNumberAsync()",
	"task.",
].join("\n");
const ASYNC_TASK_COMPLETION_LABELS = "value";
const SSD1306_DOCUMENT_URI = pathToFileURL(
	join(
		REPOSITORY_ROOT,
		"packages",
		"registry",
		"src",
		"libraries",
		"ssd1306",
		"main.e95",
	),
).href;
const LIBRARY_FIELD_COMPLETION_SOURCE = [
	"const transport: DisplayTransport = { i2cChannel: 0, spiChannel: 0, chipSelectChannel: 0, dataCommandChannel: 0, usesSpi: false }",
	"transport.",
].join("\n");
const LIBRARY_FIELD_COMPLETION_LABELS =
	"i2cChannel,spiChannel,chipSelectChannel,dataCommandChannel,usesSpi";
const METHOD_COMPLETION_KIND = 3;
const FIELD_COMPLETION_KIND = 6;

const AVR_F64_DOCUMENT_URI = pathToFileURL(
	join(ASYNC_AVR_FIXTURE_PROJECT_DIRECTORY, "f64-hover.e95"),
).href;
const STM32_F64_FIXTURE_PROJECT_DIRECTORY = join(
	REPOSITORY_ROOT,
	"packages",
	"test",
	"fixtures",
	"stm32-bluepill-lsp",
);
const STM32_F64_DOCUMENT_URI = pathToFileURL(
	join(STM32_F64_FIXTURE_PROJECT_DIRECTORY, "f64-hover.e95"),
).href;
const F64_TYPE_NAME = "f64";
const INVENTED_TYPE_NAME = "f128";
const F64_SOURCE = [
	`const ratio: ${F64_TYPE_NAME} = 0.5`,
	`const total: ${F64_TYPE_NAME} = ratio + 0.25`,
].join("\n");
// The negative control keeps the same shape but uses a type no platform
// declares, so it must trip the checker's type diagnostics.
const INVENTED_TYPE_SOURCE = F64_SOURCE.replaceAll(
	F64_TYPE_NAME,
	INVENTED_TYPE_NAME,
);
const REGISTRY_PLATFORMS_DIRECTORY = join(
	REPOSITORY_ROOT,
	"packages",
	"registry",
	"src",
	"platforms",
);

const SOURCE = [
	"type Writer = {",
	"    write: (value: i16) => void",
	"}",
	"type Screen = {",
	"    paint: () => void",
	"}",
	"const getScreen = (writer: Writer): Screen => {",
	"    /** Paints the first byte. */",
	"    const paint = () => {",
	"        writer.write(1)",
	"    }",
	"    return { paint: paint }",
	"}",
	"const makeValue = (): i16 => {",
	"    const value: i16 = 2",
	"    return value",
	"}",
	"const writer: Writer = { write: (value: i16) => {} }",
	"const screen: Screen = getScreen(writer)",
	"screen.paint()",
].join("\n");

const FUNCTION_TYPE_SOURCE = [
	"const observe = (callback: () => void) => { callback() }",
	"const report = (callback: (value: i16) => void): i16 => {",
	"    callback(1)",
	"    return 2",
	"}",
	"const nested = (callback: (value: i16) => void) => {",
	"    const inner = () => { callback(2) }",
	"}",
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

const hoverAt = async (position) => {
	return hoverInDocument(DOCUMENT_URI, SOURCE, position);
};

const STRING_SOURCE = [
	'const text: string = "Hello"',
	"text.getCharacter(0)",
	"text.getSlice(0, 2)",
	'text.findTextFrom("l", 0)',
	'text.findLastTextFrom("l", 4)',
	'text.hasPrefix("He")',
	'text.hasSuffix("lo")',
	'text.matchesText("Hello")',
	'text.matchesTextIgnoringCase("hello")',
	"text.length()",
].join("\n");

const STRING_DIAGNOSTIC_SOURCE = [
	"const inspect = (text: string, flag: boolean): boolean => {",
	"    if (flag) {",
	'        if (text.hasPrefix("He")) {',
	'            return text.getSlice(1).matchesText("el")',
	"        }",
	"    }",
	"    return false",
	"}",
	'export const nested = inspect("Hello", true)',
].join("\n");

const STRING_TYPE_DIAGNOSTIC_SOURCE = [
	'const text: string = "Hello"',
	"export const badType = text.findTextFrom(1, 0)",
].join("\n");

const STRING_CHAINED_SOURCE = [
	'const text: string = "Hello"',
	'text.getSlice(0, 2).matchesText("He")',
].join("\n");

const STRING_PARAMETER_COMPLETION_SOURCE = [
	"const inspect = (text: string): void => {",
	"    text.",
	"}",
].join("\n");

const STRING_LOCAL_COMPLETION_SOURCE = [
	"const inspect = (): void => {",
	'    const text: string = "Hello"',
	"    text.",
	"}",
].join("\n");

const STRING_NESTED_COMPLETION_SOURCE = [
	"const inspect = (flag: boolean): void => {",
	"    if (flag) {",
	'        const text: string = "Hello"',
	"        text.",
	"    }",
	"}",
].join("\n");

const STRING_COMPLETION_LABELS =
	"length,push,pop,getCharacter,getSlice,findTextFrom,findLastTextFrom,hasPrefix,hasSuffix,matchesText,matchesTextIgnoringCase,setCharacter,appendText,replaceText,removeRange,trimWhitespace,toUpperCase,toLowerCase,parseInteger,parseFloat32,parseFloat64,toByteArray,toCharacterArray,reserveCapacity";

const ARRAY_COMPLETION_LABELS =
	"length,capacity,pop,push,reserve,shrink,truncate";

const ARRAY_SOURCE = [
	"/** Bytes read from the bus. */",
	"const bytes: u8[] = [1, 2]",
	"bytes.length()",
	"bytes.capacity()",
	"bytes.push(3)",
	"const numbers = [10, 20]",
	"numbers.length()",
	"const literalSize = [1, 2].length()",
	"const emptyCapacity = [].capacity()",
	"/** Greeting text. */",
	'const text: string = "Hello"',
	"text.length()",
	'"".length()',
	'"abc".length()',
].join("\n");

const ARRAY_METHOD_HOVER_CASES = [
	{
		description: "length of a typed array variable returns u16",
		marker: "bytes.length",
		offset: "bytes.".length,
		expected: "```e95\nlength: () => u16\n```",
	},
	{
		description: "capacity of a typed array variable returns u16",
		marker: "bytes.capacity",
		offset: "bytes.".length,
		expected: "```e95\ncapacity: () => u16\n```",
	},
	{
		description: "push of a typed array variable substitutes the element type",
		marker: "bytes.push",
		offset: "bytes.".length,
		expected: "```e95\npush: (value: u8) => void\n```",
	},
	{
		description: "length of an inferred array variable returns u16",
		marker: "numbers.length",
		offset: "numbers.".length,
		expected: "```e95\nlength: () => u16\n```",
	},
	{
		description: "length of an array literal receiver returns u16",
		marker: "[1, 2].length",
		offset: "[1, 2].".length,
		expected: "```e95\nlength: () => u16\n```",
	},
	{
		description: "capacity of an empty array literal receiver returns u16",
		marker: "[].capacity",
		offset: "[].".length,
		expected: "```e95\ncapacity: () => u16\n```",
	},
	{
		description: "length of a string literal receiver returns u16",
		marker: '"".length',
		offset: '"".'.length,
		expected: "```e95\nlength: () => u16\n```",
	},
	{
		description: "length of a non-empty string literal receiver returns u16",
		marker: '"abc".length',
		offset: '"abc".'.length,
		expected: "```e95\nlength: () => u16\n```",
	},
];

const ARRAY_VARIABLE_SOURCE = [
	"/** Bytes read from the bus. */",
	"const bytes: u8[] = [1, 2]",
	"/** Greeting text. */",
	'const text: string = "Hello"',
].join("\n");

const STRING_METHOD_HOVER_CASES = [
	{
		description: "getCharacter returns char from a u16 index",
		marker: "text.getCharacter(",
		expected: "```e95\ngetCharacter: (index: u16) => char\n```",
	},
	{
		description: "getSlice returns string from two u16 bounds",
		marker: "text.getSlice(",
		expected: "```e95\ngetSlice: (start: u16, end: u16) => string\n```",
	},
	{
		description: "findTextFrom returns i16 from a string needle and u16 start",
		marker: "text.findTextFrom(",
		expected: "```e95\nfindTextFrom: (needle: string, from: u16) => i16\n```",
	},
	{
		description:
			"findLastTextFrom returns i16 from a string needle and u16 start",
		marker: "text.findLastTextFrom(",
		expected:
			"```e95\nfindLastTextFrom: (needle: string, from: u16) => i16\n```",
	},
	{
		description: "hasPrefix returns boolean from a string prefix",
		marker: "text.hasPrefix(",
		expected: "```e95\nhasPrefix: (prefix: string) => boolean\n```",
	},
	{
		description: "hasSuffix returns boolean from a string suffix",
		marker: "text.hasSuffix(",
		expected: "```e95\nhasSuffix: (suffix: string) => boolean\n```",
	},
	{
		description: "matchesText returns boolean from a string operand",
		marker: "text.matchesText(",
		expected: "```e95\nmatchesText: (other: string) => boolean\n```",
	},
	{
		description:
			"matchesTextIgnoringCase returns boolean from a string operand",
		marker: "text.matchesTextIgnoringCase(",
		expected:
			"```e95\nmatchesTextIgnoringCase: (other: string) => boolean\n```",
	},
];

const completeItemsAt = async (
	source,
	position,
	documentUri = DOCUMENT_URI,
) => {
	const documents = new Map([
		[documentUri, { uri: documentUri, getText: () => source }],
	]);
	return onCompletion(
		{
			textDocument: { uri: documentUri },
			position,
		},
		documents,
	);
};

const completeAt = async (source, position, documentUri = DOCUMENT_URI) => {
	const items = await completeItemsAt(source, position, documentUri);
	return items.map((item) => item.label).join(",");
};

const checkStringMethodHovers = () => {
	return Promise.all(
		STRING_METHOD_HOVER_CASES.map(async (testCase) => {
			const position = findPosition(
				STRING_SOURCE,
				testCase.marker,
				"text.".length,
			);
			const hover = await hoverInDocument(
				DOCUMENT_URI,
				STRING_SOURCE,
				position,
			);
			return expectEqual(
				`LSP hover at ${position.line}:${position.character} of a string method shows its signature (${testCase.description})`,
				hover,
				testCase.expected,
			);
		}),
	);
};

const checkChainedStringMethodHover = async () => {
	const hover = await hoverInDocument(
		DOCUMENT_URI,
		STRING_CHAINED_SOURCE,
		findPosition(STRING_CHAINED_SOURCE, "matchesText"),
	);
	return expectEqual(
		"LSP hover of a method chained on a string-returning call resolves the inner return type",
		hover,
		"```e95\nmatchesText: (other: string) => boolean\n```",
	);
};

const checkStringMethodCompletions = async () => {
	const labels = await completeAt(
		['const text: string = "Hello"', "text."].join("\n"),
		{ line: 1, character: "text.".length },
	);
	return expectEqual(
		"LSP completions on a string receiver list the STRING_METHODS surface",
		labels,
		STRING_COMPLETION_LABELS,
	);
};

const checkStringParameterCompletions = async () => {
	const labels = await completeAt(STRING_PARAMETER_COMPLETION_SOURCE, {
		line: 1,
		character: "    text.".length,
	});
	return expectEqual(
		"LSP completions on a string parameter receiver list the STRING_METHODS surface",
		labels,
		STRING_COMPLETION_LABELS,
	);
};

const checkStringLocalCompletions = async () => {
	const labels = await completeAt(STRING_LOCAL_COMPLETION_SOURCE, {
		line: 2,
		character: "    text.".length,
	});
	return expectEqual(
		"LSP completions on a local string const receiver list the STRING_METHODS surface",
		labels,
		STRING_COMPLETION_LABELS,
	);
};

const checkStringNestedBlockCompletions = async () => {
	const labels = await completeAt(STRING_NESTED_COMPLETION_SOURCE, {
		line: 3,
		character: "        text.".length,
	});
	return expectEqual(
		"LSP completions on a string const inside a nested block list the STRING_METHODS surface",
		labels,
		STRING_COMPLETION_LABELS,
	);
};

const checkArrayMethodHovers = () => {
	return Promise.all(
		ARRAY_METHOD_HOVER_CASES.map(async (testCase) => {
			const position = findPosition(
				ARRAY_SOURCE,
				testCase.marker,
				testCase.offset,
			);
			const hover = await hoverInDocument(DOCUMENT_URI, ARRAY_SOURCE, position);
			return expectEqual(
				`LSP hover at ${position.line}:${position.character} of an array method shows its signature (${testCase.description})`,
				hover,
				testCase.expected,
			);
		}),
	);
};

const checkArrayVariableHover = async () => {
	const hover = await hoverInDocument(
		DOCUMENT_URI,
		ARRAY_VARIABLE_SOURCE,
		findPosition(ARRAY_VARIABLE_SOURCE, "const bytes", "const ".length),
	);
	return expectEqual(
		"LSP hover of a typed array variable shows its type and doc comment",
		hover,
		"```e95\nconst bytes: u8[]\n```\n\nBytes read from the bus.",
	);
};

const checkStringVariableHover = async () => {
	const hover = await hoverInDocument(
		DOCUMENT_URI,
		ARRAY_VARIABLE_SOURCE,
		findPosition(ARRAY_VARIABLE_SOURCE, "const text", "const ".length),
	);
	return expectEqual(
		"LSP hover of a string variable shows its type, value and doc comment",
		hover,
		'```e95\nconst text: string = "Hello"\n```\n\nGreeting text.',
	);
};

const checkArrayVariableCompletions = async () => {
	const labels = await completeAt(
		["const values: u8[] = [1, 2]", "values."].join("\n"),
		{ line: 1, character: "values.".length },
	);
	return expectEqual(
		"LSP completions on a typed array variable list the ARRAY_METHODS surface",
		labels,
		ARRAY_COMPLETION_LABELS,
	);
};

const checkArrayVariablePrefixCompletions = async () => {
	const labels = await completeAt(
		["const values: u8[] = [1, 2]", "values.pu"].join("\n"),
		{ line: 1, character: "values.pu".length },
	);
	return expectEqual(
		"LSP completions on an array variable prefix filter the array methods",
		labels,
		"push",
	);
};

const checkArrayLiteralCompletions = async () => {
	const labels = await completeAt("[].", {
		line: 0,
		character: "[].".length,
	});
	return expectEqual(
		"LSP completions on an array literal receiver list the ARRAY_METHODS surface",
		labels,
		ARRAY_COMPLETION_LABELS,
	);
};

const checkArrayLiteralPrefixCompletions = async () => {
	const labels = await completeAt("[].pu", {
		line: 0,
		character: "[].pu".length,
	});
	return expectEqual(
		"LSP completions on an array literal prefix filter the array methods",
		labels,
		"push",
	);
};

const checkStringLiteralCompletions = async () => {
	const labels = await completeAt('"".', {
		line: 0,
		character: '"".'.length,
	});
	return expectEqual(
		"LSP completions on a string literal receiver list the STRING_METHODS surface",
		labels,
		STRING_COMPLETION_LABELS,
	);
};

const checkStringLiteralPrefixCompletions = async () => {
	const labels = await completeAt('"".len', {
		line: 0,
		character: '"".len'.length,
	});
	return expectEqual(
		"LSP completions on a string literal prefix filter the string methods",
		labels,
		"length",
	);
};

const checkObjectVariableCompletions = async () => {
	const labels = await completeAt(OBJECT_COMPLETION_SOURCE, {
		line: 5,
		character: "reading.".length,
	});
	return expectEqual(
		"LSP completions on a user-defined object variable list its methods and fields",
		labels,
		OBJECT_COMPLETION_LABELS,
	);
};

const checkObjectCompletionItemDetails = async () => {
	const items = await completeItemsAt(OBJECT_COMPLETION_SOURCE, {
		line: 5,
		character: "reading.".length,
	});
	const method = items.find((item) => item.label === "getValue");
	const field = items.find((item) => item.label === "value");

	return Promise.all([
		expectEqual(
			"LSP object method completion reports the function kind",
			method?.kind,
			METHOD_COMPLETION_KIND,
		),
		expectEqual(
			"LSP object method completion reports its signature",
			method?.detail,
			"() => i8",
		),
		expectEqual(
			"LSP object field completion reports the field kind",
			field?.kind,
			FIELD_COMPLETION_KIND,
		),
		expectEqual(
			"LSP object field completion reports its type",
			field?.detail,
			"i8",
		),
	]);
};

const checkNarrowedStringCompletions = async () => {
	const labels = await completeAt(NARROWED_STRING_COMPLETION_SOURCE, {
		line: 2,
		character: "        value.".length,
	});
	return expectEqual(
		"LSP completions narrow a nullable string inside a null check",
		labels,
		STRING_COMPLETION_LABELS,
	);
};

const checkNarrowedObjectCompletions = async () => {
	const items = await completeItemsAt(NARROWED_OBJECT_COMPLETION_SOURCE, {
		line: 6,
		character: "        reading.".length,
	});
	const method = items.find((item) => item.label === "getValue");

	return Promise.all([
		expectEqual(
			"LSP completions narrow a nullable object inside a null check",
			items.map((item) => item.label).join(","),
			OBJECT_COMPLETION_LABELS,
		),
		expectEqual(
			"LSP narrowed object method completion reports the function kind",
			method?.kind,
			METHOD_COMPLETION_KIND,
		),
		expectEqual(
			"LSP narrowed object method completion reports its signature",
			method?.detail,
			"() => i8",
		),
	]);
};

const checkWideNullableObjectCompletions = async () => {
	const labels = await completeAt(WIDE_NULLABLE_OBJECT_COMPLETION_SOURCE, {
		line: 4,
		character: "    reading.".length,
	});
	return expectEqual(
		"LSP completions outside a null check do not expose narrowed members",
		labels.includes("getValue"),
		false,
	);
};

const checkFunctionReceiverCompletions = async () => {
	const items = await completeItemsAt(FUNCTION_RECEIVER_COMPLETION_SOURCE, {
		line: 7,
		character: "makeReading().".length,
	});
	const method = items.find((item) => item.label === "getValue");

	return Promise.all([
		expectEqual(
			"LSP completions on a call receiver use the function return type",
			items.map((item) => item.label).join(","),
			OBJECT_COMPLETION_LABELS,
		),
		expectEqual(
			"LSP call receiver method completion reports the function kind",
			method?.kind,
			METHOD_COMPLETION_KIND,
		),
		expectEqual(
			"LSP call receiver method completion reports its signature",
			method?.detail,
			"() => i8",
		),
	]);
};

const checkIndexReceiverCompletions = async () => {
	const items = await completeItemsAt(INDEX_RECEIVER_COMPLETION_SOURCE, {
		line: 5,
		character: "readings[0].".length,
	});
	const field = items.find((item) => item.label === "value");

	return Promise.all([
		expectEqual(
			"LSP completions on an index receiver use the array element type",
			items.map((item) => item.label).join(","),
			OBJECT_COMPLETION_LABELS,
		),
		expectEqual(
			"LSP index receiver field completion reports the field kind",
			field?.kind,
			FIELD_COMPLETION_KIND,
		),
		expectEqual(
			"LSP index receiver field completion reports its type",
			field?.detail,
			"i8",
		),
	]);
};

const checkStringIndexReceiverCompletions = async () => {
	const labels = await completeAt(STRING_INDEX_RECEIVER_COMPLETION_SOURCE, {
		line: 1,
		character: "words[0].".length,
	});
	return expectEqual(
		"LSP completions on a string array index receiver list the string surface",
		labels,
		STRING_COMPLETION_LABELS,
	);
};

const checkCastReceiverCompletions = async () => {
	const labels = await completeAt(CAST_RECEIVER_COMPLETION_SOURCE, {
		line: 1,
		character: "(value as string).".length,
	});
	return expectEqual(
		"LSP completions on a cast receiver use the cast target type",
		labels,
		STRING_COMPLETION_LABELS,
	);
};

const checkIndexedArrayFalsePositiveCompletions = async () => {
	const labels = await completeAt(INDEXED_ARRAY_FALSE_POSITIVE_SOURCE, {
		line: 1,
		character: "bytes [0].".length,
	});
	return expectEqual(
		"LSP completions on an indexed array receiver do not offer the array surface",
		labels.includes("capacity"),
		false,
	);
};

const checkAsyncTaskCompletions = async () => {
	const labels = await completeAt(ASYNC_TASK_COMPLETION_SOURCE, {
		line: 4,
		character: "task.".length,
	});
	return expectEqual(
		"LSP completions on an AsyncTask variable list the value field",
		labels,
		ASYNC_TASK_COMPLETION_LABELS,
	);
};

const checkLibraryFieldCompletions = async () => {
	const labels = await completeAt(
		LIBRARY_FIELD_COMPLETION_SOURCE,
		{ line: 1, character: "transport.".length },
		SSD1306_DOCUMENT_URI,
	);
	return expectEqual(
		"LSP completions on a library object type list its declared fields",
		labels,
		LIBRARY_FIELD_COMPLETION_LABELS,
	);
};

const collectDiagnostics = (source) => {
	const { tokens } = tokenize(source);
	const { ast, comments } = parse(tokens, source);
	const { errors } = check(ast, { isLibrary: true, comments });
	return errors;
};

const parseDiagnostics = (source) => {
	return collectDiagnostics(source).map((error) => {
		const start = error.location?.start;
		const position = start ? `${start.line}:${start.column}` : "?";
		return `${position} ${error.code} ${formatDiagnosticMessage(error)}`;
	});
};

const checkStringMethodNestedDiagnostics = () => {
	const diagnostics = parseDiagnostics(STRING_DIAGNOSTIC_SOURCE);
	return expectEqual(
		"LSP reports a string method arity error inside nested if blocks",
		diagnostics.join("\n"),
		"4:20 error.wrongArgumentCount 'text.getSlice' expects 2 argument(s) but got 1",
	);
};

const checkStringMethodArgumentTypeDiagnostics = () => {
	const diagnostics = parseDiagnostics(STRING_TYPE_DIAGNOSTIC_SOURCE);
	return expectEqual(
		"LSP reports a string method argument type mismatch",
		diagnostics.join("\n"),
		"2:42 error.argumentTypeMismatch Argument 'needle' expects type 'string' but literal 1 is 'u8'",
	);
};

const checkStringMethodNestedNoFalsePositives = () => {
	const diagnostics = parseDiagnostics(
		[
			"const inspect = (text: string, flag: boolean): boolean => {",
			"    if (flag) {",
			'        if (text.hasPrefix("He")) {',
			'            return text.getSlice(1, 3).matchesText("el")',
			"        }",
			"        if (text.getCharacter(0) == 'H') {",
			'            return text.findLastTextFrom("l", 4) == 3',
			"        }",
			"    }",
			"    return false",
			"}",
			'export const nested = inspect("Hello", true)',
		].join("\n"),
	);
	return expectEqual(
		"LSP reports no diagnostics for valid string calls inside nested if blocks",
		diagnostics.join("\n"),
		"",
	);
};

const hoverAsyncTaskAt = async (marker, offset = 0) => {
	return hoverInDocument(
		ASYNC_TASK_DOCUMENT_URI,
		ASYNC_TASK_SOURCE,
		findPosition(ASYNC_TASK_SOURCE, marker, offset),
	);
};

const checkAsyncFunctionHover = async () => {
	const hover = await hoverAsyncTaskAt("const getNumberAsync", "const ".length);
	return expectEqual(
		"LSP hover of an async function wraps its inferred return in AsyncTask",
		hover,
		"```e95\nconst getNumberAsync: () => AsyncTask<i8>\n```",
	);
};

const checkAsyncTaskVariableHover = async () => {
	const hover = await hoverAsyncTaskAt("const task", "const ".length);
	return expectEqual(
		"LSP hover of an AsyncTask-annotated variable keeps the type argument",
		hover,
		"```e95\nconst task: AsyncTask<i8>\n```",
	);
};

const checkAsyncTaskFieldHover = async () => {
	const hover = await hoverAsyncTaskAt("task.value", "task.".length);
	return expectEqual(
		"LSP hover of the AsyncTask value field shows the task payload type",
		hover,
		"```e95\nvalue: i8\n```",
	);
};

const checkAsyncAnnotatedFunctionHover = async () => {
	const hover = await hoverAsyncTaskAt("const readTask", "const ".length);
	return expectEqual(
		"LSP hover of an async function annotated AsyncTask adds no type argument",
		hover,
		"```e95\nconst readTask: () => AsyncTask\n```",
	);
};

const checkAsyncTaskAnnotatedFunctionHover = async () => {
	const hover = await hoverAsyncTaskAt(
		"const readNumberAsync",
		"const ".length,
	);
	return expectEqual(
		"LSP hover of an async function annotated AsyncTask<i8> keeps one type argument",
		hover,
		"```e95\nconst readNumberAsync: () => AsyncTask<i8>\n```",
	);
};

const checkAsyncTaskAssignmentDiagnostic = () => {
	return expectEqual(
		"LSP reports assigning an AsyncTask result without await",
		parseDiagnostics(ASYNC_TASK_ASSIGNMENT_DIAGNOSTIC_SOURCE).join("\n"),
		"4:15 error.assignmentTypeMismatch Cannot assign 'AsyncTask<i8>' value to 'n' of type 'i8'.",
	);
};

const checkAsyncTaskDiagnosticSeverity = () => {
	const severities = collectDiagnostics(
		ASYNC_TASK_ASSIGNMENT_DIAGNOSTIC_SOURCE,
	).map((error) => {
		return error.severity;
	});
	return expectEqual(
		"LSP reports the AsyncTask assignment mismatch as an error",
		severities.join(","),
		String(SEVERITY.error),
	);
};

const checkAsyncTaskAwaitDiagnostic = () => {
	return expectEqual(
		"LSP reports no diagnostics when await unwraps AsyncTask<i8>",
		parseDiagnostics(ASYNC_TASK_AWAIT_DIAGNOSTIC_SOURCE).join("\n"),
		"",
	);
};

const checkInvalidAwaitDiagnostic = () => {
	return expectEqual(
		"LSP reports awaiting a non-AsyncTask value",
		parseDiagnostics(ASYNC_TASK_INVALID_AWAIT_SOURCE).join("\n"),
		"3:11 error.invalidAwaitTarget 'await' can only be used with an 'AsyncTask' value, got 'i8'",
	);
};

const checkTypeArgumentsDiagnostic = () => {
	return expectEqual(
		"LSP rejects type arguments on a non-AsyncTask type",
		parseDiagnostics(ASYNC_TASK_USER_GENERIC_SOURCE).join("\n"),
		[
			"1:10 error.typeArgumentsNotAllowed Type parameters are not supported on 'Foo': only 'AsyncTask' accepts type arguments",
			"1:10 error.unknownType Unknown type 'Foo<i8>'",
		].join("\n"),
	);
};

const checkLocalClosureHover = async () => {
	const hover = await hoverAt(
		findPosition(SOURCE, "const paint", "const ".length),
	);
	return expectEqual(
		"LSP hover of a local closure shows its callable signature and doc comment",
		hover,
		"```e95\npaint: () => void\n```\n\nPaints the first byte.",
	);
};

const checkLocalVariableHover = async () => {
	const hover = await hoverAt(
		findPosition(SOURCE, "const value", "const ".length),
	);
	return expectEqual(
		"LSP hover of a local variable keeps its declared type",
		hover,
		"```e95\nconst value: i16 = 2\n```",
	);
};

const checkParameterHover = async () => {
	const hover = await hoverAt(findPosition(SOURCE, "(writer: Writer)", 1));
	return expectEqual(
		"LSP hover of a parameter keeps its declared type",
		hover,
		"```e95\nwriter: Writer\n```",
	);
};

const checkFunctionTypeParameterHover = async () => {
	const hover = await hoverInDocument(
		DOCUMENT_URI,
		FUNCTION_TYPE_SOURCE,
		findPosition(FUNCTION_TYPE_SOURCE, "callback: (value", 0),
	);
	return expectEqual(
		"LSP hover of a callback parameter shows its function type",
		hover,
		"```e95\ncallback: (value: i16) => void\n```",
	);
};

const checkFunctionTypeParameterScopingHover = async () => {
	const hover = await hoverInDocument(
		DOCUMENT_URI,
		FUNCTION_TYPE_SOURCE,
		findPosition(FUNCTION_TYPE_SOURCE, "callback(1)", 0),
	);
	return expectEqual(
		"LSP hover of a callback parameter ignores same-named parameters from other functions",
		hover,
		"```e95\ncallback: (value: i16) => void\n```",
	);
};

const checkFunctionTypeNestedParameterHover = async () => {
	const hover = await hoverInDocument(
		DOCUMENT_URI,
		FUNCTION_TYPE_SOURCE,
		findPosition(FUNCTION_TYPE_SOURCE, "callback(2)", 0),
	);
	return expectEqual(
		"LSP hover of a callback used inside a nested function keeps the enclosing parameter type",
		hover,
		"```e95\ncallback: (value: i16) => void\n```",
	);
};

const checkFunctionTypeSignatureHover = async () => {
	const hover = await hoverInDocument(
		DOCUMENT_URI,
		FUNCTION_TYPE_SOURCE,
		findPosition(FUNCTION_TYPE_SOURCE, "const report", "const ".length),
	);
	return expectEqual(
		"LSP hover of a function with a typed callback parameter shows its signature",
		hover,
		"```e95\nconst report: (callback: (value: i16) => void) => i16\n```",
	);
};

const checkReturnedObjectHover = async () => {
	const hover = await hoverAt(
		findPosition(SOURCE, "const screen", "const ".length),
	);
	return expectEqual(
		"LSP hover of the returned object shows the declared type",
		hover,
		"```e95\nconst screen: Screen\n```",
	);
};

const checkReturnedMethodHover = async () => {
	const hover = await hoverAt(
		findPosition(SOURCE, "screen.paint", "screen.".length),
	);
	return expectEqual(
		"LSP hover of the returned method shows its signature",
		hover,
		"```e95\npaint: () => void\n```",
	);
};

const checkLibraryMathFunctionHover = async () => {
	const hover = await hoverInDocument(
		MATH_DOCUMENT_URI,
		MATH_SOURCE,
		findPosition(MATH_SOURCE, "arcSine", 0),
	);
	return expectEqual(
		"LSP hover of a math function shows its signature and domain doc",
		hover,
		"```e95\nconst arcSine(value: f32): f32\n```\n\nReturns the angle in radians whose sine is the given value.  \nValues outside the [-1, 1] domain follow the C library rules and yield NaN.  \n@param value - Sine value to invert.  \n@returns The angle in radians, or NaN outside the domain.",
	);
};

const checkLibraryMathBitHelperHover = async () => {
	const hover = await hoverInDocument(
		MATH_DOCUMENT_URI,
		MATH_SOURCE,
		findPosition(MATH_SOURCE, "bitMask", 0),
	);
	return expectEqual(
		"LSP hover of a bit helper shows its signature and range doc",
		hover,
		"```e95\nconst bitMask(bitIndex: u8): u32\n```\n\nReturns an unsigned value with only the requested bit set.  \nA u32 has 32 bits, so indices 32 and above return 0.  \n@param bitIndex - Zero-based index of the bit to set.  \n@returns A mask with the bit set, or 0 when the index is out of range.",
	);
};

const checkConsoleConstantHover = async () => {
	const hover = await hoverInDocument(
		CONSOLE_DOCUMENT_URI,
		CONSOLE_SOURCE,
		findPosition(CONSOLE_SOURCE, "console.log", 0),
	);
	return expectEqual(
		"LSP hover of the imported console constant shows its type and doc comment",
		hover,
		CONSOLE_CONSTANT_HOVER,
	);
};

const checkConsoleLogMemberHover = async () => {
	const hover = await hoverInDocument(
		CONSOLE_DOCUMENT_URI,
		CONSOLE_SOURCE,
		findPosition(CONSOLE_SOURCE, ".log", 1),
	);
	return expectEqual(
		"LSP hover of console.log shows the member signature and doc comment",
		hover,
		CONSOLE_LOG_DOC,
	);
};

const checkRegistryLibrariesWithoutVersion = () => {
	const libraries = loadLibrariesFromContext(REGISTRY_LIBRARIES_DIRECTORY);
	const mathFunctions =
		libraries.libraryFunctions[MATH_LIBRARY_PACKAGE_NAME] ?? {};

	return [
		expectEqual(
			"LSP loads a registry library whose config has no version",
			libraries.knownLibraries.has(MATH_LIBRARY_PACKAGE_NAME),
			true,
		),
		expectEqual(
			"LSP exposes functions for a registry library whose config has no version",
			Object.hasOwn(mathFunctions, MATH_LIBRARY_FUNCTION_NAME),
			true,
		),
	];
};

const checkAsyncLocalVariableHover = async () => {
	const hover = await hoverInDocument(
		ASYNC_AVR_DOCUMENT_URI,
		ASYNC_NESTED_SOURCE,
		findPosition(ASYNC_NESTED_SOURCE, "let value", "let ".length),
	);
	return expectEqual(
		"LSP hover of an async local widens to the AVR word type shared with the codegen",
		hover,
		"```e95\nlet value: i16 = 0\n```",
	);
};

const checkAsyncLocalNestedDiagnostics = () => {
	const diagnostics = parseDiagnostics(ASYNC_NESTED_SOURCE);
	return expectEqual(
		"LSP reports no diagnostics for async locals inside nested if blocks",
		diagnostics.join("\n"),
		"",
	);
};

const checkF64Hover = async (documentUri, platformName) => {
	const hover = await hoverInDocument(
		documentUri,
		F64_SOURCE,
		findPosition(F64_SOURCE, "const ratio", "const ".length),
	);
	return expectEqual(
		`LSP hover types an f64 declaration on ${platformName}`,
		hover,
		"```e95\nconst ratio: f64 = 0.5\n```",
	);
};

const loadPlatform = async (platformName) => {
	const platformModule = await import(
		pathToFileURL(join(REGISTRY_PLATFORMS_DIRECTORY, `${platformName}.js`)).href
	);
	return platformModule.platform;
};

const isTypeAvailabilityDiagnostic = (error) => {
	return (
		error.code === ERROR_CODE.unknownType ||
		error.code === ERROR_CODE.unsupportedType
	);
};

const collectTypeDiagnostics = (source, platformTypes) => {
	const { tokens } = tokenize(source);
	const { ast, comments } = parse(tokens, source);
	// Match the real editor context (entry document, not a library) so the
	// checker enforces `platformTypes` via `unsupportedType`.
	const { errors } = check(ast, { comments, platformTypes });
	return errors.filter(isTypeAvailabilityDiagnostic);
};

// The hover text is rebuilt from the annotation, so it passes even when the
// platform does not expose `f64`. Assert the platform type set itself and re-run
// the same checker the LSP uses with the real platform types, plus a control
// with an invented type to prove the harness can detect the failure.
const checkF64Availability = async (platformName) => {
	const platformTypes = resolvePlatformTypes(await loadPlatform(platformName));
	const listedType = platformTypes.has(F64_TYPE_NAME) ? F64_TYPE_NAME : "";
	const availability = expectEqual(
		`Platform ${platformName} declares f64 in its type set`,
		listedType,
		F64_TYPE_NAME,
	);
	const diagnostics = collectTypeDiagnostics(F64_SOURCE, platformTypes);
	const noFalsePositive = expectEqual(
		`LSP reports no type diagnostic for f64 on ${platformName}`,
		diagnostics
			.map((error) => {
				return `${error.code} ${formatDiagnosticMessage(error)}`;
			})
			.join("\n"),
		"",
	);
	const controlDiagnostics = collectTypeDiagnostics(
		INVENTED_TYPE_SOURCE,
		platformTypes,
	);
	const control = expectEqual(
		`LSP reports an unknown type for the invented annotation on ${platformName}`,
		controlDiagnostics
			.map((error) => {
				return error.code;
			})
			.join("\n"),
		[ERROR_CODE.unknownType, ERROR_CODE.unknownType].join("\n"),
	);
	return [availability, noFalsePositive, control];
};

export const runLspHoverChecks = async () => {
	return [
		await checkLocalClosureHover(),
		await checkLocalVariableHover(),
		await checkAsyncLocalVariableHover(),
		checkAsyncLocalNestedDiagnostics(),
		await checkF64Hover(AVR_F64_DOCUMENT_URI, "arduino-nano"),
		await checkF64Hover(STM32_F64_DOCUMENT_URI, "stm32-bluepill"),
		...(await checkF64Availability("arduino-nano")),
		...(await checkF64Availability("stm32-bluepill")),
		await checkParameterHover(),
		await checkFunctionTypeParameterHover(),
		await checkFunctionTypeParameterScopingHover(),
		await checkFunctionTypeNestedParameterHover(),
		await checkFunctionTypeSignatureHover(),
		await checkReturnedObjectHover(),
		await checkReturnedMethodHover(),
		...(await checkStringMethodHovers()),
		await checkChainedStringMethodHover(),
		await checkStringMethodCompletions(),
		await checkStringParameterCompletions(),
		await checkStringLocalCompletions(),
		await checkStringNestedBlockCompletions(),
		...(await checkArrayMethodHovers()),
		await checkArrayVariableHover(),
		await checkStringVariableHover(),
		await checkArrayVariableCompletions(),
		await checkArrayVariablePrefixCompletions(),
		await checkArrayLiteralCompletions(),
		await checkArrayLiteralPrefixCompletions(),
		await checkStringLiteralCompletions(),
		await checkStringLiteralPrefixCompletions(),
		await checkObjectVariableCompletions(),
		...(await checkObjectCompletionItemDetails()),
		await checkNarrowedStringCompletions(),
		...(await checkNarrowedObjectCompletions()),
		await checkWideNullableObjectCompletions(),
		...(await checkFunctionReceiverCompletions()),
		...(await checkIndexReceiverCompletions()),
		await checkStringIndexReceiverCompletions(),
		await checkCastReceiverCompletions(),
		await checkIndexedArrayFalsePositiveCompletions(),
		await checkAsyncTaskCompletions(),
		await checkLibraryFieldCompletions(),
		checkStringMethodNestedDiagnostics(),
		checkStringMethodArgumentTypeDiagnostics(),
		checkStringMethodNestedNoFalsePositives(),
		await checkAsyncFunctionHover(),
		await checkAsyncTaskVariableHover(),
		await checkAsyncTaskFieldHover(),
		await checkAsyncAnnotatedFunctionHover(),
		await checkAsyncTaskAnnotatedFunctionHover(),
		checkAsyncTaskAssignmentDiagnostic(),
		checkAsyncTaskDiagnosticSeverity(),
		checkAsyncTaskAwaitDiagnostic(),
		checkInvalidAwaitDiagnostic(),
		checkTypeArgumentsDiagnostic(),
		await checkLibraryMathFunctionHover(),
		await checkLibraryMathBitHelperHover(),
		await checkConsoleConstantHover(),
		await checkConsoleLogMemberHover(),
		...checkRegistryLibrariesWithoutVersion(),
	];
};
