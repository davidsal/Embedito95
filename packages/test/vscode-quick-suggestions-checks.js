// VSCode quick suggestion checks (T-044): the editor must offer completions
// inside e95 strings (template interpolations) while keeping comments silent.
// The checks load the real `package.json` shipped by the extension so the
// manifest defaults cannot drift from the completion behaviour.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { UTF8 } from "embedito95-core";
import {
	SNAPSHOT_STATUS,
	VSCODE_PACKAGE_FILE,
	VSCODE_QUICK_SUGGESTIONS_UNIT_CHECKS_GROUP,
} from "./constants.js";
import { expectEqual, reportUnitChecks } from "./reporting.js";

const LANGUAGE_SCOPE = "[e95]";
const QUICK_SUGGESTIONS_KEY = "editor.quickSuggestions";
const OTHER_KEY = "other";
const COMMENTS_KEY = "comments";
const STRINGS_KEY = "strings";

const EXTENSION_MANIFEST = JSON.parse(readFileSync(VSCODE_PACKAGE_FILE, UTF8));
const QUICK_SUGGESTIONS =
	EXTENSION_MANIFEST.contributes?.configurationDefaults?.[LANGUAGE_SCOPE]?.[
		QUICK_SUGGESTIONS_KEY
	] ?? {};

const checkQuickSuggestionsDefaults = () => {
	return [
		expectEqual(
			"e95 language defaults enable Quick Suggestions in other contexts",
			QUICK_SUGGESTIONS[OTHER_KEY],
			true,
		),
		expectEqual(
			"e95 language defaults disable Quick Suggestions inside comments",
			QUICK_SUGGESTIONS[COMMENTS_KEY],
			false,
		),
		expectEqual(
			"e95 language defaults enable Quick Suggestions inside strings",
			QUICK_SUGGESTIONS[STRINGS_KEY],
			true,
		),
	];
};

export const runVscodeQuickSuggestionsChecks = () => {
	return checkQuickSuggestionsDefaults();
};

const reportDirectRun = () => {
	const results = runVscodeQuickSuggestionsChecks();
	reportUnitChecks(VSCODE_QUICK_SUGGESTIONS_UNIT_CHECKS_GROUP, results);
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
