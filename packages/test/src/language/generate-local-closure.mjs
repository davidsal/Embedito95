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

const WRITER_TYPES = [
	"type Writer = {",
	"    write: (value: i16) => void",
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
			label:
				"local closure returned by reference hovers and reports no diagnostics",
			probes: ["writer", "screen"],
			expressionProbes: [
				{ source: "getScreen(writer)", nodeType: AST_NODE.callExpression },
			],
			body: [
				...WRITER_TYPES,
				"type Screen = {",
				"    paint: () => void",
				"}",
				"const getScreen = (writer: Writer): Screen => {",
				"    const paint = () => {",
				"        writer.write(1)",
				"    }",
				"    return { paint: paint }",
				"}",
				"const writer: Writer = { write: (value: i16) => {} }",
				"export const screen: Screen = getScreen(writer)",
				"export const call = () => {",
				"    screen.paint()",
				"}",
			].join("\n"),
		},
		{
			label:
				"returned local closure maps the property key to the method name",
			probes: ["mapped"],
			expressionProbes: [
				{
					source: "getMappedScreen(writer)",
					nodeType: AST_NODE.callExpression,
				},
			],
			body: [
				...WRITER_TYPES,
				"type MappedScreen = {",
				"    paint: () => void",
				"}",
				"const getMappedScreen = (writer: Writer): MappedScreen => {",
				"    const doPaint = () => {",
				"        writer.write(2)",
				"    }",
				"    return { paint: doPaint }",
				"}",
				"const writer: Writer = { write: (value: i16) => {} }",
				"export const mapped: MappedScreen = getMappedScreen(writer)",
			].join("\n"),
		},
		{
			label:
				"returned method colliding with a local closure name reports no diagnostics",
			probes: ["collision"],
			expressionProbes: [
				{
					source: "getCollisionScreen(writer)",
					nodeType: AST_NODE.callExpression,
				},
			],
			body: [
				...WRITER_TYPES,
				"type CollisionScreen = {",
				"    paint: () => void",
				"}",
				"const getCollisionScreen = (writer: Writer): CollisionScreen => {",
				"    const paint = () => {",
				"        writer.write(3)",
				"    }",
				"    return { paint: () => { paint() } }",
				"}",
				"const writer: Writer = { write: (value: i16) => {} }",
				"export const collision: CollisionScreen = getCollisionScreen(writer)",
			].join("\n"),
		},
		{
			label:
				"stateless local closure returned by reference reports no diagnostics",
			probes: ["stateless"],
			expressionProbes: [
				{
					source: "getStatelessScreen()",
					nodeType: AST_NODE.callExpression,
				},
			],
			body: [
				"type StatelessScreen = {",
				"    paint: () => void",
				"}",
				"const getStatelessScreen = (): StatelessScreen => {",
				"    const paint = () => {}",
				"    return { paint: paint }",
				"}",
				"export const stateless: StatelessScreen = getStatelessScreen()",
			].join("\n"),
		},
		{
			label:
				"local closure outside a factory reports unsupportedLocalClosure",
			probes: [],
			body: [
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"    const paint = () => {}",
				"    paint()",
				"}",
				"main()",
			].join("\n"),
		},
		{
			label:
				"local closure in a nested block reports unsupportedLocalClosure",
			probes: [],
			body: [
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"    if (true) {",
				"        if (true) {",
				"            const paint = () => {}",
				"            paint()",
				"        }",
				"    }",
				"}",
				"main()",
			].join("\n"),
		},
		{
			label:
				"nested closure property reports unsupportedNestedClosureProperty",
			probes: [],
			body: [
				...WRITER_TYPES,
				"type Inner = {",
				"    paint: () => void",
				"}",
				"type NestedScreen = {",
				"    inner: Inner",
				"}",
				"const getNestedScreen = (writer: Writer): NestedScreen => {",
				"    const paint = () => {",
				"        writer.write(5)",
				"    }",
				"    return { inner: { paint: paint } }",
				"}",
				"const writer: Writer = { write: (value: i16) => {} }",
				"export const nested: NestedScreen = getNestedScreen(writer)",
			].join("\n"),
		},
		{
			label:
				"factory body statement reports unsupportedClosureFactoryStatement",
			probes: [],
			body: [
				...WRITER_TYPES,
				"type BodyScreen = {",
				"    paint: () => void",
				"}",
				"const getBodyScreen = (writer: Writer): BodyScreen => {",
				"    const paint = () => {",
				"        writer.write(6)",
				"    }",
				"    paint()",
				"    return { paint: paint }",
				"}",
				"const writer: Writer = { write: (value: i16) => {} }",
				"export const body: BodyScreen = getBodyScreen(writer)",
			].join("\n"),
		},
		{
			label:
				"uncaptured factory declaration reports unsupportedClosureFactoryLocal",
			probes: [],
			body: [
				"type DeclaredScreen = {",
				"    paint: () => void",
				"}",
				"const readSensor = (): i16 => {",
				"    return 0",
				"}",
				"const getDeclaredScreen = (): DeclaredScreen => {",
				"    const reading: i16 = readSensor()",
				"    return { paint: () => {} }",
				"}",
				"export const declared: DeclaredScreen = getDeclaredScreen()",
			].join("\n"),
		},
		{
			label:
				"factory declaration used only by a captured initializer reports unsupportedClosureFactoryLocal",
			probes: [],
			body: [
				...WRITER_TYPES,
				"type IntermediateScreen = {",
				"    paint: () => void",
				"}",
				"const readSensor = (): i16 => {",
				"    return 0",
				"}",
				"const getIntermediateScreen = (writer: Writer): IntermediateScreen => {",
				"    const reading: i16 = readSensor()",
				"    const readingCopy: i16 = reading",
				"    const paint = () => {",
				"        writer.write(readingCopy)",
				"    }",
				"    return { paint: paint }",
				"}",
				"const writer: Writer = { write: (value: i16) => {} }",
				"export const intermediate: IntermediateScreen = getIntermediateScreen(writer)",
			].join("\n"),
		},
		{
			label:
				"returned method colliding with a stateless local closure name reports no diagnostics",
			probes: [],
			body: [
				"type StatelessCollisionScreen = {",
				"    paint: () => void",
				"}",
				"const getStatelessCollisionScreen = (): StatelessCollisionScreen => {",
				"    const paint = () => {}",
				"    return { paint: () => { paint() } }",
				"}",
				"export const statelessCollision: StatelessCollisionScreen = getStatelessCollisionScreen()",
			].join("\n"),
		},
		{
			label:
				"non-function method property reports assignmentTypeMismatch",
			probes: [],
			body: [
				...WRITER_TYPES,
				"type NumberScreen = {",
				"    paint: () => void",
				"}",
				"const getNumberScreen = (writer: Writer): NumberScreen => {",
				"    const n: i16 = 1",
				"    return { paint: n }",
				"}",
				"const writer: Writer = { write: (value: i16) => {} }",
				"export const numberScreen: NumberScreen = getNumberScreen(writer)",
			].join("\n"),
		},
	];

	const header = [
		"// LSP view of a local closure returned by reference from a factory.",
		"// The checker recognizes the returned identifier as the public method and",
		"// the codegen lowers it once under the property key, so the editor reports",
		"// no diagnostic for the direct, mapped, collision or stateless forms.",
		"// The unsupported forms report an actionable diagnostic (with severity and",
		"// position) instead of reaching the codegen: local closures outside a",
		"// factory or in a nested block, nested closure properties, extra factory",
		"// statements, declarations whose initializer would be dropped, and",
		"// non-function method properties.",
		"",
	];

	return `${header.join("\n")}${cases.map(renderCase).join("\n")}`;
};

export const listLocalClosureSnapshots = () => {
	return listSnapshots("local-closure.txt", buildReport());
};

export const writeLocalClosureSnapshots = () => {
	writeSnapshots(listLocalClosureSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeLocalClosureSnapshots();
	console.log("Generated local-closure.txt");
}
