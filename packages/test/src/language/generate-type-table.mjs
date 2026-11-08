import {
	normalizeOperandTypes,
	resolveBinaryOperationType,
} from "embedito95-core";
import {
	isMainModule,
	listSnapshots,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const NUMERIC_TYPES = [
	"u8",
	"i8",
	"u16",
	"i16",
	"u32",
	"i32",
	"u64",
	"i64",
	"i128",
	"u128",
	"f32",
	"f64",
];

const ARITHMETIC_OPERATORS = ["+", "-", "*", "/", "%"];
const COMPARISON_OPERATORS = ["==", "!=", "<", "<=", ">", ">="];

const renderResult = (result) => {
	return result ?? "error";
};

const isFloatType = (type) => {
	return type === "f32" || type === "f64";
};

const WORD_SIZES = [16, 32, 64];

const renderOperationResult = (operator, leftType, rightType) => {
	const result = resolveBinaryOperationType(operator, leftType, rightType);

	if (result === null) {
		return "error";
	}

	const leftIsFloat = isFloatType(leftType);
	const rightIsFloat = isFloatType(rightType);
	const floatSuffix =
		leftIsFloat !== rightIsFloat
			? ` | ${leftIsFloat ? leftType : rightType}`
			: "";

	const portable = `${result}${floatSuffix}`;
	const wordResults = WORD_SIZES.map((wordSize) => {
		const wordResult = normalizeOperandTypes(
			leftType,
			rightType,
			operator,
			wordSize,
		);
		return `${renderResult(wordResult)}${floatSuffix}`;
	}).join(", ");

	return `${portable} [${wordResults}]`;
};

const renderComparisonResult = (operator, leftType, rightType) => {
	const leftIsFloat = isFloatType(leftType);
	const rightIsFloat = isFloatType(rightType);

	if (leftIsFloat !== rightIsFloat) {
		return "error";
	}

	const commonType = normalizeOperandTypes(leftType, rightType);
	return `boolean (${commonType ?? "?"})`;
};

const buildRows = (operators, renderResultFor) => {
	const lines = [];

	for (const operator of operators) {
		lines.push(`// Operator "${operator}"`);

		for (let leftIndex = 0; leftIndex < NUMERIC_TYPES.length; leftIndex++) {
			const leftType = NUMERIC_TYPES[leftIndex];

			for (
				let rightIndex = leftIndex;
				rightIndex < NUMERIC_TYPES.length;
				rightIndex++
			) {
				const rightType = NUMERIC_TYPES[rightIndex];
				lines.push(
					`${leftType} ${operator} ${rightType} = ${renderResultFor(
						operator,
						leftType,
						rightType,
					)}`,
				);
			}
		}

		lines.push("");
	}

	return `${lines.join("\n")}\n`;
};

const buildOperationsTable = () => {
	const header = [
		"// Binary operation result types (numeric operands only)",
		`// Generated from resolveBinaryOperationType (see core/src/checker.js)`,
		"// Pairs are listed once (symmetric): the right operand starts at the left",
		"// operand's position, so 'i8 + u8' is not repeated after 'u8 + i8'.",
		"// The first value is the portable result; the [..] array shows the final",
		"// type on each supported word size (16, 32, 64 bits): the result is widened",
		"// to the word, preferring the signed word when it fits",
		"// (u8 + u8 = u8 [i16, i32, i64]).",
		"// 'error' marks an operator the operands do not accept (e.g. '%' with floats).",
		"// 'int | f32' (or f64): the integer intermediate is 'int', but when the",
		"// result is stored to a float target that float type is used instead.",
		"",
	];

	return `${header.join("\n")}${buildRows(ARITHMETIC_OPERATORS, renderOperationResult)}`;
};

const buildComparisonTable = () => {
	const header = [
		"// Binary comparison result types (numeric operands only)",
		"// Comparisons always yield 'boolean'; the cast in parentheses is the type",
		"// the operands are promoted to before comparing (the C++ signed/unsigned",
		"// gotcha is avoided by widening to a signed type when signedness mixes).",
		"// Pairs are listed once (symmetric).",
		"",
	];

	return `${header.join("\n")}${buildRows(COMPARISON_OPERATORS, renderComparisonResult)}`;
};

export const listTypeTableSnapshots = () => {
	return [
		...listSnapshots("binary-operations.txt", buildOperationsTable()),
		...listSnapshots("binary-comparisons.txt", buildComparisonTable()),
	];
};

export const writeTypeTableSnapshots = () => {
	writeSnapshots(listTypeTableSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeTypeTableSnapshots();
	console.log("Generated binary-operations.txt and binary-comparisons.txt");
}
