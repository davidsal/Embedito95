// Compiles and runs the C++ host unit tests under runtime-tests/ against the
// shared runtime headers, using the host toolchain (clang++/g++). This is the
// only place refcount/leak semantics can be validated, since the snapshot tests
// never compile the generated C++.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	COMPILER,
	CPP_STANDARD_ARGUMENT,
	FRAME_POINTER_ARGUMENT,
	INCLUDE_ARGUMENT,
	OUTPUT_ARGUMENT,
	PACKAGE_DIRECTORY,
	REPOSITORY_ROOT,
	runCompiledBinary,
	SANITIZER_ARGUMENTS,
} from "./runner-harness.js";

const TESTS_DIRECTORY = join(PACKAGE_DIRECTORY, "runtime-tests");
const TEST_EXTENSION = ".test.cpp";
const SOURCE_EXTENSION = ".cpp";
const BINARY_EXTENSION = ".bin";
const WARNING_ARGUMENTS = ["-Wall", "-Wextra", "-Werror"];

// Stand-in headers for runtime tests that compile a real generated core header
// on the host (e.g. the arduino serial overload surface against an AVR-like
// `Print`). Keeping them on the include path lets a test `#include` the real
// strategy template through its angle-bracket includes.
const HOST_STANDIN_DIRECTORY = join(TESTS_DIRECTORY, "host");

// The generated STM32 engine headers include `<core_int128.h>` by name and mix
// quoted `../type/...` includes with angle-bracket type includes. A test that
// compiles a real STM32 engine translation unit must resolve the whole type
// surface from the generated headers, so the generated type directory is put
// ahead of the host stand-ins for those tests only. Every other test keeps the
// AVR-oriented host stand-ins first.
const STM32_GENERATED_TYPE_DIRECTORY = join(
	PACKAGE_DIRECTORY,
	"src",
	"stm32-bluepill",
	"snapshots",
	"engine",
	"type",
);
const STM32_ENGINE_MARKER = "stm32-bluepill/snapshots/engine";

const compilesGeneratedStm32Engine = (testFile) => {
	return readFileSync(testFile, "utf8").includes(STM32_ENGINE_MARKER);
};

const includeDirectoriesFor = (testFile) => {
	if (compilesGeneratedStm32Engine(testFile)) {
		return [STM32_GENERATED_TYPE_DIRECTORY, HOST_STANDIN_DIRECTORY];
	}
	return [HOST_STANDIN_DIRECTORY];
};

const listTests = () => {
	return readdirSync(TESTS_DIRECTORY)
		.filter((file) => {
			return file.endsWith(TEST_EXTENSION);
		})
		.map((file) => {
			return join(TESTS_DIRECTORY, file);
		});
};

const runTest = (testFile) => {
	const binary = `${testFile.slice(0, -SOURCE_EXTENSION.length)}${BINARY_EXTENSION}`;
	const includeArguments = includeDirectoriesFor(testFile).flatMap(
		(directory) => {
			return [INCLUDE_ARGUMENT, directory];
		},
	);
	const compileArgs = [
		CPP_STANDARD_ARGUMENT,
		...WARNING_ARGUMENTS,
		SANITIZER_ARGUMENTS,
		FRAME_POINTER_ARGUMENT,
		INCLUDE_ARGUMENT,
		REPOSITORY_ROOT,
		...includeArguments,
		testFile,
		OUTPUT_ARGUMENT,
		binary,
	];
	execFileSync(COMPILER, compileArgs, {
		cwd: REPOSITORY_ROOT,
		stdio: "inherit",
	});
	runCompiledBinary(binary, { cwd: REPOSITORY_ROOT, stdio: "inherit" });
};

const tests = listTests();
if (tests.length === 0) {
	console.error("no runtime tests found in runtime-tests/");
	process.exit(1);
}

const failures = [];
for (const testFile of tests) {
	const label = testFile.split("/").pop();
	console.log(`\n=== ${label} ===`);
	try {
		runTest(testFile);
		console.log(`PASS ${label}`);
	} catch (error) {
		failures.push(label);
		console.error(`FAIL ${label}`);
		console.error(error);
	}
}

process.exit(failures.length > 0 ? 1 : 0);
