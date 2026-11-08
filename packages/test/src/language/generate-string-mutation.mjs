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
			label: "string mutators infer their declared return types",
			probes: ["result"],
			body: [
				'const mutate = (text: string): boolean => {',
				"    text.setCharacter(0, 'x')",
				'    text.appendText("!")',
				"    text.trimWhitespace()",
				"    text.toUpperCase()",
				"    text.toLowerCase()",
				"    text.removeRange(0, 1)",
				'    return text.replaceText("a", "b")',
				"}",
				'export const result = mutate(" Hello ")',
			].join("\n"),
		},
		{
			label: "string mutators inside nested if blocks produce no diagnostics",
			probes: ["nested"],
			body: [
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
			].join("\n"),
		},
		{
			label: "wrong argument count on a string mutator reports the arity",
			probes: ["badCount"],
			body: [
				'const text: string = "Hello"',
				"export const badCount = text.setCharacter(1)",
			].join("\n"),
		},
		{
			label: "wrong argument count on a nested string mutator reports the arity",
			probes: ["nested"],
			body: [
				"const mutate = (text: string, flag: boolean): boolean => {",
				"    if (flag) {",
				'        if (text.hasPrefix("He")) {',
				'            return text.replaceText("l")',
				"        }",
				"    }",
				"    return false",
				"}",
				'export const nested = mutate("Hello", true)',
			].join("\n"),
		},
		{
			label: "non-character value reports a type mismatch on setCharacter",
			probes: ["badType"],
			body: [
				'const text: string = "Hello"',
				"export const badType = text.setCharacter(0, 1)",
			].join("\n"),
		},
		{
			label: "non-string search argument reports a type mismatch on replaceText",
			probes: ["badReplacement"],
			body: [
				'const text: string = "Hello"',
				'export const badReplacement = text.replaceText("l", 1)',
			].join("\n"),
		},
		{
			label: "chained mutator return type flows into the next call",
			probes: [],
			expressionProbes: [
				{
					source: 'text.replaceText("l", "L")',
					nodeType: AST_NODE.callExpression,
				},
			],
			body: [
				'const text: string = "Hello"',
				'export const replaced = text.replaceText("l", "L")',
			].join("\n"),
		},
	];

	const header = [
		"// String mutation API (character writes, append, replace, range removal,",
		"// trimming and ASCII case folding). Types come from the shared",
		"// STRING_METHODS table; diagnostics come from the same check() the language",
		"// server runs, including nested blocks so arity/type reporting is verified",
		"// where it is easy to miss.",
		"",
	];

	return `${header.join("\n")}${cases.map(renderCase).join("\n")}`;
};

export const listStringMutationSnapshots = () => {
	return listSnapshots("string-mutation.txt", buildReport());
};

export const writeStringMutationSnapshots = () => {
	writeSnapshots(listStringMutationSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeStringMutationSnapshots();
	console.log("Generated string-mutation.txt");
}
