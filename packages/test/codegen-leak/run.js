// Compiles a real Embedito95 program through the actual codegen (cli build),
// then compiles the generated translation unit on the HOST with the shared
// Array/Object runtime and runs it, asserting that the emitted code releases
// every block it allocates (no leaks).
//
// The generated `.ino` is not device-runnable, so we:
//   1. build a fixture in a temp arduino-nano project with the real compiler;
//   2. take the emitted translation unit (it only needs `core_system.h` and
//      `core_type.h` for a serial-free program);
//   3. satisfy those includes with host stand-ins (host/core_*.h) and point the
//      real Array/Object headers (host-compilable) at the tester's core dir;
//   4. append a driver that counts net live `malloc`/`free` calls around the
//      generated `setup()`; a nonzero delta means the codegen leaked.
import { execFileSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BUILD_DIRECTORY_NAME,
	CONFIG_FILE,
	CORE_LIBRARIES_DIRECTORY_NAME,
	ENTRY_OPTION,
	LIBRARIES_DIRECTORY_NAME,
	UTF8,
} from "embedito95-core";
import {
	BUILD_COMMAND,
	GITIGNORE_CONTENT,
	GITIGNORE_FILE,
	NODE_EXECUTABLE,
} from "../constants.js";
import {
	CLI_PATH,
	COMPILER,
	CPP_STANDARD_ARGUMENT,
	INCLUDE_ARGUMENT,
	listScenarios,
	OUTPUT_ARGUMENT,
	runCompiledBinary,
	runScenarioSuite,
	TESTER_PLATFORM_NAME,
	TESTERS_DIRECTORY,
	withTemporaryDirectory,
} from "../runner-harness.js";

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const HOST_INCLUDE_DIRECTORY = join(MODULE_DIRECTORY, "host");

const ENTRY_FILE_NAME = "main.e95";
const TRANSLATION_UNIT_EXTENSION = ".ino";
const SOURCE_EXTENSION = ".cpp";
const CORE_BANNER_PATTERN = /^\/\/ CORE\n/;
const PROJECT_DIRECTORY_NAME = "project";
const TYPE_DIRECTORY_NAME = "type";
const SYSTEM_DIRECTORY_NAME = "system";
const TEMP_DIRECTORY_PREFIX = "embedito95-leak-";

const DRIVER_SOURCE = `
// Host leak driver: counts net live allocations around the generated setup().
#include <dlfcn.h>
#include <stddef.h>
#include <stdio.h>

static long g_live = 0;

extern "C" void *malloc(size_t n) {
	static auto real = (void *(*)(size_t))dlsym(RTLD_NEXT, "malloc");
	void *p = real(n);
	if (p) {
		g_live++;
	}
	return p;
}

extern "C" void free(void *p) {
	static auto real = (void (*)(void *))dlsym(RTLD_NEXT, "free");
	if (p) {
		g_live--;
	}
	real(p);
}

extern "C" void *realloc(void *p, size_t n) {
	static auto real = (void *(*)(void *, size_t))dlsym(RTLD_NEXT, "realloc");
	if (p) {
		g_live--;
	}
	void *r = real(p, n);
	if (r) {
		g_live++;
	}
	return r;
}

void setup();
void loop();

int main() {
	long before = g_live;
	setup();
	long after = g_live;
	printf("live allocations: before=%ld after=%ld\\n", before, after);
	return (after - before) == 0 ? 0 : 1;
}
`;

const mkdirProject = (projectDirectory) => {
	mkdirSync(projectDirectory, { recursive: true });
	for (const child of [
		CORE_LIBRARIES_DIRECTORY_NAME,
		LIBRARIES_DIRECTORY_NAME,
	]) {
		cpSync(join(TESTERS_DIRECTORY, child), join(projectDirectory, child), {
			recursive: true,
		});
	}
	cpSync(
		join(TESTERS_DIRECTORY, CONFIG_FILE),
		join(projectDirectory, CONFIG_FILE),
	);
	writeFileSync(join(projectDirectory, GITIGNORE_FILE), GITIGNORE_CONTENT);
};

const buildFixture = (temporaryDirectory, scenario) => {
	const projectDirectory = join(temporaryDirectory, PROJECT_DIRECTORY_NAME);
	mkdirProject(projectDirectory);
	writeFileSync(
		join(projectDirectory, ENTRY_FILE_NAME),
		readFileSync(join(MODULE_DIRECTORY, scenario), UTF8),
		UTF8,
	);
	execFileSync(
		NODE_EXECUTABLE,
		[CLI_PATH, BUILD_COMMAND, ENTRY_OPTION, ENTRY_FILE_NAME],
		{
			cwd: projectDirectory,
			env: { ...process.env, INIT_CWD: projectDirectory },
			stdio: "pipe",
		},
	);
	const buildDirectory = join(
		projectDirectory,
		BUILD_DIRECTORY_NAME,
		TESTER_PLATFORM_NAME,
	);
	const translationUnit = readdirSync(buildDirectory).find((name) => {
		return name.endsWith(TRANSLATION_UNIT_EXTENSION);
	});
	if (!translationUnit) {
		throw new Error(`no generated .ino for ${scenario}`);
	}
	return {
		projectDirectory,
		source: readFileSync(join(buildDirectory, translationUnit), UTF8),
	};
};

const hostTranslationUnit = (source) => {
	const body = source.replace(CORE_BANNER_PATTERN, "");
	return `${body}${DRIVER_SOURCE}`;
};

const buildCompileArguments = (projectDirectory, sourcePath, binary) => {
	return [
		CPP_STANDARD_ARGUMENT,
		INCLUDE_ARGUMENT,
		HOST_INCLUDE_DIRECTORY,
		INCLUDE_ARGUMENT,
		join(
			projectDirectory,
			CORE_LIBRARIES_DIRECTORY_NAME,
			TYPE_DIRECTORY_NAME,
			BUILD_DIRECTORY_NAME,
		),
		INCLUDE_ARGUMENT,
		join(
			projectDirectory,
			CORE_LIBRARIES_DIRECTORY_NAME,
			SYSTEM_DIRECTORY_NAME,
			BUILD_DIRECTORY_NAME,
		),
		sourcePath,
		OUTPUT_ARGUMENT,
		binary,
	];
};

const runScenario = (temporaryDirectory, scenario) => {
	const { projectDirectory, source } = buildFixture(
		temporaryDirectory,
		scenario,
	);
	const binary = join(temporaryDirectory, `${scenario}.bin`);
	const sourcePath = join(temporaryDirectory, `${scenario}${SOURCE_EXTENSION}`);
	writeFileSync(sourcePath, hostTranslationUnit(source), UTF8);

	const compileArguments = buildCompileArguments(
		projectDirectory,
		sourcePath,
		binary,
	);
	execFileSync(COMPILER, compileArguments, { stdio: "pipe" });
	runCompiledBinary(binary, { stdio: "inherit" });
};

const main = () => {
	const failures = withTemporaryDirectory(
		TEMP_DIRECTORY_PREFIX,
		(directory) => {
			return runScenarioSuite({
				scenarios: listScenarios(MODULE_DIRECTORY),
				runScenario: runScenario.bind(null, directory),
				passSuffix: " (no leak)",
			});
		},
	);
	process.exit(failures.length > 0 ? 1 : 0);
};

main();
