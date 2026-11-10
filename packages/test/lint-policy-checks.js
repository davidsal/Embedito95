import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { UTF8 } from "embedito95-core";
import {
	DOCS_DIRECTORIES,
	LINT_FIX_SCRIPT_NAME,
	LINT_SCRIPT_NAME,
	ROOT_PACKAGE_FILE,
	WRITE_FLAG,
} from "./constants.js";
import { expectEqual } from "./reporting.js";

// Regression guard for TICKET-17: `pnpm run lint` must only verify (read-only).
// The auto-fixing `biome check --write` side effect moved to the `lint:fix`
// script, so running `lint` can never rewrite files outside the validated
// scope. These checks read the root package.json and fail if the write flag
// ever sneaks back into `lint` or if `lint:fix` disappears.
const readRootPackageScripts = () => {
	const packageContent = readFileSync(ROOT_PACKAGE_FILE, UTF8);
	return JSON.parse(packageContent).scripts;
};

const isScriptDefined = (scripts, scriptName) => {
	return typeof scripts[scriptName] === "string";
};

const scriptRewritesFiles = (scripts, scriptName) => {
	return scripts[scriptName].includes(WRITE_FLAG);
};

// Docs must show `core` and `libraries` as lists of package names. A JSON
// object such as `"core": { ... }` means libraries are versioned separately
// again, which T-011 removed.
const OBJECT_CONFIGURATION_PATTERN = /"(?:core|libraries)"\s*:\s*\{/;
const MARKDOWN_EXTENSION = ".md";

const findObjectConfigurationMatches = (filePath) => {
	const lines = readFileSync(filePath, UTF8).split("\n");

	return lines.flatMap((line, lineIndex) => {
		if (!OBJECT_CONFIGURATION_PATTERN.test(line)) {
			return [];
		}
		return [`${filePath}:${lineIndex + 1}`];
	});
};

const collectDocObjectConfigurationMatches = () => {
	const matches = [];

	for (const docsDirectory of DOCS_DIRECTORIES) {
		if (!existsSync(docsDirectory)) {
			continue;
		}

		for (const fileName of readdirSync(docsDirectory)) {
			if (!fileName.endsWith(MARKDOWN_EXTENSION)) {
				continue;
			}
			matches.push(
				...findObjectConfigurationMatches(join(docsDirectory, fileName)),
			);
		}
	}

	return matches;
};

export const runLintPolicyChecks = () => {
	const scripts = readRootPackageScripts();

	return [
		expectEqual(
			"root lint script verifies without rewriting files",
			isScriptDefined(scripts, LINT_SCRIPT_NAME) &&
				!scriptRewritesFiles(scripts, LINT_SCRIPT_NAME),
			true,
		),
		expectEqual(
			"root lint fix script exists and rewrites files",
			isScriptDefined(scripts, LINT_FIX_SCRIPT_NAME) &&
				scriptRewritesFiles(scripts, LINT_FIX_SCRIPT_NAME),
			true,
		),
		expectEqual(
			"docs list core and libraries as package-name arrays without a version map",
			collectDocObjectConfigurationMatches().join("\n"),
			"",
		),
	];
};
