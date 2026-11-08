import { ERROR_CODE } from "embedito95-core";
import {
	buildSnapshotReport,
	checkSource,
	createLibraries,
	isMainModule,
	listSnapshots,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const LIBRARIES = createLibraries();

const DEFAULT_CODES = [
	ERROR_CODE.unusedType,
	ERROR_CODE.unusedEnum,
	ERROR_CODE.unusedConstant,
];

const ERROR_CODE_PREFIX = "error.";

const renderCase = ({ body, description, codes = DEFAULT_CODES }) => {
	const { errors } = checkSource(`${body.join("\n")}\n`, LIBRARIES);
	const unused = errors
		.filter((error) => {
			return codes.includes(error.code);
		})
		.map((error) => {
			return `${error.params.name}:${error.code.replace(ERROR_CODE_PREFIX, "")}`;
		})
		.join(", ");
	return [`// ${description}`, `unused: ${unused || "none"}`, ""].join("\n");
};

const buildReport = () => {
	const TYPE_CODES = [ERROR_CODE.unusedType];
	const ENUM_CODES = [ERROR_CODE.unusedEnum];
	const VARIABLE_CODES = [ERROR_CODE.unusedConstant, ERROR_CODE.unusedFunction];

	const cases = [
		{
			description: "type never referenced -> unusedType",
			codes: TYPE_CODES,
			body: [
				"type probando = {",
				"    p1: i8",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"}",
				"main()",
			],
		},
		{
			description: "type used as a variable annotation -> not unused",
			codes: TYPE_CODES,
			body: [
				"type Point = {",
				"    x: i16,",
				"    y: i16",
				"}",
				"const origin: Point = { x: 0, y: 0 }",
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"}",
				"main()",
			],
		},
		{
			description: "type used as an array element -> not unused",
			codes: TYPE_CODES,
			body: [
				"type Point = {",
				"    x: i16,",
				"    y: i16",
				"}",
				"const points: Point[] = []",
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"}",
				"main()",
			],
		},
		{
			description: "type used as a parameter -> not unused",
			codes: TYPE_CODES,
			body: [
				"type Point = {",
				"    x: i16,",
				"    y: i16",
				"}",
				"const move = (p: Point) => {}",
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"}",
				"main()",
			],
		},
		{
			description: "type used as a return type -> not unused",
			codes: TYPE_CODES,
			body: [
				"type Point = {",
				"    x: i16,",
				"    y: i16",
				"}",
				"const make = (): Point => {}",
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"}",
				"main()",
			],
		},
		{
			description: "type used in an 'as' cast -> not unused",
			codes: TYPE_CODES,
			body: [
				"type Point = {",
				"    x: i16,",
				"    y: i16",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"    const p = (0 as Point)",
				"}",
				"main()",
			],
		},
		{
			description: "type only referenced by its own fields -> not unused",
			codes: TYPE_CODES,
			body: [
				"type Node = {",
				"    next: Node",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"}",
				"main()",
			],
		},
		{
			description: "enum never referenced -> unusedEnum",
			codes: ENUM_CODES,
			body: [
				"enum Color { RED, GREEN }",
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"}",
				"main()",
			],
		},
		{
			description: "enum referenced through a member -> not unused",
			codes: ENUM_CODES,
			body: [
				"enum Color { RED, GREEN }",
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"    const c: Color = Color.RED",
				"}",
				"main()",
			],
		},
		{
			description: "unused const and let -> unusedConstant",
			codes: VARIABLE_CODES,
			body: [
				"const FOO = 1",
				"let bar = 2",
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"}",
				"main()",
			],
		},
		{
			description: "unused top-level function -> unusedFunction",
			codes: VARIABLE_CODES,
			body: [
				"const helper = () => {}",
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"}",
				"main()",
			],
		},
		{
			description: "used variable and function -> not unused",
			codes: VARIABLE_CODES,
			body: [
				"const LIMIT = 10",
				"const helper = (value: i16) => value",
				"const setup = () => {}",
				"const main = () => {",
				"    setup()",
				"    setAnalog(9, helper(LIMIT))",
				"}",
				"main()",
			],
		},
	];

	const header = [
		"// Unused declarations. A type alias that no annotation, parameter,",
		"// return type or 'as' cast references emits warning.unusedType; an enum",
		"// that nothing references emits warning.unusedEnum; a top-level or local",
		"// variable/function that nothing references emits warning.unusedConstant/",
		"// unusedFunction. Types referenced from a field (including a self-",
		"// reference) count as used.",
		"",
	];

	return buildSnapshotReport(header, cases, renderCase);
};

export const listUnusedDeclarationSnapshots = () => {
	return listSnapshots("unused-declarations.txt", buildReport());
};

export const writeUnusedDeclarationSnapshots = () => {
	writeSnapshots(listUnusedDeclarationSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeUnusedDeclarationSnapshots();
	console.log("Generated unused-declarations.txt");
}
