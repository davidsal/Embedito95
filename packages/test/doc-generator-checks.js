import { expectEqual } from "./reporting.js";
import { assertGroupsMatchFunctions } from "./src/language/generate-math-api.mjs";
import {
	renderCode,
	renderMarkdownRow,
	renderMarkdownSeparator,
} from "./src/language/markdown-rendering.mjs";

const UNGROUPED_FUNCTION_NAME = "notAGroupedFunction";
// Both assertions pin the full message prefix, so an unrelated error cannot
// pass by sharing a fragment with the expected one.
const MISSING_GROUP_MESSAGE = `math API generator: no group for "${UNGROUPED_FUNCTION_NAME}" in FUNCTION_GROUPS`;
const MISSING_DECLARATION_MESSAGE =
	'math API generator: "interpolateRange" is grouped but not declared in main.e95';
const NO_ERROR_MESSAGE =
	"expected the action to throw, but it returned normally";

const captureError = (action) => {
	try {
		action();
	} catch (error) {
		return error;
	}
	return null;
};

// Returns `null` when the captured error matches the expected type and message
// prefix, or a descriptive string explaining the mismatch.
const describeErrorMessageMismatch = (
	error,
	expectedErrorType,
	expectedMessagePrefix,
) => {
	if (error === null) {
		return NO_ERROR_MESSAGE;
	}
	if (!(error instanceof expectedErrorType)) {
		return `expected ${expectedErrorType.name} but caught ${error?.constructor?.name ?? typeof error}`;
	}
	if (!error.message.startsWith(expectedMessagePrefix)) {
		return `${expectedErrorType.name} message does not start with ${JSON.stringify(expectedMessagePrefix)}: ${JSON.stringify(error.message)}`;
	}
	return null;
};

const checkThrownError = (
	label,
	action,
	expectedErrorType,
	expectedMessagePrefix,
) => {
	return expectEqual(
		label,
		describeErrorMessageMismatch(
			captureError(action),
			expectedErrorType,
			expectedMessagePrefix,
		),
		null,
	);
};

const runMarkdownRenderingChecks = () => {
	return [
		expectEqual("markdown code span wraps its value", renderCode("u8"), "`u8`"),
		expectEqual(
			"markdown code span escapes a table pipe",
			renderCode("int | f32"),
			"`int \\| f32`",
		),
		expectEqual(
			"markdown code span leaves an already escaped pipe untouched",
			renderCode("already \\| escaped"),
			"`already \\| escaped`",
		),
		expectEqual(
			"markdown code span escapes a pipe after an even backslash run",
			renderCode("a \\\\| b"),
			"`a \\\\\\| b`",
		),
		expectEqual(
			"markdown code span escapes every unescaped pipe",
			renderCode("a | b | c"),
			"`a \\| b \\| c`",
		),
		expectEqual(
			"markdown row joins cells with a pipe separator",
			renderMarkdownRow(["Left", "Right"]),
			"| Left | Right |",
		),
		expectEqual(
			"markdown row supports a single cell",
			renderMarkdownRow(["only"]),
			"| only |",
		),
		expectEqual(
			"markdown separator matches the column count",
			renderMarkdownSeparator(3),
			"| --- | --- | --- |",
		),
		expectEqual(
			"markdown separator supports two columns",
			renderMarkdownSeparator(2),
			"| --- | --- |",
		),
	];
};

export const runDocGeneratorChecks = () => {
	return [
		...runMarkdownRenderingChecks(),
		checkThrownError(
			"math API generator reports a function without a group",
			() => {
				assertGroupsMatchFunctions({ [UNGROUPED_FUNCTION_NAME]: {} });
			},
			Error,
			MISSING_GROUP_MESSAGE,
		),
		checkThrownError(
			"math API generator reports a grouped name without a declaration",
			() => {
				assertGroupsMatchFunctions({});
			},
			Error,
			MISSING_DECLARATION_MESSAGE,
		),
	];
};
