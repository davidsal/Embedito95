// Syntax-checks every generated STM32 engine translation unit with the ARM
// bare-metal toolchain. The generated project has one `core_<module>.cpp` per
// engine module; compiling them all catches errors that only surface when the
// engine is built as a whole (e.g. constness violations in a class body) before
// they reach a device. The check is skipped, not failed, when the toolchain or
// the CMSIS/LL headers are unavailable, because stm32-syntax-check.js already
// owns the skip policy and exits 0 in that case.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_DIRECTORY } from "./runner-harness.js";
import { STM32_SNAPSHOT_DIRECTORY } from "./stm32-toolchain.js";

const SYNTAX_CHECK_SCRIPT = join(PACKAGE_DIRECTORY, "stm32-syntax-check.js");
const ENGINE_SOURCE_PATTERN = /^core_.*\.cpp$/;

const collectEngineSources = (directory) => {
	const sources = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const entryPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			sources.push(...collectEngineSources(entryPath));
			continue;
		}
		if (ENGINE_SOURCE_PATTERN.test(entry.name)) {
			sources.push(entryPath);
		}
	}
	return sources;
};

const runSyntaxCheck = (sourceFile) => {
	execFileSync(process.execPath, [SYNTAX_CHECK_SCRIPT, sourceFile], {
		cwd: PACKAGE_DIRECTORY,
		stdio: "inherit",
	});
};

const sources = collectEngineSources(STM32_SNAPSHOT_DIRECTORY).sort();

if (sources.length === 0) {
	console.error(
		`no generated engine sources found in ${STM32_SNAPSHOT_DIRECTORY}`,
	);
	process.exit(1);
}

const failures = [];
for (const sourceFile of sources) {
	try {
		runSyntaxCheck(sourceFile);
	} catch {
		failures.push(sourceFile);
	}
}

if (failures.length > 0) {
	console.error(
		`FAIL engine syntax checks: ${failures.length} source(s) failed`,
	);
	process.exit(1);
}

console.log(`PASS engine syntax checks (${sources.length} source(s))`);
