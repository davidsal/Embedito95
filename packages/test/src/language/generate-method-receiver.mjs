import {
	AST_NODE,
	collectClosureCapturedFieldTypes,
	collectLibraryModuleInfo,
} from "embedito95-core";
import {
	createLibraries,
	isMainModule,
	listSnapshots,
	parseSource,
	renderLibraryCase,
	resolveNoCallType,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const LIBRARIES = createLibraries({ isLibrary: true });

const COUNTER_TYPES = [
	"type Counter = {",
	"    value: () => i16",
	"}",
	"const makeCounter = (start: i16): Counter => {",
	"    return {",
	"        value: () => {",
	"            return start",
	"        }",
	"    }",
	"}",
];

const BOX_TYPES = [
	"type Box = {",
	"    counter: Counter",
	"}",
];

const collectLocalObjectTypes = (source, ast) => {
	const objectTypes = collectLibraryModuleInfo(source, "local").objectTypes;
	for (const [typeName, capturedFieldTypes] of collectClosureCapturedFieldTypes(
		ast,
		objectTypes,
	)) {
		if (objectTypes[typeName]) {
			objectTypes[typeName].capturedFieldTypes = capturedFieldTypes;
		}
	}
	return objectTypes;
};

const renderCase = (testCase) => {
	const source = `${testCase.body}\n`;
	const { ast } = parseSource(source);
	return renderLibraryCase(testCase, {
		libraries: LIBRARIES,
		resolveLibraryCallType: resolveNoCallType,
		objectTypes: collectLocalObjectTypes(source, ast),
	});
};

const buildReport = () => {
	const cases = [
		{
			label: "an identifier receiver hovers as the handle type",
			probes: ["counter"],
			body: [...COUNTER_TYPES, "export const counter = makeCounter(3)"].join(
				"\n",
			),
		},
		{
			label: "identifier receiver keeps the free method call and infers i16",
			probes: ["result"],
			body: [
				...COUNTER_TYPES,
				"const counter = makeCounter(3)",
				"export const result = counter.value()",
			].join("\n"),
		},
		{
			label:
				"captured handle inside a closure calls the free method without diagnostics",
			probes: ["result"],
			body: [
				...COUNTER_TYPES,
				"type Reader = {",
				"    read: () => i16",
				"}",
				"const makeReader = (counter: Counter): Reader => {",
				"    return {",
				"        read: () => {",
				"            return counter.value()",
				"        }",
				"    }",
				"}",
				"const read = (): i16 => {",
				"    const reader: Reader = makeReader(makeCounter(3))",
				"    return reader.read()",
				"}",
				"export const result = read()",
			].join("\n"),
		},
		{
			label: "a nested field receiver hovers as the handle type",
			probes: ["box"],
			expressionProbes: [
				{ source: "box.counter", nodeType: AST_NODE.memberExpression },
			],
			body: [
				...COUNTER_TYPES,
				...BOX_TYPES,
				"export const box: Box = { counter: makeCounter(3) }",
				"export const value = box.counter.value()",
			].join("\n"),
		},
		{
			label:
				"nested field receiver resolves the handle type and infers the method result",
			probes: ["result"],
			body: [
				...COUNTER_TYPES,
				...BOX_TYPES,
				"const readBox = (): i16 => {",
				"    const box: Box = { counter: makeCounter(3) }",
				"    return box.counter.value()",
				"}",
				"export const result = readBox()",
			].join("\n"),
		},
		{
			label: "call result receiver resolves the factory return type",
			probes: ["result"],
			expressionProbes: [
				{ source: "makeCounter(5)", nodeType: AST_NODE.callExpression },
				{
					source: "makeCounter(5).value()",
					nodeType: AST_NODE.callExpression,
				},
			],
			body: [
				...COUNTER_TYPES,
				"export const result = makeCounter(5).value()",
			].join("\n"),
		},
		{
			label:
				"a this field in a closure factory hovers as the captured handle type",
			probes: ["screen"],
			expressionProbes: [
				{
					source: "this.writer",
					nodeType: AST_NODE.memberExpression,
				},
			],
			body: [
				"type Writer = {",
				"    send: (value: i16) => void",
				"}",
				"type Screen = {",
				"    paint: () => void",
				"}",
				"const makeWriter = (): Writer => {",
				"    let total: i16 = 0",
				"    return {",
				"        send: (value: i16) => { total = (total + value) as i16 }",
				"    }",
				"}",
				"const makeScreen = (writer: Writer): Screen => {",
				"    return {",
				"        paint: () => {",
				"            this.writer.send(1)",
				"        }",
				"    }",
				"}",
				"export const screen: Screen = makeScreen(makeWriter())",
			].join("\n"),
		},
		{
			label:
				"unknown method on this field in a closure factory reports undefinedMethod",
			probes: [],
			body: [
				"type Writer = {",
				"    send: (value: i16) => void",
				"}",
				"type Screen = {",
				"    paint: () => void",
				"}",
				"const makeWriter = (): Writer => {",
				"    let total: i16 = 0",
				"    return {",
				"        send: (value: i16) => { total = (total + value) as i16 }",
				"    }",
				"}",
				"const makeScreen = (writer: Writer): Screen => {",
				"    return {",
				"        paint: () => {",
				"            this.writer.missing()",
				"        }",
				"    }",
				"}",
				"export const screen: Screen = makeScreen(makeWriter())",
			].join("\n"),
		},
		{
			label:
				"wrong argument count on this field in a closure factory reports wrongArgumentCount",
			probes: [],
			body: [
				"type Writer = {",
				"    send: (value: i16) => void",
				"}",
				"type Screen = {",
				"    paint: () => void",
				"}",
				"const makeWriter = (): Writer => {",
				"    let total: i16 = 0",
				"    return {",
				"        send: (value: i16) => { total = (total + value) as i16 }",
				"    }",
				"}",
				"const makeScreen = (writer: Writer): Screen => {",
				"    return {",
				"        paint: () => {",
				"            this.writer.send()",
				"        }",
				"    }",
				"}",
				"export const screen: Screen = makeScreen(makeWriter())",
			].join("\n"),
		},
		{
			label:
				"wrong argument type on this field in a closure factory reports argument type error",
			probes: [],
			body: [
				"type Writer = {",
				"    send: (value: i16) => void",
				"}",
				"type Screen = {",
				"    paint: () => void",
				"}",
				"const makeWriter = (): Writer => {",
				"    let total: i16 = 0",
				"    return {",
				"        send: (value: i16) => { total = (total + value) as i16 }",
				"    }",
				"}",
				"const makeScreen = (writer: Writer): Screen => {",
				"    return {",
				"        paint: () => {",
				'            this.writer.send("bad")',
				"        }",
				"    }",
				"}",
				"export const screen: Screen = makeScreen(makeWriter())",
			].join("\n"),
		},
		{
			label:
				"method on a captured primitive this field reports undefinedMethod",
			probes: [],
			body: [
				"type Screen = {",
				"    paint: () => void",
				"}",
				"const makeScreen = (): Screen => {",
				"    let count: i16 = 1",
				"    return {",
				"        paint: () => {",
				"            this.count.value()",
				"        }",
				"    }",
				"}",
				"export const screen: Screen = makeScreen()",
			].join("\n"),
		},
		{
			label:
				"unknown method on this field in a typed object literal reports undefinedMethod",
			probes: [],
			body: [
				...COUNTER_TYPES,
				"type Holder = {",
				"    counter: Counter",
				"    run: () => void",
				"}",
				"const holder: Holder = {",
				"    counter: makeCounter(1),",
				"    run: () => {",
				"        this.counter.missing()",
				"    }",
				"}",
				"export const useHolder = () => {",
				"    holder.run()",
				"}",
			].join("\n"),
		},
		{
			label: "parenthesized receiver resolves the handle type",
			probes: ["result"],
			body: [
				...COUNTER_TYPES,
				"const counter = makeCounter(3)",
				"export const result = (counter).value()",
			].join("\n"),
		},
		{
			label: "conditional receiver resolves when both branches share the type",
			probes: ["result"],
			body: [
				...COUNTER_TYPES,
				"const readChosen = (first: Counter, second: Counter, flag: boolean): i16 => {",
				"    return (flag ? first : second).value()",
				"}",
				"export const result = readChosen(makeCounter(1), makeCounter(2), true)",
			].join("\n"),
		},
		{
			label: "cast receiver resolves to the target handle type",
			probes: ["result"],
			body: [
				...COUNTER_TYPES,
				"export const result = (makeCounter(9) as Counter).value()",
			].join("\n"),
		},
		{
			label:
				"cast to a primitive receiver reports invalidReceiverCast before codegen",
			probes: [],
			body: [
				...COUNTER_TYPES,
				"const readCast = (counter: Counter): i16 => {",
				"    return (counter as i16).value()",
				"}",
				"export const result = readCast(makeCounter(3))",
			].join("\n"),
		},
		{
			label:
				"cast from an incompatible source reports invalidReceiverCast before codegen",
			probes: [],
			body: [
				...COUNTER_TYPES,
				"type Other = {",
				"    other: () => i16",
				"}",
				"const makeOther = (start: i16): Other => {",
				"    return {",
				"        other: () => {",
				"            return start",
				"        }",
				"    }",
				"}",
				"export const result = (makeOther(4) as Counter).value()",
			].join("\n"),
		},
		{
			label:
				"cast to a handle without the method reports undefinedMethod before codegen",
			probes: [],
			body: [
				...COUNTER_TYPES,
				"type Other = {",
				"    other: () => i16",
				"}",
				"const makeOther = (start: i16): Other => {",
				"    return {",
				"        other: () => {",
				"            return start",
				"        }",
				"    }",
				"}",
				"export const result = (makeOther(4) as Other).value()",
			].join("\n"),
		},
		{
			label:
				"a primitive field receiver reports undefinedMethod instead of emitting C++",
			probes: [],
			body: [
				...COUNTER_TYPES,
				"type Box = {",
				"    count: i16",
				"}",
				"const readBox = (box: Box): i16 => {",
				"    return box.count.value()",
				"}",
				"export const result = readBox({ count: 1 })",
			].join("\n"),
		},
		{
			label: "unknown method on a nested field receiver reports undefinedMethod",
			probes: [],
			body: [
				...COUNTER_TYPES,
				...BOX_TYPES,
				"const readBox = (): i16 => {",
				"    const box: Box = { counter: makeCounter(3) }",
				"    return box.counter.missing()",
				"}",
				"export const result = readBox()",
			].join("\n"),
		},
		{
			label: "unknown method on a call receiver reports undefinedMethod",
			probes: [],
			body: [
				...COUNTER_TYPES,
				"export const result = makeCounter(5).missing()",
			].join("\n"),
		},
		{
			label:
				"wrong argument count on a nested field receiver reports wrongArgumentCount",
			probes: [],
			body: [
				"type Accumulator = {",
				"    add: (amount: i16) => i16",
				"}",
				"const makeAccumulator = (start: i16): Accumulator => {",
				"    return {",
				"        add: (amount: i16) => {",
				"            return start + amount",
				"        }",
				"    }",
				"}",
				"type Box = {",
				"    accumulator: Accumulator",
				"}",
				"const readBox = (): i16 => {",
				"    const box: Box = { accumulator: makeAccumulator(3) }",
				"    return box.accumulator.add()",
				"}",
				"export const result = readBox()",
			].join("\n"),
		},
	];

	const header = [
		"// LSP view of method calls on a handle receiver (hover types + diagnostics).",
		"// A receiver may be a name, a captured field, a nested field, a call result,",
		"// a parenthesized handle or a conditional; the checker resolves its type and",
		"// validates the method, so the editor reports the diagnostics before the",
		"// codegen runs. Types come from resolveProjectTypes (the same inference the",
		"// language server uses for hover); diagnostics come from the shared check().",
		"",
	];

	return `${header.join("\n")}${cases.map(renderCase).join("\n")}`;
};

export const listMethodReceiverSnapshots = () => {
	return listSnapshots("method-receiver.txt", buildReport());
};

export const writeMethodReceiverSnapshots = () => {
	writeSnapshots(listMethodReceiverSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeMethodReceiverSnapshots();
	console.log("Generated method-receiver.txt");
}
