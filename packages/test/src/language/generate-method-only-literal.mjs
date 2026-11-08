import { ERROR_CODE } from "embedito95-core";
import {
	buildSnapshotReport,
	checkSource,
	createLibraries,
	hasErrorCode,
	isMainModule,
	listSnapshots,
	renderFlagCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const LIBRARIES = createLibraries();

const renderCase = ({ body, description }) => {
	const { errors } = checkSource(`${body.join("\n")}\n`, LIBRARIES);
	return renderFlagCase({
		description,
		label: "methodOnlyObjectLiteral",
		flag: hasErrorCode(errors, ERROR_CODE.methodOnlyObjectLiteral),
	});
};

const buildReport = () => {
	const cases = [
		{
			description:
				"method-only type built from a STATELESS inline literal -> ok (captureless function)",
			body: [
				"type Adder = {",
				"    add: (left: i16, right: i16) => i16",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    const adder: Adder = { add: (left: i16, right: i16) => { return left + right } }",
				"}",
				"main()",
			],
		},
		{
			description:
				"method-only type built from a CAPTURING inline literal -> methodOnlyObjectLiteral error",
			body: [
				"type Adder = {",
				"    add: (left: i16, right: i16) => i16",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    const offset: i16 = 3",
				"    const adder: Adder = { add: (left: i16, right: i16) => { return left + right + offset } }",
				"}",
				"main()",
			],
		},
		{
			description:
				"method-only type built from named function references -> ok (callback record)",
			body: [
				"type Handler = {",
				"    onEvent: (value: i16) => void",
				"}",
				"const printValue = (value: i16): void => {}",
				"const setup = () => {}",
				"const main = () => {",
				"    const handler: Handler = { onEvent: printValue }",
				"}",
				"main()",
			],
		},
		{
			description:
				"type WITH a field plus an inline method literal -> ok (shared handle)",
			body: [
				"type Point = {",
				"    x: i16",
				"    y: i16",
				"    sum: () => i16",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    const point: Point = { x: 1, y: 2, sum: () => { return this.x + this.y } }",
				"}",
				"main()",
			],
		},
		{
			description:
				"method-only type built by a FACTORY with inline methods -> ok (closure)",
			body: [
				"type Handler = {",
				"    onEvent: (value: i16) => void",
				"}",
				"const makeHandler = (): Handler => {",
				"    return { onEvent: (value: i16) => {} }",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    const handler = makeHandler()",
				"}",
				"main()",
			],
		},
	];

	const header = [
		"// A method-only type (methods, no data fields) is a callback record: its",
		"// value struct holds function POINTERS. An inline method is allowed when it",
		"// captures no enclosing state (it lowers to a captureless function); a method",
		"// that captures a local would need a closure and must emit",
		"// error.methodOnlyObjectLiteral. Referencing a named function, adding a data",
		"// field, or building the object with a factory must not error.",
		"",
	];

	return buildSnapshotReport(header, cases, renderCase);
};

export const listMethodOnlyLiteralSnapshots = () => {
	return listSnapshots("method-only-literal.txt", buildReport());
};

export const writeMethodOnlyLiteralSnapshots = () => {
	writeSnapshots(listMethodOnlyLiteralSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeMethodOnlyLiteralSnapshots();
	console.log("Generated method-only-literal.txt");
}
