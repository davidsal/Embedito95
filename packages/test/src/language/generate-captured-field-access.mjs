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

const COUNTER_FACTORY = [
	"type Counter = {",
	"    value: () => i16",
	"}",
	"const makeCounter = (start: i16): Counter => {",
	"    return { value: () => { return start } }",
	"}",
];

const DATA_FACTORY = [
	"type Config = {",
	"    pin: i16",
	"}",
	"type Bound = {",
	"    readPin: () => i16",
	"}",
	"const makeBound = (config: Config): Bound => {",
	"    return { readPin: () => { return config.pin } }",
	"}",
];

const renderCase = ({ body, description }) => {
	const { errors } = checkSource(`${body.join("\n")}\n`, LIBRARIES);
	return renderFlagCase({
		description,
		label: "capturedFieldAccess",
		flag: hasErrorCode(errors, ERROR_CODE.capturedFieldAccess),
	});
};

const buildReport = () => {
	const cases = [
		{
			description:
				"external READ of a captured field -> capturedFieldAccess error",
			body: [
				...COUNTER_FACTORY,
				"const setup = () => {}",
				"const main = () => {",
				"    const counter: Counter = makeCounter(3)",
				"    const read: i16 = counter.start",
				"}",
				"main()",
			],
		},
		{
			description:
				"external WRITE of a captured field -> capturedFieldAccess error",
			body: [
				...COUNTER_FACTORY,
				"const setup = () => {}",
				"const main = () => {",
				"    const counter: Counter = makeCounter(3)",
				"    counter.start = 9",
				"}",
				"main()",
			],
		},
		{
			description:
				"internal READ of a captured field (bare identifier) -> ok",
			body: [
				...COUNTER_FACTORY,
				"const setup = () => {}",
				"const main = () => {",
				"    const counter: Counter = makeCounter(3)",
				"    const read: i16 = counter.value()",
				"}",
				"main()",
			],
		},
		{
			description: "calling a public method -> ok",
			body: [
				...COUNTER_FACTORY,
				"const setup = () => {}",
				"const main = () => {",
				"    const counter: Counter = makeCounter(3)",
				"    counter.value()",
				"}",
				"main()",
			],
		},
		{
			description:
				"external READ of a captured handle's subfield -> error on the captured field",
			body: [
				...DATA_FACTORY,
				"const setup = () => {}",
				"const main = () => {",
				"    const config: Config = { pin: 7 }",
				"    const bound: Bound = makeBound(config)",
				"    const read: i16 = bound.config.pin",
				"}",
				"main()",
			],
		},
		{
			description:
				"internal READ of a captured handle's subfield -> ok",
			body: [
				...DATA_FACTORY,
				"const setup = () => {}",
				"const main = () => {",
				"    const config: Config = { pin: 7 }",
				"    const bound: Bound = makeBound(config)",
				"    const read: i16 = bound.readPin()",
				"}",
				"main()",
			],
		},
		{
			description: "external READ of a declared field of a data object -> ok",
			body: [
				"type Config = {",
				"    pin: i16",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    const config: Config = { pin: 7 }",
				"    const read: i16 = config.pin",
				"}",
				"main()",
			],
		},
		{
			description:
				"captured name that is ALSO a declared field -> public, not flagged",
			body: [
				"type Pair = {",
				"    x: i16",
				"    getX: () => i16",
				"}",
				"const makePair = (x: i16): Pair => {",
				"    return { x: x, getX: () => { return x } }",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    const pair: Pair = makePair(3)",
				"    const read: i16 = pair.x",
				"}",
				"main()",
			],
		},
		{
			description:
				"STATELESS closure has no captured fields -> external access is not flagged",
			body: [
				"type Handler = {",
				"    onEvent: (value: i16) => void",
				"}",
				"const makeHandler = (): Handler => {",
				"    return { onEvent: (value: i16) => {} }",
				"}",
				"const setup = () => {}",
				"const main = () => {",
				"    const handler: Handler = makeHandler()",
				"    handler.onEvent(1)",
				"}",
				"main()",
			],
		},
	];

	const header = [
		"// A closure's captured variables become private fields of its handle",
		"// struct. Reading or writing one from outside (`instance.field`) must emit",
		"// error.capturedFieldAccess; the closure's own methods use the captured",
		"// name as a bare identifier, and a public method or a declared data field",
		"// must not be flagged.",
		"",
	];

	return buildSnapshotReport(header, cases, renderCase);
};

export const listCapturedFieldAccessSnapshots = () => {
	return listSnapshots("captured-field-access.txt", buildReport());
};

export const writeCapturedFieldAccessSnapshots = () => {
	writeSnapshots(listCapturedFieldAccessSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeCapturedFieldAccessSnapshots();
	console.log("Generated captured-field-access.txt");
}
