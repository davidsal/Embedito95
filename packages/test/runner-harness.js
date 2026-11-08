// Shared plumbing for the C++ host runners (runtime-test.js, codegen-run and
// codegen-leak): repository/package paths, the host compiler selection and the
// helpers that list scenarios, run a compiled binary and clean up a temp dir.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));

export const PACKAGE_DIRECTORY = MODULE_DIRECTORY;
export const REPOSITORY_ROOT = resolve(MODULE_DIRECTORY, "..", "..");
export const CLI_PATH = join(
	REPOSITORY_ROOT,
	"packages",
	"cli",
	"src",
	"cli.js",
);
export const COMPILER = process.env.E95_CXX || "clang++";
export const TESTER_PLATFORM_NAME = "arduino-nano";
export const TESTERS_DIRECTORY = join(
	PACKAGE_DIRECTORY,
	"testers",
	TESTER_PLATFORM_NAME,
);

export const CPP_STANDARD_ARGUMENT = "-std=c++17";
export const SANITIZER_ARGUMENTS = "-fsanitize=address,undefined";
export const FRAME_POINTER_ARGUMENT = "-fno-omit-frame-pointer";
export const INCLUDE_ARGUMENT = "-I";
export const OUTPUT_ARGUMENT = "-o";

export const ENTRY_EXTENSION = ".e95";
export const ENTRY_SUFFIX_PATTERN = /\.e95$/;

export const listScenarios = (directory) => {
	return readdirSync(directory).filter((file) => {
		return file.endsWith(ENTRY_EXTENSION);
	});
};

export const runCompiledBinary = (binary, options) => {
	try {
		execFileSync(binary, [], options);
	} finally {
		if (existsSync(binary)) {
			rmSync(binary);
		}
	}
};

export const withTemporaryDirectory = (prefix, callback) => {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	try {
		return callback(directory);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

// Runs every scenario, printing PASS/FAIL per label and returning the failed
// labels so the caller can exit with the right status after cleaning up.
export const runScenarioSuite = ({
	scenarios,
	runScenario,
	passSuffix = "",
}) => {
	const failures = [];
	for (const scenario of scenarios) {
		const label = scenario.replace(ENTRY_SUFFIX_PATTERN, "");
		console.log(`\n=== ${label} ===`);
		try {
			runScenario(scenario);
			console.log(`PASS ${label}${passSuffix}`);
		} catch (error) {
			failures.push(label);
			console.error(`FAIL ${label}`);
			console.error(error?.stderr?.toString() ?? error);
		}
	}
	return failures;
};
