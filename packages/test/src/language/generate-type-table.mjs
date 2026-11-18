import {
	normalizeOperandTypes,
	resolveBinaryOperationType,
	resolveConstIntegerType,
} from "embedito95-core";
import {
	isMainModule,
	listDocumentSnapshots,
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

const WORD_SIZES = [16, 32, 64];

const ERROR_RESULT = "error";
const UNKNOWN_TYPE = "?";
const FLOAT_SUFFIX_SEPARATOR = " | ";
const WORD_RESULTS_SEPARATOR = ", ";
const BOOLEAN_TYPE = "boolean";
const DOCUMENT_FILE_NAME = "binary-operators.md";
const DOCUMENT_TITLE = "# Binary operator result types";
const OPERATION_COLUMN_TITLES = [
	"Left",
	"Right",
	"Portable",
	...WORD_SIZES.map((wordSize) => {
		return `${wordSize}-bit`;
	}),
];
const COMPARISON_COLUMN_TITLES = ["Left", "Right", "Result"];

// The canonical examples the expressions page references. `1000 * 1000` is
// listed with its literal operand type (`i16`) and the folded value the checker
// actually sees, because constant folding widens the product to `i32`.
const FOLDED_LITERAL_OPERAND = 1000;
const FOLDED_LITERAL_PRODUCT = FOLDED_LITERAL_OPERAND * FOLDED_LITERAL_OPERAND;
const CANONICAL_CASES = [
	{
		expression: "u8 + u32",
		operator: "+",
		leftType: "u8",
		rightType: "u32",
		foldedValue: null,
		note: "The `u32` operand widens the pair; stays `u32` on 16/32-bit and widens to `i64` on 64-bit.",
	},
	{
		expression: "u8 - u8",
		operator: "-",
		leftType: "u8",
		rightType: "u8",
		foldedValue: null,
		note: "Subtraction allows a negative result, so the pair becomes a signed word.",
	},
	{
		expression: `${FOLDED_LITERAL_OPERAND} * ${FOLDED_LITERAL_OPERAND}`,
		operator: "*",
		leftType: "i16",
		rightType: "i16",
		foldedValue: FOLDED_LITERAL_PRODUCT,
		note: "Folded literals widen when needed: the product does not fit `i16`, so it is computed as `i32` on every word size instead of overflowing.",
	},
	{
		expression: "u32 * u32",
		operator: "*",
		leftType: "u32",
		rightType: "u32",
		foldedValue: null,
		note: "Stays `u32` on 16/32-bit, so a product above the `u32` range wraps silently (see [F-033](../../../worklog/follow-up.md)).",
	},
];

const renderResult = (result) => {
	return result ?? ERROR_RESULT;
};

const isFloatType = (type) => {
	return type === "f32" || type === "f64";
};

const renderFloatSuffix = (leftType, rightType) => {
	const leftIsFloat = isFloatType(leftType);
	const rightIsFloat = isFloatType(rightType);

	if (leftIsFloat === rightIsFloat) {
		return "";
	}

	return `${FLOAT_SUFFIX_SEPARATOR}${leftIsFloat ? leftType : rightType}`;
};

// One arithmetic pair resolved twice: the portable result (no target word) and
// the final type on each supported word size. Both the `.txt` fixture and the
// Markdown page consume this structure, so they cannot drift apart.
const resolveOperationCell = (operator, leftType, rightType) => {
	const result = resolveBinaryOperationType(operator, leftType, rightType);

	if (result === null) {
		return {
			isError: true,
			portable: ERROR_RESULT,
			wordResults: WORD_SIZES.map(() => {
				return ERROR_RESULT;
			}),
		};
	}

	const floatSuffix = renderFloatSuffix(leftType, rightType);

	return {
		isError: false,
		portable: `${result}${floatSuffix}`,
		wordResults: WORD_SIZES.map((wordSize) => {
			const wordResult = normalizeOperandTypes(
				leftType,
				rightType,
				operator,
				wordSize,
			);
			return `${renderResult(wordResult)}${floatSuffix}`;
		}),
	};
};

// The fixture pins one promoted comparison type per pair, independent of the
// target word size, so the canonical cells repeat it in every word column.
const resolveComparisonCell = (leftType, rightType) => {
	const leftIsFloat = isFloatType(leftType);
	const rightIsFloat = isFloatType(rightType);

	if (leftIsFloat !== rightIsFloat) {
		return { portable: ERROR_RESULT };
	}

	const commonType = normalizeOperandTypes(leftType, rightType);
	const portable = `${BOOLEAN_TYPE} (${commonType ?? UNKNOWN_TYPE})`;
	return { portable };
};

const resolveFoldedCell = (foldedValue) => {
	const resultType = resolveConstIntegerType(foldedValue);
	return {
		portable: resultType,
		wordResults: WORD_SIZES.map(() => {
			return resultType;
		}),
	};
};

const collectTypePairs = () => {
	const pairs = [];

	for (let leftIndex = 0; leftIndex < NUMERIC_TYPES.length; leftIndex++) {
		const leftType = NUMERIC_TYPES[leftIndex];

		for (
			let rightIndex = leftIndex;
			rightIndex < NUMERIC_TYPES.length;
			rightIndex++
		) {
			pairs.push({ leftType, rightType: NUMERIC_TYPES[rightIndex] });
		}
	}

	return pairs;
};

const TYPE_PAIRS = collectTypePairs();

const renderOperationResult = (operator, leftType, rightType) => {
	const { isError, portable, wordResults } = resolveOperationCell(
		operator,
		leftType,
		rightType,
	);

	if (isError) {
		return ERROR_RESULT;
	}

	return `${portable} [${wordResults.join(WORD_RESULTS_SEPARATOR)}]`;
};

const renderComparisonResult = (operator, leftType, rightType) => {
	return resolveComparisonCell(leftType, rightType).portable;
};

const buildRows = (operators, renderRowFor) => {
	const lines = [];

	for (const operator of operators) {
		lines.push(`// Operator "${operator}"`);

		for (const { leftType, rightType } of TYPE_PAIRS) {
			lines.push(
				`${leftType} ${operator} ${rightType} = ${renderRowFor(
					operator,
					leftType,
					rightType,
				)}`,
			);
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

const TABLE_PIPE = "|";
const TABLE_PIPE_ESCAPE = "\\|";

// A pipe inside a code span still splits a GFM table cell, so escape it.
const renderCode = (value) => {
	return `\`${value.replaceAll(TABLE_PIPE, TABLE_PIPE_ESCAPE)}\``;
};

const renderMarkdownRow = (cells) => {
	return `| ${cells.join(" | ")} |`;
};

const renderMarkdownSeparator = (columnCount) => {
	return renderMarkdownRow(
		new Array(columnCount).fill("---"),
	);
};

const renderMarkdownOperationRow = (operator, leftType, rightType) => {
	const { portable, wordResults } = resolveOperationCell(
		operator,
		leftType,
		rightType,
	);
	return renderMarkdownRow([
		renderCode(leftType),
		renderCode(rightType),
		renderCode(portable),
		...wordResults.map(renderCode),
	]);
};

const renderMarkdownComparisonRow = (operator, leftType, rightType) => {
	const { portable } = resolveComparisonCell(leftType, rightType);
	return renderMarkdownRow([
		renderCode(leftType),
		renderCode(rightType),
		renderCode(portable),
	]);
};

const buildMarkdownOperatorSection = (operator, label, columnTitles, renderRow) => {
	const lines = [
		`### ${label} \`${operator}\``,
		"",
		renderMarkdownRow(columnTitles),
		renderMarkdownSeparator(columnTitles.length),
	];

	for (const { leftType, rightType } of TYPE_PAIRS) {
		lines.push(renderRow(operator, leftType, rightType));
	}

	lines.push("");
	return lines.join("\n");
};

const buildMarkdownSections = (operators, label, columnTitles, renderRow) => {
	const sections = [];

	for (const operator of operators) {
		sections.push(
			buildMarkdownOperatorSection(operator, label, columnTitles, renderRow),
		);
	}

	return sections.join("\n");
};

const buildMarkdownCanonicalRow = (canonicalCase) => {
	const resolved = Number.isInteger(canonicalCase.foldedValue)
		? resolveFoldedCell(canonicalCase.foldedValue)
		: resolveOperationCell(
				canonicalCase.operator,
				canonicalCase.leftType,
				canonicalCase.rightType,
			);
	return renderMarkdownRow([
		renderCode(canonicalCase.expression),
		`${renderCode(canonicalCase.leftType)}, ${renderCode(canonicalCase.rightType)}`,
		renderCode(resolved.portable),
		...resolved.wordResults.map(renderCode),
		canonicalCase.note,
	]);
};

const buildMarkdownCanonicalTable = () => {
	const columnTitles = [
		"Expression",
		"Operands",
		"Portable",
		...OPERATION_COLUMN_TITLES.slice(3),
		"Note",
	];
	const lines = [
		renderMarkdownRow(columnTitles),
		renderMarkdownSeparator(columnTitles.length),
	];

	for (const canonicalCase of CANONICAL_CASES) {
		lines.push(buildMarkdownCanonicalRow(canonicalCase));
	}

	return lines.join("\n");
};

const buildMarkdownDocument = () => {
	const lines = [
		DOCUMENT_TITLE,
		"",
		"This page lists the result type of every binary operator for every numeric",
		"operand pair. It is generated from `resolveBinaryOperationType` and",
		"`normalizeOperandTypes` in `embedito95-core`, the same source of truth as",
		"the `binary-operations.txt` and `binary-comparisons.txt` regression",
		"fixtures in `packages/test/src/language/snapshots/`. Do not edit it by",
		"hand: regenerate it with the command in [Regeneration](#regeneration).",
		"",
		"## Legend",
		"",
		"- **Portable** is the result type when the target word size is not",
		"  considered. It is the first value in the `.txt` fixtures.",
		"- **16-bit / 32-bit / 64-bit** is the final type on each supported word",
		"  size. The result is widened to the word, preferring the signed word when",
		"  it fits: `u8 + u8` is portable `u8`, but `i16`/`i32`/`i64` on AVR, ARM and",
		"  native targets respectively.",
		"- **`int | f32` (or `int | f64`)** means the integer intermediate is `int`,",
		"  but when the result is stored to a float target that float type is used",
		"  instead.",
		"- **`error`** marks an operator the operands do not accept (for example `%`",
		"  with floats, or a comparison that mixes an integer with a float).",
		"- Pairs are listed once (symmetric): the right operand starts at the left",
		"  operand's position, so `i8 + u8` is not repeated after `u8 + i8`.",
		"",
		"## Arithmetic operators",
		"",
		buildMarkdownSections(
			ARITHMETIC_OPERATORS,
			"Arithmetic",
			OPERATION_COLUMN_TITLES,
			renderMarkdownOperationRow,
		),
		"## Comparison operators",
		"",
		"Comparisons always produce `boolean`; the value in parentheses is the type",
		"both operands are promoted to before comparing (the C++ signed/unsigned",
		"gotcha is avoided by widening to a signed type when signedness mixes). The",
		"fixture pins one promoted type per pair, independent of the target word",
		"size, so these tables have a single result column.",
		"",
		buildMarkdownSections(
			COMPARISON_OPERATORS,
			"Comparison",
			COMPARISON_COLUMN_TITLES,
			renderMarkdownComparisonRow,
		),
		"## Canonical cases",
		"",
		buildMarkdownCanonicalTable(),
		"",
		"`u32 * u32` stays `u32` on 16- and 32-bit targets, so a product above the",
		"`u32` range wraps silently instead of promoting to a wider type. Use a",
		"wider type or an explicit check when the product may overflow; the pending",
		"language decision is tracked as",
		"[F-033](../../../worklog/follow-up.md).",
		"",
		"## Operators and library parameters",
		"",
		"Binary operators and library parameters promote differently on purpose.",
		"See [Expressions](expressions.md#binary-operations) for the operator rules",
		"in prose.",
		"",
		"- **Binary arithmetic decides its width by the presence of `f64`.** With",
		"  one `f64` operand the float branch is `f64`; two float operands below",
		"  that use `f32`, and mixing an integer with a float uses the float",
		"  width. A cell such as `i32 | f32` lists both branches: the integer type",
		"  is the intermediate before any float context, and the part after the",
		"  pipe is the float branch used when the operation runs in a float",
		"  context or its result is stored into a float destination. Without such",
		"  a float context the intermediate stays integer, so `i32 + i32` is an",
		"  integer result. An integer is not widened by the full range of its",
		"  type, so `i32 + f32` uses `f32` even though the `i32` range exceeds",
		"  `f32` precision. This is an intentional design decision, recorded as",
		"  discarded in [F-042](../../../worklog/follow-up.md): a binary",
		"  operation does not promise to preserve the argument type's range.",
		"- **Comparisons reject integer/float mixes.** Two floats compare as floats",
		"  and two integers compare after the same common-type promotion, but",
		"  combining an integer with a float is a compile error, not an implicit",
		"  conversion.",
		"- **Library parameters widen by the range of the integer type.** In",
		"  [`math`](../libraries/core/math.md), an integer argument next to a float",
		"  keeps `f32` when the whole range of its type fits exactly",
		"  (`i8`/`i16`/`u8`/`u16`) and needs `f64` otherwise (`i32`/`i64`/`u32`/",
		"  `u64`), because the parameter promises to preserve that range. The",
		"  canonical case is `clamp(u32, i32, i32)` promoting to `i64`.",
		"",
		"## Regeneration",
		"",
		"This page and both `.txt` fixtures are written by the same generator. From",
		"the repository root:",
		"",
		"```sh",
		"pnpm run test:snapshot",
		"```",
		"",
		"`pnpm run test` compares all three generated files and fails on any",
		"mismatch, so the page stays in sync with the checker. The generator can",
		"also be invoked directly:",
		"",
		"```sh",
		"node packages/test/src/language/generate-type-table.mjs",
		"```",
		"",
	];

	return `${lines.join("\n")}`;
};

export const listTypeTableSnapshots = () => {
	return [
		...listSnapshots("binary-operations.txt", buildOperationsTable()),
		...listSnapshots("binary-comparisons.txt", buildComparisonTable()),
		...listDocumentSnapshots(DOCUMENT_FILE_NAME, buildMarkdownDocument()),
	];
};

export const writeTypeTableSnapshots = () => {
	writeSnapshots(listTypeTableSnapshots());
};

if (isMainModule(import.meta.url)) {
	writeTypeTableSnapshots();
	console.log(
		`Generated binary-operations.txt, binary-comparisons.txt and ${DOCUMENT_FILE_NAME}`,
	);
}
