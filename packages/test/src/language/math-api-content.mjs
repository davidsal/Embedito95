// Static prose and function groups of the math API reference. Generation lives
// in `generate-math-api.mjs`; keeping the text here leaves that module focused
// on rendering the declaration data.
import { CODE_FENCE } from "./markdown-rendering.mjs";

export const DOCUMENT_TITLE = "# Math API reference";
export const REGENERATION_HEADING = "## Regeneration";
export const REGENERATION_COMMAND = "pnpm run test:snapshot";
export const DIRECT_COMMAND =
	"node packages/test/src/language/generate-math-api.mjs";

// Group order is presentation only: within a group every function keeps the
// order it has in `main.e95`. A new function must be added to a group, so the
// page never silently drops one or collects it in an "other" bucket.
export const FUNCTION_GROUPS = [
	{
		title: "Integer range, clamping and magnitude",
		names: ["interpolateRange", "clamp", "absolute", "minimum", "maximum"],
	},
	{
		title: "Floating-point and trigonometry",
		names: [
			"interpolateRangeFloat",
			"clampFloat",
			"power",
			"squareRoot",
			"square",
			"naturalLog",
			"logarithm10",
			"exponential",
			"absoluteFloat",
			"minimumFloat",
			"maximumFloat",
			"roundDown",
			"roundUp",
			"roundNearest",
			"remainderFloat",
			"truncate",
			"sine",
			"cosine",
			"tangent",
			"arcSine",
			"arcCosine",
			"arcTangent",
			"arcTangent2",
			"toRadians",
			"toDegrees",
		],
	},
	{
		title: "Bit and byte helpers",
		names: [
			"readBitValue",
			"writeBitValue",
			"setBitValue",
			"clearBitValue",
			"lowByteValue",
			"highByteValue",
			"bitMask",
		],
	},
	{
		title: "Pseudo-random numbers",
		names: ["randomInteger", "seedRandom"],
	},
];

const DOCUMENT_PREAMBLE_LINES = [
	DOCUMENT_TITLE,
	"",
	"This page lists every function of the `math` core library. Most functions are",
	"declared once with a width family (`f32 | f64` or `i32 | i64 | u32`); the",
	"compiler expands that family into one concrete signature per width before",
	"type checking. The remaining functions have a fixed signature because their",
	"declaration does not depend on a width. Both forms are shown here together",
	"with the first line of the function's doc comment.",
	"",
	"The promotion rules and the width-selection table live in",
	"[Math](math.md); this page does not repeat them. Do not edit it by hand:",
	"regenerate it with the command in [Regeneration](#regeneration).",
	"",
];

const REGENERATION_LINES = [
	REGENERATION_HEADING,
	"",
	"This page is written by",
	"`packages/test/src/language/generate-math-api.mjs` from",
	"`packages/registry/src/core/math/main.e95`. From the repository root:",
	"",
	`${CODE_FENCE}sh`,
	REGENERATION_COMMAND,
	CODE_FENCE,
	"",
	"`pnpm run test` compares the page with the generated content and fails",
	"when the declaration and the page drift apart, so the page stays in sync",
	"with the library source. The generator can also be invoked directly:",
	"",
	`${CODE_FENCE}sh`,
	DIRECT_COMMAND,
	CODE_FENCE,
	"",
];

export const buildDocumentPreamble = () => {
	return DOCUMENT_PREAMBLE_LINES.join("\n");
};

export const buildRegenerationSection = () => {
	return REGENERATION_LINES.join("\n");
};
