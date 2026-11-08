import { parse, tokenize } from "embedito95-core";
import {
	buildSnapshotReport,
	isMainModule,
	listSnapshots,
	renderDiagnostic,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const PROGRAM_TAIL = [
	"const setup = () => {}",
	"const main = () => { setup() }",
	"main()",
];

const renderCase = ({ body, description }) => {
	const source = [...body, ...PROGRAM_TAIL].join("\n");
	const { tokens, errors: lexErrors } = tokenize(source);
	const parseErrors = lexErrors.length > 0 ? [] : parse(tokens).errors;
	const diagnostics = [...lexErrors, ...parseErrors].map(renderDiagnostic);
	return [
		`// ${description}`,
		"diagnostics:",
		...(diagnostics.length > 0
			? diagnostics.map((diagnostic) => {
					return `- ${diagnostic}`;
				})
			: ["- none"]),
		"",
	].join("\n");
};

const buildReport = () => {
	const cases = [
		{
			description: "a === b in a variable initializer -> strictEquality",
			body: [
				"const a = 1",
				"const b = 2",
				"const c = a === b",
			],
		},
		{
			description: "a !== b in a variable initializer -> strictEquality",
			body: [
				"const a = 1",
				"const b = 2",
				"const c = a !== b",
			],
		},
		{
			description: "a === b nested in if inside if -> strictEquality",
			body: [
				"const a = 1",
				"const b = 2",
				"const check = (): boolean => {",
				"    if (a == b) {",
				"        if (a === b) {",
				"            return true",
				"        }",
				"    }",
				"    return false",
				"}",
			],
		},
		{
			description: "== and != stay accepted",
			body: [
				"const a = 1",
				"const b = 2",
				"const c = a == b",
				"const d = a != b",
			],
		},
		{
			description: "single = assignment stays accepted",
			body: ["const a = 1", "const b = a"],
		},
		{
			description: "=== and !== inside strings and comments are ignored",
			body: [
				"const a = 1",
				"const text = 'a === b'",
				'const other = "a !== b"',
				"// a === b",
				"/* a !== b */",
			],
		},
	];

	const header = [
		"// Rejects strict equality operators (=== and !==) with a parse diagnostic.",
		"// The message points at == / != and states strict equality is not part of",
		"// e95; the rest of the expression is no longer dropped silently.",
		"",
	];

	return buildSnapshotReport(header, cases, renderCase);
};

export const listStrictEqualitySnapshots = () => {
	return listSnapshots("strict-equality.txt", buildReport());
};

export const writeStrictEqualitySnapshots = () => {
	writeSnapshots(listStrictEqualitySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeStrictEqualitySnapshots();
	console.log("Generated strict-equality.txt");
}
