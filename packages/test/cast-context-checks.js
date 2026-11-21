// Contextual int|float casts: `500 as f32` is an exact, legal cast wherever it
// appears. The `int <op> f32` result table decides the intermediate type from
// the target context, so an integer target truncates the float operand to i32
// while a float target keeps the float operation. These checks pin the checker
// side; the codegen side lives in the `contextual-cast` language snapshots and
// the editor side in the matching LSP hover/diagnostics checks.
import { check, ERROR_CODE, SEVERITY } from "embedito95-core";
import { expectEqual } from "./reporting.js";
import {
	createLibraries,
	parseSource,
} from "./src/language/language-snapshot-harness.mjs";

const CONTEXTUAL_CAST_SOURCE = [
	"const sensorValue: i32 = 100",
	"const temperature = (sensorValue as i32 * 500 as f32) / 1023",
	"const temperature2: f32 = (sensorValue as i32 * 500 as f32) / 1023",
	"const added = 1 + (2 as f32)",
	"const restored: f32 = (2 as f32) + 1",
	"const truncated: i16 = 1.5",
].join("\n");

const FLOAT_MODULO_SOURCE = "const remainder = 5.5 % 2";
const FLOAT_CAST_INTO_INT_SOURCE = "const stored: i32 = 500 as f32";
const TRUNCATING_LITERAL_SOURCE = "const truncated: i16 = 1.5";
const ARGUMENT_AND_MEMBER_TRUNCATION_SOURCE = [
	"const funI = (x: i32) => { }",
	"const funF = (x: f32) => { }",
	"type Box = { count: i32, ratio: f32 }",
	"const run = () => {",
	"    funI(500 as f32)",
	"    funI(1.5)",
	"    funF(500 as f32)",
	"    let box: Box = { count: 0, ratio: 0 }",
	"    box.count = 500 as f32",
	"    box.count = 1.5",
	"    box.ratio = 500 as f32",
	"}",
].join("\n");

const runCheck = (source) => {
	const { ast, comments } = parseSource(source);
	const { errors, variableTypes } = check(ast, {
		...createLibraries(),
		comments,
		source,
		wordSize: 32,
	});
	return { errors, variableTypes };
};

const errorCodes = (errors) => {
	return errors.map((error) => {
		return error.code;
	});
};

const findError = (errors, code) => {
	return errors.find((error) => {
		return error.code === code;
	});
};

const checkContextualCastCompiles = () => {
	const { errors } = runCheck(CONTEXTUAL_CAST_SOURCE);
	return [
		expectEqual(
			"`500 as f32` in an integer context is not an explicitFloatInIntContext error",
			errorCodes(errors).includes(ERROR_CODE.explicitFloatInIntContext),
			false,
		),
	];
};

const checkContextualCastTypes = () => {
	const { variableTypes } = runCheck(CONTEXTUAL_CAST_SOURCE);
	return [
		expectEqual(
			"integer context truncates `500 as f32` and keeps the result as i32",
			variableTypes.get("temperature"),
			"i32",
		),
		expectEqual(
			"float target keeps the contextual cast result as f32",
			variableTypes.get("temperature2"),
			"f32",
		),
		expectEqual(
			"`1 + (2 as f32)` keeps the int|f32 intermediate as i32 without folding",
			variableTypes.get("added"),
			"i32",
		),
		expectEqual(
			"`(2 as f32) + 1` in a float target stays f32",
			variableTypes.get("restored"),
			"f32",
		),
	];
};

const checkFloatModuloStillFails = () => {
	const { errors } = runCheck(FLOAT_MODULO_SOURCE);
	return [
		expectEqual(
			"`%` with a float operand still reports floatModulo",
			errorCodes(errors).includes(ERROR_CODE.floatModulo),
			true,
		),
	];
};

const checkFloatCastIntoIntegerTargetFails = () => {
	const { errors } = runCheck(FLOAT_CAST_INTO_INT_SOURCE);
	const diagnostic = findError(errors, ERROR_CODE.explicitFloatInIntContext);
	return [
		expectEqual(
			"storing `500 as f32` in an i32 target still reports explicitFloatInIntContext",
			Boolean(diagnostic),
			true,
		),
		expectEqual(
			"the float-into-integer error keeps error severity",
			diagnostic?.severity,
			SEVERITY.error,
		),
	];
};

const checkTruncatingLiteralStillCompiles = () => {
	const { errors, variableTypes } = runCheck(TRUNCATING_LITERAL_SOURCE);
	return [
		expectEqual(
			"`const truncated: i16 = 1.5` still truncates without an error",
			errorCodes(errors).includes(ERROR_CODE.explicitFloatInIntContext),
			false,
		),
		expectEqual(
			"the truncated literal keeps its declared i16 type",
			variableTypes.get("truncated"),
			"i16",
		),
	];
};

const checkFloatArgumentsAndMembersTruncate = () => {
	const { errors } = runCheck(ARGUMENT_AND_MEMBER_TRUNCATION_SOURCE);
	const codes = errorCodes(errors);
	return [
		expectEqual(
			"a float argument to an i32 parameter is not an argumentTypeMismatch error",
			codes.includes(ERROR_CODE.argumentTypeMismatch),
			false,
		),
		expectEqual(
			"a float argument to an i32 parameter is not an explicitFloatInIntContext error",
			codes.includes(ERROR_CODE.explicitFloatInIntContext),
			false,
		),
	];
};

export const runCastContextChecks = () => {
	return [
		...checkContextualCastCompiles(),
		...checkContextualCastTypes(),
		...checkFloatModuloStillFails(),
		...checkFloatCastIntoIntegerTargetFails(),
		...checkTruncatingLiteralStillCompiles(),
		...checkFloatArgumentsAndMembersTruncate(),
	];
};
