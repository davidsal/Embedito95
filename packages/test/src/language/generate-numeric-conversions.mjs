// Snapshot of the numeric conversion rule (arguments, constants and `let`) and
// of overload resolution by parameter types. The library is synthetic so the
// snapshot does not depend on `math` shipping its `f32`/`f64` overloads yet.
import {
	buildLibraryFunctionDefinitions,
	resolveDefinitionReturnType,
} from "embedito95-core";
import {
	createLibraries,
	isMainModule,
	listSnapshots,
	renderLibraryCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const NUMERIC_PACKAGE = "@test/numeric";

const FLOAT32_SIGNATURE = {
	params: [{ name: "value", type: "f32", defaultValue: null }],
	returnType: "f32",
};
const FLOAT64_SIGNATURE = {
	params: [{ name: "value", type: "f64", defaultValue: null }],
	returnType: "f64",
};
const INTEGER_SIGNATURE = {
	params: [{ name: "value", type: "i32", defaultValue: null }],
	returnType: "i32",
};

const LIBRARY_FUNCTIONS = {
	[NUMERIC_PACKAGE]: {
		scale: {
			params: FLOAT32_SIGNATURE.params,
			returnType: FLOAT32_SIGNATURE.returnType,
			signatures: [FLOAT32_SIGNATURE, FLOAT64_SIGNATURE],
		},
		onlyFloat: {
			params: FLOAT32_SIGNATURE.params,
			returnType: FLOAT32_SIGNATURE.returnType,
			signatures: [FLOAT32_SIGNATURE],
		},
		narrow: {
			params: INTEGER_SIGNATURE.params,
			returnType: INTEGER_SIGNATURE.returnType,
			signatures: [INTEGER_SIGNATURE],
		},
	},
};

const buildContext = () => {
	const definitions = buildLibraryFunctionDefinitions(LIBRARY_FUNCTIONS);
	return {
		libraries: createLibraries({
			isLibrary: true,
			knownLibraries: new Set([NUMERIC_PACKAGE]),
			libraryExports: {
				[NUMERIC_PACKAGE]: new Set(["scale", "onlyFloat", "narrow"]),
			},
			libraryFunctions: LIBRARY_FUNCTIONS,
		}),
		resolveLibraryCallType: (name, argumentTypes) => {
			return resolveDefinitionReturnType(definitions[name], argumentTypes);
		},
		objectTypes: {},
	};
};

const buildReport = () => {
	const context = buildContext();
	const cases = [
		{
			label: "an f64 argument keeps the f64 overload and emits no warning",
			probes: ["scaled"],
			body: `import { scale } from '@test/numeric'
const value: f64 = 1.5
export const scaled = scale(value)`,
		},
		{
			label: "an integer literal resolves the f32 overload",
			probes: ["scaled"],
			body: `import { scale } from '@test/numeric'
export const scaled = scale(2)`,
		},
		{
			label: "f64 into an f32 context converts silently; the hover explains the precision loss",
			probes: ["scaled"],
			body: `import { scale } from '@test/numeric'
const value: f64 = 1.5
export const scaled: f32 = scale(value)`,
		},
		{
			label: "u32 * i16 does not fit f32 and selects the f64 overload",
			probes: ["scaled"],
			body: `import { scale } from '@test/numeric'
const wide: u32 = 70000
const small: i16 = 2
export const scaled = scale(wide * small)`,
		},
		{
			label: "u64 into an i32 parameter converts silently but keeps the declared type",
			probes: ["narrowed"],
			body: `import { narrow } from '@test/numeric'
const wide: u64 = 5
export const narrowed = narrow(wide)`,
		},
		{
			label: "i32 into an f32 parameter converts silently; the hover explains the range loss",
			probes: ["converted"],
			body: `import { onlyFloat } from '@test/numeric'
const whole: i32 = 1
export const converted = onlyFloat(whole)`,
		},
		{
			label: "i8 into an f32 parameter fits exactly and stays silent",
			probes: ["converted"],
			body: `import { onlyFloat } from '@test/numeric'
const small: i8 = 1
export const converted = onlyFloat(small)`,
		},
	];

	const header = [
		"// Numeric conversion rule for arguments/constants/let and overload",
		"// resolution by parameter types. Numeric conversions are implicit (auto cast",
		"// with truncation); none of them is reported as a diagnostic, the hover",
		"// explains the possible loss.",
		"",
	];

	return `${header.join("\n")}${cases
		.map((testCase) => {
			return renderLibraryCase(testCase, context);
		})
		.join("\n")}`;
};

export const listNumericConversionSnapshots = () => {
	return listSnapshots("numeric-conversions.txt", buildReport());
};

export const writeNumericConversionSnapshots = () => {
	writeSnapshots(listNumericConversionSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeNumericConversionSnapshots();
	console.log("Generated numeric-conversions.txt");
}
