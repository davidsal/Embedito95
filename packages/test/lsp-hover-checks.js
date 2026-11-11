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
		...checkRegistryLibrariesWithoutVersion(),
	];
};
