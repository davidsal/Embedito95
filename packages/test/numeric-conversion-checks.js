// Codegen/LSP/checker guards for the numeric conversion rule (T-042): overload
// resolution by parameter type, explicit argument casts, non-blocking narrowing
// warnings, and duplicate declarations by signature in core libraries.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	check,
	collectLibraryModuleInfo,
	ERROR_CODE,
	parse,
	resolveDefinitionReturnType,
	SEVERITY,
	shared,
	tokenize,
	UTF8,
} from "embedito95-core";
import { expandWidthFamilySignature } from "../core/src/checker/library-types.js";
import { computeDiagnostics } from "../lsp/src/diagnostics.js";
import { REGISTRY_LIBRARIES_DIRECTORY } from "./constants.js";
import { expectEqual } from "./reporting.js";

const PACKAGE_NAME = "@test/numeric";
const NAMESPACE = "core_numeric";
const WORD_SIZE = 32;
const LSP_WARNING_SEVERITY = 2;

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
const INTEGER64_SIGNATURE = {
	params: [{ name: "value", type: "i64", defaultValue: null }],
	returnType: "i64",
};
const INTEGER_CLAMP_SIGNATURE = {
	params: [
		{ name: "value", type: "i32", defaultValue: null },
		{ name: "minimum", type: "i32", defaultValue: null },
		{ name: "maximum", type: "i32", defaultValue: null },
	],
	returnType: "i32",
};
const INTEGER64_CLAMP_SIGNATURE = {
	params: [
		{ name: "value", type: "i64", defaultValue: null },
		{ name: "minimum", type: "i64", defaultValue: null },
		{ name: "maximum", type: "i64", defaultValue: null },
	],
	returnType: "i64",
};

const FLOAT32_CLAMP_SIGNATURE = {
	params: [
		{ name: "value", type: "f32", defaultValue: null },
		{ name: "minimum", type: "f32", defaultValue: null },
		{ name: "maximum", type: "f32", defaultValue: null },
	],
	returnType: "f32",
};
const FLOAT64_CLAMP_SIGNATURE = {
	params: [
		{ name: "value", type: "f64", defaultValue: null },
		{ name: "minimum", type: "f64", defaultValue: null },
		{ name: "maximum", type: "f64", defaultValue: null },
	],
	returnType: "f64",
};

const LIBRARY_FUNCTIONS = {
	[PACKAGE_NAME]: {
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
		clampThree: {
			params: FLOAT32_CLAMP_SIGNATURE.params,
			returnType: FLOAT32_CLAMP_SIGNATURE.returnType,
			signatures: [FLOAT32_CLAMP_SIGNATURE, FLOAT64_CLAMP_SIGNATURE],
		},
		widen: {
			params: INTEGER64_SIGNATURE.params,
			returnType: INTEGER64_SIGNATURE.returnType,
			signatures: [INTEGER64_SIGNATURE],
		},
		wideClamp: {
			params: INTEGER_CLAMP_SIGNATURE.params,
			returnType: INTEGER_CLAMP_SIGNATURE.returnType,
			signatures: [INTEGER_CLAMP_SIGNATURE, INTEGER64_CLAMP_SIGNATURE],
		},
	},
};

const buildLibraries = (overrides = {}) => {
	return {
		knownLibraries: new Set([PACKAGE_NAME]),
		libraryExports: {
			[PACKAGE_NAME]: new Set([
				"scale",
				"onlyFloat",
				"narrow",
				"clampThree",
				"widen",
				"wideClamp",
			]),
		},
		libraryFunctions: LIBRARY_FUNCTIONS,
		libraryTypes: {},
		libraryEnumInfo: {},
		libraryObjectTypes: {},
		...overrides,
	};
};

const parseSource = (source) => {
	const { tokens } = tokenize(source);
	return parse(tokens, source);
};

const generateProgram = (source) => {
	const { ast } = parseSource(source);
	const generated = shared.generateCode({
		ast,
		sourceLines: source.split("\n"),
		platform: { specs: { wordSize: WORD_SIZE }, float64: "native" },
		libraryFunctions: LIBRARY_FUNCTIONS,
		libraryNamespaces: { [PACKAGE_NAME]: NAMESPACE },
		libraryModules: {},
		mainGenerator: (body) => {
			return String(body);
		},
	});
	return generated.main;
};

const PROGRAM_PREFIX = [
	`import { scale, onlyFloat, narrow } from '${PACKAGE_NAME}'`,
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
].join("\n");

const withProgram = (lines) => {
	return `${PROGRAM_PREFIX}\n${lines.join("\n")}\n}\n`;
};

const checkCodegen = () => {
	const floatProgram = generateProgram(
		withProgram([
			"    const x64: f64 = 1.5",
			"    const x32: f32 = 1.5",
			"    let preserved = scale(x64)",
			"    let narrowed = scale(x32)",
			"    let literal = scale(2)",
			"    let declared: f32 = scale(x64)",
		]),
	);
	const integerProgram = generateProgram(
		`import { narrow, onlyFloat, widen } from '${PACKAGE_NAME}'\n${[
			"const setup = () => {}",
			"const main = () => {",
			"    setup()",
			"    const wide: u64 = 5",
			"    const whole: i32 = 1",
			"    const wide64: i64 = 5",
			"    const unsigned: u32 = 5",
			"    const small: i8 = 1",
			"    const signed32: i32 = 5",
			"    const unsigned32: u32 = 5",
			"    let narrowed = narrow(wide)",
			"    let narrowed64 = narrow(wide64)",
			"    let narrowed32 = narrow(unsigned)",
			"    let floating = onlyFloat(whole)",
			"    let doubled: f64 = whole",
			"    let fits = onlyFloat(small)",
			"    let widenedSigned = widen(signed32)",
			"    let widenedUnsigned = widen(unsigned32)",
			"}",
		].join("\n")}\n`,
	);
	const tieProgram = generateProgram(
		`import { clampThree } from '${PACKAGE_NAME}'\n${[
			"const setup = () => {}",
			"const main = () => {",
			"    setup()",
			"    const x64: f64 = 1.5",
			"    let mixed = clampThree(x64, 1.5, 2.5)",
			"}",
		].join("\n")}\n`,
	);
	const integerWidthProgram = generateProgram(
		`import { wideClamp } from '${PACKAGE_NAME}'\n${[
			"const setup = () => {}",
			"const main = () => {",
			"    setup()",
			"    const big: u32 = 3000000000",
			"    const whole: i32 = 5",
			"    const tiny: u8 = 5",
			"    const wide64: u64 = 5",
			"    const low: i32 = -5",
			"    const high: i32 = 10",
			"    let fromUnsigned = wideClamp(big, 0, 10)",
			"    let fromSigned = wideClamp(whole, 0, 10)",
			"    let fromTiny = wideClamp(tiny, 0, 10)",
			"    let fromWide64 = wideClamp(wide64, 0, 10)",
			"    let fromMixed = wideClamp(big, low, high)",
			"}",
		].join("\n")}\n`,
	);
	const integerLiteralProgram = generateProgram(
		`import { clampThree } from '${PACKAGE_NAME}'\n${[
			"const setup = () => {}",
			"const main = () => {",
			"    setup()",
			"    const x64: f64 = 1.5",
			"    let mixed = clampThree(x64, 0, 3)",
			"    let fallback = clampThree(0, 0, 3)",
			"}",
		].join("\n")}\n`,
	);

	return [
		expectEqual(
			"f64 argument keeps the f64 overload and return type",
			floatProgram.includes("f64 preserved = core_numeric::scale(x64);"),
			true,
		),
		expectEqual(
			"f32 argument keeps the f32 overload",
			floatProgram.includes("f32 narrowed = core_numeric::scale(x32);"),
			true,
		),
		expectEqual(
			"integer literal is cast explicitly for the f32 overload",
			floatProgram.includes("f32 literal = core_numeric::scale((f32)(2.0f));"),
			true,
		),
		expectEqual(
			"f64 result narrowed into f32 gets an explicit cast",
			floatProgram.includes("f32 declared = (f32)(core_numeric::scale(x64));"),
			true,
		),
		expectEqual(
			"u64 into i32 emits an explicit cast",
			integerProgram.includes(
				"i32 narrowed = core_numeric::narrow((i32)(wide));",
			),
			true,
		),
		expectEqual(
			"i32 into f32 emits an explicit cast",
			integerProgram.includes(
				"f32 floating = core_numeric::onlyFloat((f32)(whole));",
			),
			true,
		),
		expectEqual(
			"i64 into i32 emits an explicit cast",
			integerProgram.includes(
				"i32 narrowed64 = core_numeric::narrow((i32)(wide64));",
			),
			true,
		),
		expectEqual(
			"u32 into i32 emits an explicit cast",
			integerProgram.includes(
				"i32 narrowed32 = core_numeric::narrow((i32)(unsigned));",
			),
			true,
		),
		expectEqual(
			"i32 into f64 emits an explicit cast",
			integerProgram.includes("f64 doubled = (f64)(whole);"),
			true,
		),
		expectEqual(
			"i8 into f32 converts explicitly",
			integerProgram.includes(
				"f32 fits = core_numeric::onlyFloat((f32)(small));",
			),
			true,
		),
		expectEqual(
			"an equal score prefers the overload without narrowing",
			tieProgram.includes("f64 mixed = core_numeric::clampThree(x64"),
			true,
		),
		expectEqual(
			"i32 into i64 widens without a cast",
			integerProgram.includes(
				"i64 widenedSigned = core_numeric::widen(signed32);",
			),
			true,
		),
		expectEqual(
			"u32 into i64 widens without a cast",
			integerProgram.includes(
				"i64 widenedUnsigned = core_numeric::widen(unsigned32);",
			),
			true,
		),
		expectEqual(
			"a u32 above the i32 range selects the i64 overload",
			integerWidthProgram.includes(
				"i64 fromUnsigned = core_numeric::wideClamp((i64)(big), 0, 10);",
			),
			true,
		),
		expectEqual(
			"a u32 with two i32 arguments still selects the i64 overload",
			integerWidthProgram.includes(
				"i64 fromMixed = core_numeric::wideClamp((i64)(big), low, high);",
			),
			true,
		),
		expectEqual(
			"an i32 argument keeps the i32 overload",
			integerWidthProgram.includes(
				"i32 fromSigned = core_numeric::wideClamp(whole, 0, 10);",
			),
			true,
		),
		expectEqual(
			"a u8 argument keeps the cheap i32 overload",
			integerWidthProgram.includes(
				"i32 fromTiny = core_numeric::wideClamp(tiny, 0, 10);",
			),
			true,
		),
		expectEqual(
			"a u64 argument falls back to the i64 overload with an explicit cast",
			integerWidthProgram.includes(
				"i64 fromWide64 = core_numeric::wideClamp((i64)(wide64), 0, 10);",
			),
			true,
		),
		expectEqual(
			"f64 variable with integer literals keeps the f64 overload",
			integerLiteralProgram.includes(
				"f64 mixed = core_numeric::clampThree(x64, (f64)(0), (f64)(3));",
			),
			true,
		),
		expectEqual(
			"f64 variable with integer literals is never cast to f32",
			integerLiteralProgram.includes("(f32)(x64)"),
			false,
		),
		expectEqual(
			"integer literal arguments keep the f32 overload",
			integerLiteralProgram.includes(
				"f32 fallback = core_numeric::clampThree(",
			),
			true,
		),
	];
};

const checkLspWarnings = () => {
	const source = [
		`import { scale, onlyFloat, narrow } from '${PACKAGE_NAME}'`,
		"const x64: f64 = 1.5",
		"export const converted: f32 = scale(x64)",
		"const wide: u64 = 5",
		"export const narrowed: i32 = narrow(wide)",
		"const small: i8 = 1",
		"export const safe: f32 = onlyFloat(small)",
	].join("\n");
	const diagnostics = computeDiagnostics(
		source,
		null,
		buildLibraries(),
		true,
		false,
	);
	const warnings = diagnostics.filter((diagnostic) => {
		return diagnostic.severity === LSP_WARNING_SEVERITY;
	});
	const errors = diagnostics.filter((diagnostic) => {
		return (
			diagnostic.severity !== LSP_WARNING_SEVERITY && diagnostic.severity !== 4
		);
	});

	return [
		expectEqual("LSP shows exactly two numeric warnings", warnings.length, 2),
		expectEqual("LSP numeric warnings never become errors", errors.length, 0),
		expectEqual(
			"LSP warns on f64 into an f32 context",
			warnings.some((diagnostic) => {
				return diagnostic.code === ERROR_CODE.assignmentTypeMismatch;
			}),
			true,
		),
		expectEqual(
			"LSP warns on u64 into an i32 parameter",
			warnings.some((diagnostic) => {
				return diagnostic.code === ERROR_CODE.argumentTypeMismatch;
			}),
			true,
		),
		expectEqual(
			"LSP keeps the f32 warning for i32 input",
			computeDiagnostics(
				[
					`import { onlyFloat } from '${PACKAGE_NAME}'`,
					"const whole: i32 = 1",
					"export const converted: f32 = onlyFloat(whole)",
				].join("\n"),
				null,
				buildLibraries(),
				true,
				false,
			).filter((diagnostic) => {
				return diagnostic.severity === LSP_WARNING_SEVERITY;
			}).length,
			1,
		),
	];
};

const checkIntegerLiteralOverloadWarnings = () => {
	const { ast } = parseSource(
		`import { clampThree } from '${PACKAGE_NAME}'\n${[
			"const setup = () => {}",
			"const main = () => {",
			"    setup()",
			"    const x64: f64 = 1.5",
			"    const clamped = clampThree(x64, 0, 3)",
			"}",
		].join("\n")}\n`,
	);
	const warnings = check(ast, buildLibraries()).errors.filter((error) => {
		return error.code === ERROR_CODE.argumentTypeMismatch;
	});

	return [
		expectEqual(
			"f64 variable with integer literals produces no argument warning",
			warnings.length,
			0,
		),
	];
};

const checkDuplicateDeclarations = () => {
	const distinctSignatures = [
		"export const pick = (value: f32): f32 => {",
		"    return value",
		"}",
		"export const pick = (value: f64): f64 => {",
		"    return value",
		"}",
	].join("\n");
	const identicalSignatures = [
		"export const pick = (value: f32): f32 => {",
		"    return value",
		"}",
		"export const pick = (value: f32): f32 => {",
		"    return value",
		"}",
	].join("\n");
	const coreLibraries = buildLibraries({
		isLibrary: true,
		libraryPackage: PACKAGE_NAME,
		coreLibraryPackages: new Set([PACKAGE_NAME]),
	});
	const userLibraries = buildLibraries({ isLibrary: true });

	const countDuplicates = (source, libraries) => {
		const { ast } = parseSource(source);
		return check(ast, libraries).errors.filter((error) => {
			return error.code === ERROR_CODE.duplicateDeclaration;
		}).length;
	};

	return [
		expectEqual(
			"core library accepts duplicate names with distinct signatures",
			countDuplicates(distinctSignatures, coreLibraries),
			0,
		),
		expectEqual(
			"core library rejects duplicate names with identical signatures",
			countDuplicates(identicalSignatures, coreLibraries),
			1,
		),
		expectEqual(
			"user libraries still reject duplicate declarations",
			countDuplicates(distinctSignatures, userLibraries),
			1,
		),
	];
};

const countWarningsFor = (lines) => {
	const body = lines.map((line) => {
		return `    ${line}`;
	});
	const { ast } = parseSource(
		`import { narrow, wideClamp, widen } from '${PACKAGE_NAME}'\n${[
			"const setup = () => {}",
			"const main = () => {",
			"    setup()",
			...body,
			"}",
		].join("\n")}\n`,
	);
	const errors = check(ast, buildLibraries()).errors;
	const warnings = errors.filter((error) => {
		return error.code === ERROR_CODE.argumentTypeMismatch;
	});
	return {
		errors: errors.filter((error) => {
			return (error.severity ?? SEVERITY.error) === SEVERITY.error;
		}),
		warnings,
	};
};

const checkConversionWarnings = () => {
	const narrowToI32 = countWarningsFor([
		"const wide: u64 = 5",
		"export const narrowed: i32 = narrow(wide)",
	]);
	const narrowToI64 = countWarningsFor([
		"const wide: u64 = 5",
		"export const widened: i64 = widen(wide)",
	]);
	const wideUnsigned = countWarningsFor([
		"const big: u32 = 3000000000",
		"const low: i32 = -5",
		"const high: i32 = 10",
		"export const clamped = wideClamp(big, 0, 10)",
		"export const mixed = wideClamp(big, low, high)",
	]);
	return [
		expectEqual(
			"u64 into i32 conversion is a non-blocking warning",
			narrowToI32.warnings.every((error) => {
				return error.severity === SEVERITY.warning;
			}),
			true,
		),
		expectEqual(
			"u64 into i32 conversion never produces an error",
			narrowToI32.errors.length,
			0,
		),
		expectEqual(
			"u64 into i64 conversion is a non-blocking warning",
			narrowToI64.warnings.length,
			1,
		),
		expectEqual(
			"u64 into i64 conversion never produces an error",
			narrowToI64.errors.length,
			0,
		),
		expectEqual(
			"a u32 above the i32 range widens into i64 without a warning",
			wideUnsigned.warnings.length,
			0,
		),
	];
};

const MATH_LIBRARY_SOURCE_PATH = join(
	REGISTRY_LIBRARIES_DIRECTORY,
	"math",
	"main.e95",
);

// Canonical shape of the core `math` surface after the width families are
// desugared: every function is listed once with the concrete signatures the
// checker and codegen must see.
const CANONICAL_MATH_SIGNATURES = {
	absolute: "(i32)->i32 (i64)->i64 (u32)->u32",
	absoluteFloat: "(f32)->f32 (f64)->f64",
	arcCosine: "(f32)->f32 (f64)->f64",
	arcSine: "(f32)->f32 (f64)->f64",
	arcTangent: "(f32)->f32 (f64)->f64",
	arcTangent2: "(f32,f32)->f32 (f64,f64)->f64",
	bitMask: "(u8)->u32",
	clamp: "(i32,i32,i32)->i32 (i64,i64,i64)->i64 (u32,u32,u32)->u32",
	clampFloat: "(f32,f32,f32)->f32 (f64,f64,f64)->f64",
	clearBitValue: "(u32,u8)->u32",
	cosine: "(f32)->f32 (f64)->f64",
	exponential: "(f32)->f32 (f64)->f64",
	highByteValue: "(u32)->u8",
	interpolateRange:
		"(i32,i32,i32,i32,i32)->i32 (i64,i64,i64,i64,i64)->i64 (u32,u32,u32,u32,u32)->u32",
	interpolateRangeFloat:
		"(f32,f32,f32,f32,f32)->f32 (f64,f64,f64,f64,f64)->f64",
	logarithm10: "(f32)->f32 (f64)->f64",
	lowByteValue: "(u32)->u8",
	maximum: "(i32,i32)->i32 (i64,i64)->i64 (u32,u32)->u32",
	maximumFloat: "(f32,f32)->f32 (f64,f64)->f64",
	minimum: "(i32,i32)->i32 (i64,i64)->i64 (u32,u32)->u32",
	minimumFloat: "(f32,f32)->f32 (f64,f64)->f64",
	naturalLog: "(f32)->f32 (f64)->f64",
	power: "(f32,f32)->f32 (f64,f64)->f64",
	randomInteger: "(i32,i32)->i32",
	readBitValue: "(u32,u8)->boolean",
	remainderFloat: "(f32,f32)->f32 (f64,f64)->f64",
	roundDown: "(f32)->f32 (f64)->f64",
	roundNearest: "(f32)->f32 (f64)->f64",
	roundUp: "(f32)->f32 (f64)->f64",
	seedRandom: "(u32)->void",
	setBitValue: "(u32,u8)->u32",
	sine: "(f32)->f32 (f64)->f64",
	square: "(f32)->f32 (f64)->f64",
	squareRoot: "(f32)->f32 (f64)->f64",
	tangent: "(f32)->f32 (f64)->f64",
	toDegrees: "(f32)->f32 (f64)->f64",
	toRadians: "(f32)->f32 (f64)->f64",
	truncate: "(f32)->f32 (f64)->f64",
	writeBitValue: "(u32,u8,boolean)->u32",
};

const readMathLibraryInfo = () => {
	const source = readFileSync(MATH_LIBRARY_SOURCE_PATH, UTF8);
	return collectLibraryModuleInfo(source, "@embedito95/math");
};

const MATH_PACKAGE_NAME = "@embedito95/math";

const buildMathLibraries = () => {
	const moduleInfo = readMathLibraryInfo();
	const libraryFunctions = { [MATH_PACKAGE_NAME]: moduleInfo.functions };
	return {
		isLibrary: true,
		knownLibraries: new Set([MATH_PACKAGE_NAME]),
		libraryExports: { [MATH_PACKAGE_NAME]: moduleInfo.exports },
		libraryFunctions,
		libraryTypes: { [MATH_PACKAGE_NAME]: moduleInfo.types },
		libraryEnumInfo: {},
		libraryObjectTypes: { [MATH_PACKAGE_NAME]: moduleInfo.objectTypes },
	};
};

const generateMathProgram = (source) => {
	const moduleInfo = readMathLibraryInfo();
	const { ast } = parseSource(source);
	const generated = shared.generateCode({
		ast,
		sourceLines: source.split("\n"),
		platform: { specs: { wordSize: WORD_SIZE }, float64: "native" },
		libraryFunctions: { [MATH_PACKAGE_NAME]: moduleInfo.functions },
		libraryNamespaces: { [MATH_PACKAGE_NAME]: "core_math" },
		libraryModules: {},
		mainGenerator: (body) => {
			return String(body);
		},
	});
	return generated.main;
};

const countArgumentTypeWarnings = (source, libraries) => {
	const { ast } = parseSource(source);
	return check(ast, libraries).errors.filter((error) => {
		return error.code === ERROR_CODE.argumentTypeMismatch;
	}).length;
};

// The reported regression: a single `f64` argument must select the `f64`
// overload even when the remaining arguments are cheap `f32` literals. It
// never narrows the `f64` down to `f32` by accumulating conversions.
const checkFloatNarrowingWarnings = () => {
	const x64First = [
		`import { interpolateRangeFloat } from '${MATH_PACKAGE_NAME}'`,
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const x64: f64 = 0.5",
		"    const remapped = interpolateRangeFloat(x64, 0.0, 1.0, 0.0, 100.0)",
		"}",
	].join("\n");
	const x64Last = [
		`import { interpolateRangeFloat } from '${MATH_PACKAGE_NAME}'`,
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const x64: f64 = 0.5",
		"    const remapped = interpolateRangeFloat(0.0, 0.0, 1.0, 0.0, x64)",
		"}",
	].join("\n");
	const declaredF32 = [
		`import { interpolateRangeFloat } from '${MATH_PACKAGE_NAME}'`,
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const x64: f64 = 0.5",
		"    const remapped: f32 = interpolateRangeFloat(x64, 0.0, 1.0, 0.0, 100.0)",
		"}",
	].join("\n");
	const generated = generateMathProgram(x64First);
	const libraryInfo = readMathLibraryInfo();
	const returnTypes = [
		resolveDefinitionReturnType(
			libraryInfo.functions.interpolateRangeFloat,
			["f64", "f32", "f32", "f32", "f32"],
			WORD_SIZE,
		),
		resolveDefinitionReturnType(
			libraryInfo.functions.interpolateRangeFloat,
			["f32", "f32", "f32", "f32", "f64"],
			WORD_SIZE,
		),
	];
	const mathLibraries = buildMathLibraries();
	const declaredWarnings = check(
		parseSource(declaredF32).ast,
		mathLibraries,
	).errors.filter((error) => {
		return error.code === ERROR_CODE.assignmentTypeMismatch;
	});

	return [
		expectEqual(
			"an f64 argument selects the f64 interpolateRangeFloat overload",
			returnTypes[0],
			"f64",
		),
		expectEqual(
			"the symmetric call selects the f64 overload too",
			returnTypes[1],
			"f64",
		),
		expectEqual(
			"an f64 argument with f32 literals produces no argument warning",
			countArgumentTypeWarnings(x64First, mathLibraries),
			0,
		),
		expectEqual(
			"the symmetric call produces no argument warning",
			countArgumentTypeWarnings(x64Last, mathLibraries),
			0,
		),
		expectEqual(
			"an f64 argument keeps an f64 return type in generated C++",
			generated.includes("f64 remapped = core_math::interpolateRangeFloat("),
			true,
		),
		expectEqual(
			"the f64 argument is never narrowed in generated C++",
			generated.includes("(f32)(x64)"),
			false,
		),
		expectEqual(
			"a declared f32 destination still warns on the f64 result",
			declaredWarnings.length,
			1,
		),
	];
};

const describeSignatures = (definition) => {
	return definition.signatures
		.map((signature) => {
			const params = signature.params
				.map((param) => {
					return param.type;
				})
				.join(",");
			return `(${params})->${signature.returnType}`;
		})
		.join(" ");
};

const checkWidthFamilyDesugaring = () => {
	const libraryInfo = readMathLibraryInfo();
	const actual = Object.fromEntries(
		Object.keys(CANONICAL_MATH_SIGNATURES).map((name) => {
			return [name, describeSignatures(libraryInfo.functions[name])];
		}),
	);
	const unionSignature = {
		params: [{ name: "value", type: "i32 | i64 | u32", defaultValue: null }],
		returnType: "i32 | i64 | u32",
	};
	const expanded = expandWidthFamilySignature(unionSignature);
	const userUnionSource = [
		"const pick = (value: f32 | f64): f32 | f64 => {",
		"    return value",
		"}",
	].join("\n");
	const { ast: userUnionAst } = parseSource(userUnionSource);
	const userUnionErrors = check(userUnionAst, {}).errors.filter((error) => {
		return error.code === ERROR_CODE.arbitraryUnion;
	});
	const separatedFamily = expandWidthFamilySignature({
		params: [
			{ name: "value", type: "f32 | f64", defaultValue: null },
			{ name: "scale", type: "i32 | i64 | u32", defaultValue: null },
		],
		returnType: "f32 | f64",
	});

	return [
		expectEqual(
			"the math width families desugar to the canonical signature list",
			JSON.stringify(actual),
			JSON.stringify(CANONICAL_MATH_SIGNATURES),
		),
		expectEqual(
			"an integer width family expands to one signature per width",
			expanded
				.map((signature) => {
					return signature.params[0].type;
				})
				.join("|"),
			"i32|i64|u32",
		),
		expectEqual(
			"a width family substitutes the same width in params and return",
			expanded
				.map((signature) => {
					return signature.returnType;
				})
				.join("|"),
			"i32|i64|u32",
		),
		expectEqual(
			"a signature mixing two width families is not expanded",
			separatedFamily.length,
			1,
		),
		expectEqual(
			"a width family in user code is still an error",
			userUnionErrors.length > 0,
			true,
		),
	];
};

const INTEGER_SELECTION_CASES = [
	{
		functionName: "clamp",
		args: ["u8", "i8", "i8"],
		expected: ["i32", "i32", "i64"],
	},
	{
		functionName: "clamp",
		args: ["u16", "i16", "i16"],
		expected: ["i32", "i32", "i64"],
	},
	{
		functionName: "clamp",
		args: ["u32", "i32", "i32"],
		expected: ["i64", "i64", "i64"],
	},
	{
		functionName: "clamp",
		args: ["u32", "u32", "u32"],
		expected: ["u32", "u32", "i64"],
	},
	{
		functionName: "clamp",
		args: ["u8", "u32", "u32"],
		expected: ["u32", "u32", "i64"],
	},
	{
		functionName: "clamp",
		args: ["u32", "u8", "u8"],
		expected: ["u32", "u32", "i64"],
	},
	{
		functionName: "clamp",
		args: ["u16", "u32", "u32"],
		expected: ["u32", "u32", "i64"],
	},
	{
		functionName: "clamp",
		args: ["i32", "i32", "i32"],
		expected: ["i32", "i32", "i64"],
	},
	{
		functionName: "clamp",
		args: ["u64", "i8", "i8"],
		expected: ["i64", "i64", "i64"],
	},
	{
		functionName: "interpolateRange",
		args: ["u32", "i32", "i32", "i32", "i32"],
		expected: ["i64", "i64", "i64"],
	},
	{ functionName: "absolute", args: ["u8"], expected: ["i32", "i32", "i64"] },
	{ functionName: "absolute", args: ["u32"], expected: ["u32", "u32", "i64"] },
	{
		functionName: "minimum",
		args: ["u16", "i16"],
		expected: ["i32", "i32", "i64"],
	},
	{
		functionName: "minimum",
		args: ["u8", "u32"],
		expected: ["u32", "u32", "i64"],
	},
];

const INTEGER_SYMMETRY_GROUPS = [
	{
		functionName: "clamp",
		permutations: [
			["u8", "u32", "u32"],
			["u32", "u8", "u8"],
		],
	},
	{
		functionName: "minimum",
		permutations: [
			["u8", "u32"],
			["u32", "u8"],
		],
	},
];

// The float family shares one width per call, so these cases exercise the same
// rule as integers: the widest signature that accepts every argument without
// losing range. A lone `f64` selects `f64`; an integer argument uses the width
// that holds its whole range exactly (`resolveFloatTypeForIntegerType`), so a
// `u16`/`i16` fits `f32` while an `i32`/`u32`/`i64` needs `f64` (a signed 32-bit
// range already exceeds the 2^24 exact integers of `f32`).
const FLOAT_SELECTION_CASES = [
	{
		functionName: "interpolateRangeFloat",
		args: ["f32", "f32", "f32", "f32", "f32"],
		expected: ["f32", "f32", "f32"],
	},
	{
		functionName: "interpolateRangeFloat",
		args: ["f64", "f32", "f32", "f32", "f32"],
		expected: ["f64", "f64", "f64"],
	},
	{
		functionName: "interpolateRangeFloat",
		args: ["f32", "f32", "f32", "f32", "f64"],
		expected: ["f64", "f64", "f64"],
	},
	{
		functionName: "interpolateRangeFloat",
		args: ["i16", "f32", "f32", "f32", "f32"],
		expected: ["f32", "f32", "f32"],
	},
	{
		functionName: "interpolateRangeFloat",
		args: ["u16", "f32", "f32", "f32", "f32"],
		expected: ["f32", "f32", "f32"],
	},
	{
		functionName: "interpolateRangeFloat",
		args: ["i32", "f32", "f32", "f32", "f32"],
		expected: ["f64", "f64", "f64"],
	},
	{
		functionName: "interpolateRangeFloat",
		args: ["u32", "f32", "f32", "f32", "f32"],
		expected: ["f64", "f64", "f64"],
	},
	{
		functionName: "interpolateRangeFloat",
		args: ["i64", "f32", "f32", "f32", "f32"],
		expected: ["f64", "f64", "f64"],
	},
	{
		functionName: "interpolateRangeFloat",
		args: ["f64", "i32", "i32", "i32", "i32"],
		expected: ["f64", "f64", "f64"],
	},
	{
		functionName: "interpolateRangeFloat",
		args: ["i32", "i32", "i32", "i32", "i32"],
		expected: ["f64", "f64", "f64"],
	},
	{
		functionName: "interpolateRangeFloat",
		args: ["i16", "i16", "i16", "i16", "i16"],
		expected: ["f32", "f32", "f32"],
	},
	{
		functionName: "power",
		args: ["f32", "f64"],
		expected: ["f64", "f64", "f64"],
	},
	{
		functionName: "arcTangent2",
		args: ["u32", "f32"],
		expected: ["f64", "f64", "f64"],
	},
	{
		functionName: "minimumFloat",
		args: ["i16", "f32"],
		expected: ["f32", "f32", "f32"],
	},
];

const FLOAT_SYMMETRY_GROUPS = [
	{
		functionName: "interpolateRangeFloat",
		permutations: [
			["f64", "f32", "f32", "f32", "f32"],
			["f32", "f32", "f32", "f32", "f64"],
		],
	},
	{
		functionName: "interpolateRangeFloat",
		permutations: [
			["u32", "f32", "i16", "i16", "i16"],
			["i16", "i16", "i16", "f32", "u32"],
		],
	},
	{
		functionName: "power",
		permutations: [
			["f64", "f32"],
			["f32", "f64"],
		],
	},
];

const WORD_SIZES = [16, 32, 64];

const checkIntegerPromotionSelectionMatrix = () => {
	const libraryInfo = readMathLibraryInfo();
	const failures = [];
	for (const testCase of INTEGER_SELECTION_CASES) {
		const actual = WORD_SIZES.map((wordSize) => {
			return resolveDefinitionReturnType(
				libraryInfo.functions[testCase.functionName],
				testCase.args,
				wordSize,
			);
		});
		const label = `integer promotion follows binary operators: ${testCase.functionName}(${testCase.args.join(", ")})`;
		if (actual.join("|") !== testCase.expected.join("|")) {
			failures.push({ label, actual, expected: testCase.expected });
		}
	}
	return [
		expectEqual(
			"integer promotion follows binary operators at 16-bit words",
			failures.filter((failure) => {
				return failure.actual[0] !== failure.expected[0];
			}).length,
			0,
		),
		expectEqual(
			"integer promotion follows binary operators at 32-bit words",
			failures.filter((failure) => {
				return failure.actual[1] !== failure.expected[1];
			}).length,
			0,
		),
		expectEqual(
			"integer promotion follows binary operators at 64-bit words",
			failures.filter((failure) => {
				return failure.actual[2] !== failure.expected[2];
			}).length,
			0,
		),
		...failures.map((failure) => {
			return expectEqual(
				failure.label,
				failure.actual.join("|"),
				failure.expected.join("|"),
			);
		}),
		...WORD_SIZES.map((wordSize) => {
			const asymmetric = INTEGER_SYMMETRY_GROUPS.filter((group) => {
				const resolved = group.permutations.map((args) => {
					return resolveDefinitionReturnType(
						libraryInfo.functions[group.functionName],
						args,
						wordSize,
					);
				});
				return new Set(resolved).size !== 1;
			});
			return expectEqual(
				`integer promotion is argument-order independent at ${wordSize}-bit words`,
				asymmetric.length,
				0,
			);
		}),
	];
};

// Adjudication for integer arguments in float parameters: the width comes from
// the whole range of the argument's type (`i32`/`i64`/`u32`/`u64` -> `f64`,
// `i8`/`i16`/`u8`/`u16` -> `f32`). A bare literal does not pay because the
// checker assigns it the minimum type (`5` -> `i8`), so it stays on the cheap
// `f32` path.
const checkIntegerToFloatSelection = () => {
	const source = [
		`import { clampFloat, interpolateRangeFloat } from '${MATH_PACKAGE_NAME}'`,
		"const setup = () => {}",
		"const main = () => {",
		"    setup()",
		"    const whole: i32 = 5",
		"    const wideClamp: f64 = clampFloat(whole, 0.0, 1.0)",
		"    const wideRemapped: f64 = interpolateRangeFloat(whole, 0.0, 1.0, 0.0, 100.0)",
		"    const literalClamp: f32 = clampFloat(5, 0.0, 1.0)",
		"}",
	].join("\n");
	const generated = generateMathProgram(source);
	const libraryInfo = readMathLibraryInfo();
	const wideReturnType = resolveDefinitionReturnType(
		libraryInfo.functions.clampFloat,
		["i32", "f32", "f32"],
		WORD_SIZE,
	);
	const literalReturnType = resolveDefinitionReturnType(
		libraryInfo.functions.clampFloat,
		["i8", "f32", "f32"],
		WORD_SIZE,
	);

	return [
		expectEqual(
			"integer variables widen to f64 in float parameters, literals stay f32",
			[
				wideReturnType,
				literalReturnType,
				generated.includes(
					"f64 wideClamp = core_math::clampFloat((f64)(whole)",
				),
				generated.includes("f32 literalClamp = core_math::clampFloat("),
			].join("|"),
			"f64|f32|true|true",
		),
		expectEqual(
			"an i32 variable selects the f64 interpolateRangeFloat overload",
			[
				resolveDefinitionReturnType(
					libraryInfo.functions.interpolateRangeFloat,
					["i32", "f32", "f32", "f32", "f32"],
					WORD_SIZE,
				),
				generated.includes(
					"f64 wideRemapped = core_math::interpolateRangeFloat",
				),
			].join("|"),
			"f64|true",
		),
		expectEqual(
			"a bare integer literal keeps the f32 clampFloat overload",
			generated.includes(
				"f32 literalClamp = core_math::clampFloat((f32)(5.0f)",
			),
			true,
		),
	];
};

const checkFloatPromotionSelectionMatrix = () => {
	const libraryInfo = readMathLibraryInfo();
	const failures = [];
	for (const testCase of FLOAT_SELECTION_CASES) {
		const actual = WORD_SIZES.map((wordSize) => {
			return resolveDefinitionReturnType(
				libraryInfo.functions[testCase.functionName],
				testCase.args,
				wordSize,
			);
		});
		const label = `float promotion keeps the widest lossless width: ${testCase.functionName}(${testCase.args.join(", ")})`;
		if (actual.join("|") !== testCase.expected.join("|")) {
			failures.push({ label, actual, expected: testCase.expected });
		}
	}
	return [
		expectEqual(
			"float promotion keeps the widest lossless width at 16-bit words",
			failures.filter((failure) => {
				return failure.actual[0] !== failure.expected[0];
			}).length,
			0,
		),
		expectEqual(
			"float promotion keeps the widest lossless width at 32-bit words",
			failures.filter((failure) => {
				return failure.actual[1] !== failure.expected[1];
			}).length,
			0,
		),
		expectEqual(
			"float promotion keeps the widest lossless width at 64-bit words",
			failures.filter((failure) => {
				return failure.actual[2] !== failure.expected[2];
			}).length,
			0,
		),
		...failures.map((failure) => {
			return expectEqual(
				failure.label,
				failure.actual.join("|"),
				failure.expected.join("|"),
			);
		}),
		...WORD_SIZES.map((wordSize) => {
			const asymmetric = FLOAT_SYMMETRY_GROUPS.filter((group) => {
				const resolved = group.permutations.map((args) => {
					return resolveDefinitionReturnType(
						libraryInfo.functions[group.functionName],
						args,
						wordSize,
					);
				});
				return new Set(resolved).size !== 1;
			});
			return expectEqual(
				`float promotion is argument-order independent at ${wordSize}-bit words`,
				asymmetric.length,
				0,
			);
		}),
	];
};

export const runNumericConversionChecks = async () => {
	return [
		...checkCodegen(),
		...checkLspWarnings(),
		...checkIntegerLiteralOverloadWarnings(),
		...checkDuplicateDeclarations(),
		...checkConversionWarnings(),
		...checkWidthFamilyDesugaring(),
		...checkIntegerPromotionSelectionMatrix(),
		...checkFloatPromotionSelectionMatrix(),
		...checkFloatNarrowingWarnings(),
		...checkIntegerToFloatSelection(),
	];
};
