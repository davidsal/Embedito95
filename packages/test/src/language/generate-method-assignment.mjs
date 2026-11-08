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

const LIBRARIES = createLibraries({
	knownLibraries: new Set(["embedito95/demo"]),
	libraryObjectTypes: {
		"embedito95/demo": {
			Sensor: {
				fields: {},
				methods: {
					getTemperature: {
						returnType: "f32 | null",
						params: [],
					},
				},
			},
			DataObject: {
				fields: { value: { type: "i16", optional: false } },
				methods: {},
			},
		},
	},
});

const renderCase = ({ body, description }) => {
	const { errors } = checkSource(`${body.join("\n")}\n`, LIBRARIES);
	return renderFlagCase({
		description,
		label: "methodAssignment",
		flag: hasErrorCode(errors, ERROR_CODE.methodAssignment),
	});
};

const buildReport = () => {
	const cases = [
		{
			description:
				"reassign a library closure method -> methodAssignment error",
			body: [
				"import { Sensor } from '@embedito95/demo'",
				"const setup = () => {}",
				"const main = (sensor: Sensor) => {",
				"    sensor.getTemperature = (): f32 | null => {",
				"        return 12.5",
				"    }",
				"}",
				"setup()",
				"main({})",
			],
		},
		{
			description:
				"reassign a local callback-record slot -> ok (function-pointer member)",
			body: [
				"type Handler = {",
				"    onEvent: (value: i16) => void",
				"}",
				"const first = (value: i16) => {}",
				"const second = (value: i16) => {}",
				"const setup = () => {}",
				"const main = () => {",
				"    const handler: Handler = { onEvent: first }",
				"    handler.onEvent = second",
				"}",
				"setup()",
				"main()",
			],
		},
		{
			description: "assign a writable data-object field -> ok",
			body: [
				"import { DataObject } from '@embedito95/demo'",
				"const setup = () => {}",
				"const main = (item: DataObject) => {",
				"    item.value = 5",
				"}",
				"setup()",
				"main({})",
			],
		},
		{
			description: "reassign a plain variable -> ok (not a method)",
			body: [
				"const setup = () => {}",
				"const main = () => {",
				"    let amount: i16 = 0",
				"    amount = 7",
				"}",
				"setup()",
				"main()",
			],
		},
	];

	const header = [
		"// Methods of a closure compile to C++ free functions over the shared",
		"// `Object<T>` handle; there is no per-instance slot to overwrite (unlike TS),",
		"// so assigning to one must emit error.methodAssignment. A LOCAL CALLBACK",
		"// RECORD (0 fields, >=1 method) is the exception: its methods are",
		"// function-pointer members, so reassigning the slot is allowed. Assigning a",
		"// data-object FIELD, or a plain variable, must not error.",
		"",
	];

	return buildSnapshotReport(header, cases, renderCase);
};

export const listMethodAssignmentSnapshots = () => {
	return listSnapshots("method-assignment.txt", buildReport());
};

export const writeMethodAssignmentSnapshots = () => {
	writeSnapshots(listMethodAssignmentSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeMethodAssignmentSnapshots();
	console.log("Generated method-assignment.txt");
}
