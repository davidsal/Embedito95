// VSCode indentation checks (T-028j): the `indentationRules` shipped in
// `language-configuration.json` must not treat a `}` written inside a template
// literal (or inside template text) as a block close, and must not increase the
// indentation because of a `${` interpolation. The checks load the real JSON
// and evaluate its patterns so the editor behaviour cannot drift from the file.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { UTF8 } from "embedito95-core";
import {
	SNAPSHOT_STATUS,
	VSCODE_INDENTATION_UNIT_CHECKS_GROUP,
	VSCODE_LANGUAGE_CONFIGURATION_FILE,
} from "./constants.js";
import { expectEqual, reportUnitChecks } from "./reporting.js";

const INCREASE_PATTERN_KEY = "increaseIndentPattern";
const DECREASE_PATTERN_KEY = "decreaseIndentPattern";
const PATTERN_TYPE = "string";
// Built from pieces so the lint rule for `${` inside plain strings stays quiet.
const TEMPLATE_INTERPOLATION_OPEN = "$" + "{";

const LANGUAGE_CONFIGURATION = JSON.parse(
	readFileSync(VSCODE_LANGUAGE_CONFIGURATION_FILE, UTF8),
);
const INDENTATION_RULES = LANGUAGE_CONFIGURATION.indentationRules;

const INCREASE_INDENT_PATTERN = new RegExp(
	INDENTATION_RULES[INCREASE_PATTERN_KEY],
);
const DECREASE_INDENT_PATTERN = new RegExp(
	INDENTATION_RULES[DECREASE_PATTERN_KEY],
);

const DECREASE_INDENT_NEGATIVE_CASES = [
	{
		description:
			"decrease does not fire on a call whose template interpolation ends with a brace",
		sample: `console.log(\`One: ${TEMPLATE_INTERPOLATION_OPEN}counter}}\`)`,
	},
	{
		description:
			"decrease does not fire on template text that is only a closing brace",
		sample: "`}`",
	},
	{
		description: "decrease does not fire on template text containing a brace",
		sample: "const templateText = `left } right`",
	},
	{
		description:
			"decrease does not fire on a string literal containing a brace",
		sample: 'const braceText: string = "}"',
	},
	{
		description:
			"decrease does not fire on a line that closes a brace after code",
		sample: "    return value}",
	},
];

const DECREASE_INDENT_POSITIVE_CASES = [
	{
		description: "decrease fires on an indented block close",
		sample: "    }",
	},
	{
		description: "decrease fires on an indented call close",
		sample: "    })",
	},
	{
		description: "decrease fires on an indented else branch",
		sample: "    } else {",
	},
	{
		description: "decrease fires on an unindented block close",
		sample: "}",
	},
	{
		description: "decrease fires on a block close followed by a semicolon",
		sample: "    };",
	},
	{
		description: "decrease fires on a call close followed by a semicolon",
		sample: "  });",
	},
	{
		description: "decrease fires on a catch branch",
		sample: "} catch (error) {",
	},
	{
		description: "decrease fires on a finally branch",
		sample: "    } finally {",
	},
	{
		description: "decrease fires on a do-while close",
		sample: "    } while (index < limit)",
	},
	{
		description: "decrease fires on a block close with a trailing comment",
		sample: "    } // fin",
	},
	{
		description: "decrease fires on a call close with a trailing comment",
		sample: "    }); // done",
	},
	{
		description: "decrease fires on a comma close with a trailing comment",
		sample: "    }, // item",
	},
];

const INCREASE_INDENT_NEGATIVE_CASES = [
	{
		description:
			"increase does not fire on a template interpolation spanning the line",
		sample: `console.log(\`One: ${TEMPLATE_INTERPOLATION_OPEN}counter}\`)`,
	},
	{
		description:
			"increase does not fire on an unterminated template interpolation start",
		sample: `const s = \`${TEMPLATE_INTERPOLATION_OPEN}`,
	},
	{
		description: "increase does not fire on template text without a block",
		sample: "const text = `value`",
	},
];

const INCREASE_INDENT_POSITIVE_CASES = [
	{
		description: "increase fires on an arrow function block",
		sample: "const f = () => {",
	},
	{
		description: "increase fires on an if block",
		sample: "if (x) {",
	},
	{
		description: "increase fires on a while block",
		sample: "while (true) {",
	},
	{
		description: "increase fires on an else block",
		sample: "    } else {",
	},
	{
		description: "increase fires on a for block",
		sample: "for (const item of items) {",
	},
	{
		description: "increase fires on an if block after a string comparison",
		sample: 'if (mode === "fast") {',
	},
	{
		description: "increase fires on a while block after a string comparison",
		sample: 'while (state !== "done") {',
	},
	{
		description: "increase fires on a for block with string literal items",
		sample: 'for (const item of ["a", "b"]) {',
	},
	{
		description: "increase fires on an if block after a typeof check",
		sample: 'if (typeof value === "number") {',
	},
];

const buildIndentationCases = () => {
	const cases = [];

	for (const testCase of DECREASE_INDENT_NEGATIVE_CASES) {
		cases.push({
			...testCase,
			pattern: DECREASE_INDENT_PATTERN,
			expected: false,
		});
	}
	for (const testCase of DECREASE_INDENT_POSITIVE_CASES) {
		cases.push({
			...testCase,
			pattern: DECREASE_INDENT_PATTERN,
			expected: true,
		});
	}
	for (const testCase of INCREASE_INDENT_NEGATIVE_CASES) {
		cases.push({
			...testCase,
			pattern: INCREASE_INDENT_PATTERN,
			expected: false,
		});
	}
	for (const testCase of INCREASE_INDENT_POSITIVE_CASES) {
		cases.push({
			...testCase,
			pattern: INCREASE_INDENT_PATTERN,
			expected: true,
		});
	}

	return cases;
};

const INDENTATION_CASES = buildIndentationCases();

const checkIndentationPatternsAreDeclared = () => {
	return [
		expectEqual(
			"language configuration declares an increase indent pattern",
			typeof INDENTATION_RULES[INCREASE_PATTERN_KEY],
			PATTERN_TYPE,
		),
		expectEqual(
			"language configuration declares a decrease indent pattern",
			typeof INDENTATION_RULES[DECREASE_PATTERN_KEY],
			PATTERN_TYPE,
		),
	];
};

const checkIndentationCase = (testCase) => {
	return expectEqual(
		testCase.description,
		testCase.pattern.test(testCase.sample),
		testCase.expected,
	);
};

export const runVscodeIndentationChecks = () => {
	return [
		...checkIndentationPatternsAreDeclared(),
		...INDENTATION_CASES.map(checkIndentationCase),
	];
};

const reportDirectRun = () => {
	const results = runVscodeIndentationChecks();
	reportUnitChecks(VSCODE_INDENTATION_UNIT_CHECKS_GROUP, results);
	const hasMismatch = results.some((result) => {
		return result.status === SNAPSHOT_STATUS.mismatch;
	});
	if (hasMismatch) {
		process.exitCode = 1;
	}
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
	reportDirectRun();
}
