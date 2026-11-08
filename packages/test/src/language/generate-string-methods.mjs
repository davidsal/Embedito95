import { AST_NODE } from "embedito95-core";
import {
	createLibraries,
	isMainModule,
	listSnapshots,
	renderLibraryCase,
	resolveNoCallType,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const LIBRARIES = createLibraries({ isLibrary: true });

const renderCase = (testCase) => {
	return renderLibraryCase(testCase, {
		libraries: LIBRARIES,
		resolveLibraryCallType: resolveNoCallType,
	});
};

const buildReport = () => {
	const cases = [
		{
			label: "read-only string methods infer their declared return types",
			probes: [
				"character",
				"slice",
				"found",
				"lastFound",
				"prefix",
				"suffix",
				"equal",
				"equalIgnoringCase",
			],
			body: [
				'const text: string = "Hello"',
				"export const character = text.getCharacter(1)",
				"export const slice = text.getSlice(1, 4)",
				'export const found = text.findTextFrom("l", 0)',
				'export const lastFound = text.findLastTextFrom("l", 5)',
				'export const prefix = text.hasPrefix("He")',
				'export const suffix = text.hasSuffix("lo")',
				'export const equal = text.matchesText("Hello")',
				'export const equalIgnoringCase = text.matchesTextIgnoringCase("hello")',
			].join("\n"),
		},
		{
			label: "string method calls chain through their return type",
			probes: ["chained", "character"],
			expressionProbes: [
				{
					source: 'text.getSlice(0, 2).hasPrefix("He")',
					nodeType: AST_NODE.callExpression,
				},
				{
					source: 'text.getSlice(0, 2).getCharacter(0)',
					nodeType: AST_NODE.callExpression,
				},
			],
			body: [
				'const text: string = "Hello"',
				'export const chained = text.getSlice(0, 2).hasPrefix("He")',
				"export const character = text.getSlice(0, 2).getCharacter(0)",
			].join("\n"),
		},
		{
			label: "string method calls inside nested if blocks produce no diagnostics",
			probes: ["nested"],
			body: [
				"const inspect = (text: string, flag: boolean): boolean => {",
				"    if (flag) {",
				"        if (text.hasPrefix(\"He\")) {",
				"            return text.getSlice(1, 3).matchesText(\"el\")",
				"        }",
				"    }",
				"    return false",
				"}",
				'export const nested = inspect("Hello", true)',
			].join("\n"),
		},
		{
			label: "wrong argument count on a string method reports the arity",
			probes: ["badCount"],
			body: [
				'const text: string = "Hello"',
				"export const badCount = text.getSlice(1)",
			].join("\n"),
		},
		{
			label: "wrong argument count inside a nested if reports the arity",
			probes: ["nested"],
			body: [
				"const inspect = (text: string, flag: boolean): char => {",
				"    if (flag) {",
				"        if (text.hasPrefix(\"He\")) {",
				"            return text.getCharacter()",
				"        }",
				"    }",
				"    return 'a'",
				"}",
				'export const nested = inspect("Hello", true)',
			].join("\n"),
		},
		{
			label: "non-string search argument reports a type mismatch",
			probes: ["badType"],
			body: [
				'const text: string = "Hello"',
				'export const badType = text.findTextFrom("l", "start")',
			].join("\n"),
		},
		{
			label: "unknown string method reports undefinedMethod",
			probes: ["unknown"],
			body: [
				'const text: string = "Hello"',
				"export const unknown = text.trim()",
			].join("\n"),
		},
		{
			label: "conversion and buffer methods infer their declared return types",
			probes: [
				"integer",
				"float32Value",
				"float64Value",
				"bytes",
				"characters",
				"afterReserve",
			],
			body: [
				'const text: string = "42.5"',
				"export const integer = text.parseInteger()",
				"export const float32Value = text.parseFloat32()",
				"export const float64Value = text.parseFloat64()",
				"export const bytes = text.toByteArray()",
				"export const characters = text.toCharacterArray()",
				"text.reserveCapacity(64)",
				"export const afterReserve = text.length()",
			].join("\n"),
		},
		{
			label: "array methods chain through the conversion return types",
			probes: ["byteLength", "terminator"],
			expressionProbes: [
				{
					source: "text.toByteArray().length()",
					nodeType: AST_NODE.callExpression,
				},
				{
					source: "text.toCharacterArray()[1]",
					nodeType: AST_NODE.indexExpression,
				},
			],
			body: [
				'const text: string = "AB"',
				"export const byteLength = text.toByteArray().length()",
				"export const terminator = text.toCharacterArray()[1]",
			].join("\n"),
		},
		{
			label: "conversion methods inside nested if blocks produce no diagnostics",
			probes: ["nested"],
			body: [
				"const convert = (text: string, flag: boolean): i32 => {",
				"    if (flag) {",
				"        if (text.length() > 0) {",
				'            const bytes = text.toByteArray()',
				'            const characters = text.toCharacterArray()',
				"            text.reserveCapacity(8)",
				"            return text.parseInteger() + bytes.length() + characters.length()",
				"        }",
				"    }",
				"    return 0",
				"}",
				'const source: string = "42"',
				"export const nested = convert(source, true)",
			].join("\n"),
		},
		{
			label: "wrong argument count on reserveCapacity reports the arity",
			probes: ["reserved"],
			body: [
				'const text: string = "Hello"',
				"export const reserved = text.reserveCapacity()",
			].join("\n"),
		},
		{
			label: "non-u16 capacity argument reports a type mismatch",
			probes: ["reserved"],
			body: [
				'const text: string = "Hello"',
				'export const reserved = text.reserveCapacity("large")',
			].join("\n"),
		},
	];

	const header = [
		"// Read-only string API (index access, slicing, search, prefix/suffix and",
		"// equality). Types come from the shared STRING_METHODS table; diagnostics",
		"// come from the same check() the language server runs, including nested",
		"// blocks so arity/type reporting is verified where it is easy to miss.",
		"",
	];

	return `${header.join("\n")}${cases.map(renderCase).join("\n")}`;
};

export const listStringMethodsSnapshots = () => {
	return listSnapshots("string-methods.txt", buildReport());
};

export const writeStringMethodsSnapshots = () => {
	writeSnapshots(listStringMethodsSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeStringMethodsSnapshots();
	console.log("Generated string-methods.txt");
}
