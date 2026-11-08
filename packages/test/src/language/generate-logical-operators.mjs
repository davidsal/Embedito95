import { SEVERITY } from "embedito95-core";
import {
	buildSnapshotReport,
	checkSource,
	createLibraries,
	isMainModule,
	listSnapshots,
	PLATFORM_TYPES,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const DHT22_PACKAGE = "@embedito95/dht22";

const LIBRARIES = createLibraries({
	platformTypes: new Set([...PLATFORM_TYPES, "string", "char"]),
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
	const codes = [
		...new Set(
			errors
				.filter((error) => {
					return (error.severity ?? SEVERITY.error) === SEVERITY.error;
				})
				.map((error) => {
					return error.code;
				}),
		),
	].sort();
	return [
		`// ${description}`,
		`errors: ${codes.length === 0 ? "none" : codes.join(", ")}`,
		"",
	].join("\n");
};

const buildReport = () => {
	const cases = [
		{
			description: "x ?? y -> ok",
			body: ["const x = sensor.getTemperature()", "const y = x ?? 0.0"],
		},
		{
			description: "x || y -> ok",
			body: ["const x = sensor.getTemperature()", "const y = x || 0.0"],
		},
		{
			description: "x && y -> ok",
			body: ["const x = sensor.getTemperature()", "const y = x && 0.0"],
		},
		{
			description: "if (x) with nullable x -> ok",
			body: [
				"const x = sensor.getTemperature()",
				"const f = () => { if (x) { sensor.getValue() } }",
			],
		},
		{
			description: "if (!x) with nullable x -> ok",
			body: [
				"const x = sensor.getTemperature()",
				"const f = () => { if (!x) { sensor.getValue() } }",
			],
		},
		{
			description: "if (x && y) with nullable operands -> ok",
			body: [
				"const x = sensor.getTemperature()",
				"const y = sensor.getTemperature()",
				"const f = () => { if (x && y) { sensor.getValue() } }",
			],
		},
		{
			description: "narrowing in the RHS of && -> ok",
			body: [
				"const x = sensor.getTemperature()",
				"const f = () => { if (x != null && x > 10.0) { sensor.getValue() } }",
			],
		},
		{
			description: "chained x ?? y ?? z -> ok",
			body: [
				"const x = sensor.getTemperature()",
				"const y = x ?? 0.0 ?? 1.0",
			],
		},
		{
			description: "mixing ?? with || -> mixedLogicalOperators",
			body: [
				"const x = sensor.getTemperature()",
				"const y = x ?? 0.0 || 1.0",
			],
		},
		{
			description: "incompatible ?? operands -> logicalTypeMismatch",
			body: ["const a = 1", `const b = "s"`, "const c = a ?? b"],
		},
		{
			description: "x ?? y assigned to f32 -> ok",
			body: [
				"const x = sensor.getTemperature()",
				"const y: f32 = x ?? 0.0",
			],
		},
		{
			description: "nullable x assigned to f32 (control) -> assignmentTypeMismatch",
			body: ["const x = sensor.getTemperature()", "const y: f32 = x"],
		},
	];

	const header = [
		"// Nullable truthiness and ?? / || / && (Issue: falsy/truthy ADR).",
		"// Reports the error codes raised for each snippet.",
		"",
	];

	return buildSnapshotReport(header, cases, renderCase);
};

export const listLogicalOperatorSnapshots = () => {
	return listSnapshots("logical-operators.txt", buildReport());
};

export const writeLogicalOperatorSnapshots = () => {
	writeSnapshots(listLogicalOperatorSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeLogicalOperatorSnapshots();
	console.log("Generated logical-operators.txt");
}
