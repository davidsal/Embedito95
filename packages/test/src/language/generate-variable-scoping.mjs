import { collectVariableTypes, resolveWordDataType } from "embedito95-core";
import {
	collectProbes,
	isMainModule,
	listSnapshots,
	parseSource,
	resolveNoCallType,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const WORD_SIZE = 16;

const PROGRAM_FOOTER = `const setup = () => {}
const main = () => { setup() }
main()`;

const renderCase = (testCase) => {
	const source = `${testCase.body}\n${PROGRAM_FOOTER}`;
	const { ast } = parseSource(source);
	const variableTypes = collectVariableTypes(
		ast,
		resolveWordDataType(WORD_SIZE),
		resolveNoCallType,
		WORD_SIZE,
	);

	const lines = collectProbes(ast, new Set(testCase.probes)).map((probe) => {
		const type =
			variableTypes.resolve(probe.name, probe.location) ?? "unresolved";
		const position = `${probe.location.start.line}:${probe.location.start.column}`;
		return `${probe.name} @ ${position} => ${type}`;
	});

	return [`// ${testCase.label}`, ...lines, ""].join("\n");
};

const buildReport = () => {
	const cases = [
		{
			label: "same local name in two functions keeps its own type",
			probes: ["value"],
			body: `const readByte = () => {
    let value: u8 = 0
    return value
}
const readSensor = () => {
    let value: i32 = 0
    return value
}`,
		},
		{
			label: "same parameter name in two functions keeps its own type",
			probes: ["value", "result"],
			body: `const widen = (value: u8) => {
    const result: i32 = value as i32
    return result
}
const narrow = (value: i32) => {
    const result: u8 = value as u8
    return result
}`,
		},
		{
			label: "same name in sibling blocks resolves per block",
			probes: ["value"],
			body: `const pick = (flag: boolean) => {
    if (flag) {
        let value: u8 = 1
        return value
    }
    if (flag) {
        let value: i32 = 2
        return value
    }
    return 0
}`,
		},
		{
			label: "parameter and local of the same name in different functions",
			probes: ["value"],
			body: `const fromParameter = (value: u8) => {
    return value
}
const fromLocal = () => {
    let value: i32 = 0
    return value
}`,
		},
	];

	const header = [
		"// Variable type resolution by scope (collectVariableTypes.resolve)",
		"// Each probe lists the resolved type at that identifier's location.",
		"// Before the scope-aware fix the flat name map let the last declaration",
		"// win, so a local in one function leaked its type into same-named locals",
		"// of other functions. These cases pin the per-scope resolution.",
		"",
	];

	return `${header.join("\n")}${cases.map(renderCase).join("\n")}`;
};

export const listVariableScopingSnapshots = () => {
	return listSnapshots("variable-scoping.txt", buildReport());
};

export const writeVariableScopingSnapshots = () => {
	writeSnapshots(listVariableScopingSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeVariableScopingSnapshots();
	console.log("Generated variable-scoping.txt");
}
