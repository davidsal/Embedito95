import { join } from "node:path";
import {
	CORE_LIBRARY_DIRECTORY,
	isMainModule,
	listSnapshots,
	readLibraryContext,
	renderLibraryCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const MATH_PACKAGE = "@embedito95/math";
const MATH_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "math", "main.e95");

const buildReport = () => {
	const context = readLibraryContext({
		libraryPath: MATH_LIBRARY_PATH,
		packageName: MATH_PACKAGE,
	});
	const cases = [
		{
			label: "integer and bit helpers infer their declared types",
			probes: ["integerResult", "clamped", "smallest", "bitResult"],
			body: `import { interpolateRange, clamp, minimum, setBitValue } from '@embedito95/math'
export const integerResult = interpolateRange(5, 0, 10, 0, 100)
export const clamped = clamp(150, 0, 100)
export const smallest = minimum(3, 8)
export const bitResult = setBitValue(10, 3)`,
		},
		{
			label: "float helpers infer f32",
			probes: ["remapped", "root", "rounded", "radians"],
			body: `import { interpolateRangeFloat, squareRoot, roundNearest, toRadians } from '@embedito95/math'
export const remapped = interpolateRangeFloat(5.0, 0.0, 10.0, 0.0, 100.0)
export const root = squareRoot(16.0)
export const rounded = roundNearest(3.5)
export const radians = toRadians(180.0)`,
		},
		{
			label: "bit read infers boolean",
			probes: ["flag"],
			body: `import { readBitValue } from '@embedito95/math'
export const flag = readBitValue(10, 1)`,
		},
		{
			label: "inverse trigonometry, logarithms and exponentials infer f32",
			probes: ["angle", "arc", "natural", "decimal", "raised"],
			body: `import { arcSine, arcTangent2, naturalLog, logarithm10, exponential } from '@embedito95/math'
export const angle = arcSine(0.5)
export const arc = arcTangent2(1.0, -1.0)
export const natural = naturalLog(2.0)
export const decimal = logarithm10(100.0)
export const raised = exponential(1.0)`,
		},
		{
			label: "square, remainder and truncate infer f32",
			probes: ["squared", "remainder", "whole"],
			body: `import { square, remainderFloat, truncate } from '@embedito95/math'
export const squared = square(4.0)
export const remainder = remainderFloat(5.5, 2.0)
export const whole = truncate(3.9)`,
		},
		{
			label: "byte helpers infer u8 and bitMask infers u32",
			probes: ["low", "high", "mask"],
			body: `import { lowByteValue, highByteValue, bitMask } from '@embedito95/math'
export const low = lowByteValue(43981)
export const high = highByteValue(43981)
export const mask = bitMask(7)`,
		},
		{
			label: "nested math calls inside nested conditionals produce no diagnostics",
			probes: ["nested"],
			body: `import { clamp, minimum } from '@embedito95/math'
export const choose = (value: i32) => {
    if (value > 0) {
        if (value > 10) {
            return clamp(value, 0, 10)
        }
        return minimum(value, 10)
    }
    return 0
}
export const nested = choose(5)`,
		},
		{
			label: "wrong argument count reported",
			probes: ["badCount"],
			body: `import { setBitValue } from '@embedito95/math'
export const badCount = setBitValue(10)`,
		},
		{
			label: "unknown export reported and left unresolved",
			probes: ["missing"],
			body: `import { notExported } from '@embedito95/math'
export const missing = notExported`,
		},
		{
			label: "wider integer argument warns on a u8 parameter",
			probes: ["widened"],
			body: `import { setBitValue } from '@embedito95/math'
export const wideIndex: i32 = 3
export const widened = setBitValue(10, wideIndex)`,
		},
		{
			label: "non-numeric argument reported",
			probes: ["badType"],
			body: `import { interpolateRange } from '@embedito95/math'
export const badType = interpolateRange("ten", 0, 10, 0, 100)`,
		},
		{
			label: "arity of arcTangent2 reported",
			probes: ["badArity"],
			body: `import { arcTangent2 } from '@embedito95/math'
export const badArity = arcTangent2(1.0)`,
		},
		{
			label: "integer argument warns on an f32 parameter",
			probes: ["integerAngle"],
			body: `import { arcSine } from '@embedito95/math'
const wholeNumber: i32 = 1
export const integerAngle = arcSine(wholeNumber)`,
		},
		{
			label: "nested inverse trigonometry calls produce no diagnostics",
			probes: ["nestedAngle"],
			body: `import { arcSine, logarithm10 } from '@embedito95/math'
export const chooseAngle = (value: f32) => {
    if (value > 0.0) {
        if (value > 1.0) {
            return logarithm10(value)
        }
        return arcSine(value)
    }
    return 0.0
}
export const nestedAngle = chooseAngle(0.5)`,
		},
	];

	const header = [
		"// LSP view of the `math` core library (hover types + diagnostics).",
		"// Each case is a library-style program (isLibrary) whose probes are",
		"// exported, so unused-declaration noise is suppressed. Types come from",
		"// resolveProjectTypes (the same inference the language server uses for",
		"// hover), reading the real core/math/main.e95 through",
		"// collectLibraryModuleInfo. Diagnostics come from the shared check().",
		"",
	];

	return `${header.join("\n")}${cases
		.map((testCase) => {
			return renderLibraryCase(testCase, context);
		})
		.join("\n")}`;
};

export const listMathLibrarySnapshots = () => {
	return listSnapshots("math-library.txt", buildReport());
};

export const writeMathLibrarySnapshots = () => {
	writeSnapshots(listMathLibrarySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeMathLibrarySnapshots();
	console.log("Generated math-library.txt");
}
