// Static prose, headings and canonical cases of the binary operator reference.
// Generation lives in `generate-type-table.mjs`; keeping the text here leaves
// that module focused on resolving and rendering the declaration data.
import { CODE_FENCE } from "./markdown-rendering.mjs";

export const DOCUMENT_FILE_NAME = "binary-operators.md";
export const DOCUMENT_TITLE = "# Binary operator result types";
export const LEGEND_HEADING = "## Legend";
export const ARITHMETIC_HEADING = "## Arithmetic operators";
export const COMPARISON_HEADING = "## Comparison operators";
export const CANONICAL_CASES_HEADING = "## Canonical cases";
export const OPERATORS_AND_PARAMETERS_HEADING =
	"## Operators and library parameters";
export const REGENERATION_HEADING = "## Regeneration";
export const REGENERATION_COMMAND = "pnpm run test:snapshot";
export const DIRECT_COMMAND =
	"node packages/test/src/language/generate-type-table.mjs";

export const WORD_SIZES = [16, 32, 64];
export const OPERATION_COLUMN_TITLES = [
	"Left",
	"Right",
	"Portable",
	...WORD_SIZES.map((wordSize) => {
		return `${wordSize}-bit`;
	}),
];
export const COMPARISON_COLUMN_TITLES = ["Left", "Right", "Result"];

export const ARITHMETIC_SECTION_LABEL = "Arithmetic";
export const COMPARISON_SECTION_LABEL = "Comparison";
export const OPERATOR_COMMENT_PREFIX = '// Operator "';
export const OPERATOR_COMMENT_SUFFIX = '"';

// The canonical examples the expressions page references. `1000 * 1000` is
// listed with its literal operand type (`i16`) and the folded value the checker
// actually sees, because constant folding widens the product to `i32`.
export const FOLDED_LITERAL_OPERAND = 1000;
export const FOLDED_LITERAL_PRODUCT =
	FOLDED_LITERAL_OPERAND * FOLDED_LITERAL_OPERAND;
export const CANONICAL_CASES = [
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

export const DOCUMENT_PREAMBLE_LINES = [
	DOCUMENT_TITLE,
	"",
	"This page lists the result type of every binary operator for every numeric",
	"operand pair. It is generated from `resolveBinaryOperationType` and",
	"`normalizeOperandTypes` in `embedito95-core`, the same source of truth as",
	"the `binary-operations.txt` and `binary-comparisons.txt` regression",
	"fixtures in `packages/test/src/language/snapshots/`. Do not edit it by",
	"hand: regenerate it with the command in [Regeneration](#regeneration).",
	"",
	LEGEND_HEADING,
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
];

export const COMPARISON_SECTION_LINES = [
	COMPARISON_HEADING,
	"",
	"Comparisons always produce `boolean`; the value in parentheses is the type",
	"both operands are promoted to before comparing (the C++ signed/unsigned",
	"gotcha is avoided by widening to a signed type when signedness mixes). The",
	"fixture pins one promoted type per pair, independent of the target word",
	"size, so these tables have a single result column.",
	"",
];

export const CANONICAL_OVERFLOW_NOTE_LINES = [
	"`u32 * u32` stays `u32` on 16- and 32-bit targets, so a product above the",
	"`u32` range wraps silently instead of promoting to a wider type. Use a",
	"wider type or an explicit check when the product may overflow; the pending",
	"language decision is tracked as",
	"[F-033](../../../worklog/follow-up.md).",
	"",
];

export const OPERATORS_AND_PARAMETERS_LINES = [
	OPERATORS_AND_PARAMETERS_HEADING,
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
];

// The `.txt` fixtures repeat the same header prose in their comment preamble,
// so the Markdown page and the regression fixtures cannot drift apart.
export const OPERATIONS_TABLE_HEADER_LINES = [
	"// Binary operation result types (numeric operands only)",
	"// Generated from resolveBinaryOperationType (see core/src/checker.js)",
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

export const COMPARISON_TABLE_HEADER_LINES = [
	"// Binary comparison result types (numeric operands only)",
	"// Comparisons always yield 'boolean'; the cast in parentheses is the type",
	"// the operands are promoted to before comparing (the C++ signed/unsigned",
	"// gotcha is avoided by widening to a signed type when signedness mixes).",
	"// Pairs are listed once (symmetric).",
	"",
];

export const REGENERATION_LINES = [
	REGENERATION_HEADING,
	"",
	"This page and both `.txt` fixtures are written by the same generator. From",
	"the repository root:",
	"",
	`${CODE_FENCE}sh`,
	REGENERATION_COMMAND,
	CODE_FENCE,
	"",
	"`pnpm run test` compares all three generated files and fails on any",
	"mismatch, so the page stays in sync with the checker. The generator can",
	"also be invoked directly:",
	"",
	`${CODE_FENCE}sh`,
	DIRECT_COMMAND,
	CODE_FENCE,
	"",
];
