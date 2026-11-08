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

const DHT22_PACKAGE = "@embedito95/dht22";

const LIBRARIES = createLibraries({
	knownLibraries: new Set([DHT22_PACKAGE]),
	libraryExports: {
		[DHT22_PACKAGE]: new Set(["getSensor"]),
	},
	libraryFunctions: {
		[DHT22_PACKAGE]: {
			getSensor: {
				params: [{ name: "pin", type: "u8" }],
				returnType: "Dht22Sensor",
			},
		},
	},
	libraryObjectTypes: {
		[DHT22_PACKAGE]: {
			Dht22Sensor: {
				methods: {
					getTemperature: { params: [], returnType: "f32 | null" },
					getValue: { params: [], returnType: "f32" },
				},
				fields: {},
			},
		},
	},
});

const SOURCE_HEADER = [
	`import { getSensor } from '${DHT22_PACKAGE}'`,
	`const sensor = getSensor(0)`,
	`const setup = () => {}`,
	`const main = () => { setup() }`,
	`main()`,
	"",
].join("\n");

const renderCase = ({ body, description }) => {
	const source = `${SOURCE_HEADER}${body.join("\n")}\n`;
	const { errors } = checkSource(source, LIBRARIES);
	return renderFlagCase({
		description,
		label: "assignmentTypeMismatch",
		flag: hasErrorCode(errors, ERROR_CODE.assignmentTypeMismatch),
	});
};

const buildReport = () => {
	const cases = [
		{
			description: "declared f32 = f32|null method call -> error",
			body: ["const temperature: f32 = sensor.getTemperature()"],
		},
		{
			description: "declared f32|null = f32|null method call -> ok",
			body: ["const temperature: f32 | null = sensor.getTemperature()"],
		},
		{
			description: "no annotation infers f32|null -> ok",
			body: ["const temperature = sensor.getTemperature()"],
		},
		{
			description: "reassign a let f32 from f32|null method call -> error",
			body: [
				"let temperature: f32 = 0",
				"const reassign = () => { temperature = sensor.getTemperature() }",
			],
		},
		{
			description: "declared f32 = f32 method call (control, non-nullable) -> ok",
			body: ["const temperature: f32 = sensor.getValue()"],
		},
		{
			description: "declared char|null = char literal -> ok",
			body: ["const character: char | null = 'a'"],
		},
		{
			description: "declared string|null = string literal -> ok",
			body: ['const text: string | null = "hi"'],
		},
		{
			description: "declared char|null = null -> ok",
			body: ["const character: char | null = null"],
		},
		{
			description: "declared string|null = null -> ok",
			body: ["const text: string | null = null"],
		},
		{
			description: "declared char|null = string literal -> error",
			body: ['const character: char | null = "hi"'],
		},
		{
			description: "declared i16|null = char literal -> error",
			body: ["const count: i16 | null = 'a'"],
		},
	];

	const header = [
		"// Nullable RHS assigned to a non-nullable target (Issue 1 guard).",
		"// A member call returning 'f32 | null' assigned/declared as 'f32' must emit",
		"// error.assignmentTypeMismatch; nullable or inferred targets must not.",
		"",
	];

	return buildSnapshotReport(header, cases, renderCase);
};

export const listNullableAssignmentsSnapshots = () => {
	return listSnapshots("nullable-assignments.txt", buildReport());
};

export const writeNullableAssignmentsSnapshots = () => {
	writeSnapshots(listNullableAssignmentsSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeNullableAssignmentsSnapshots();
	console.log("Generated nullable-assignments.txt");
}
