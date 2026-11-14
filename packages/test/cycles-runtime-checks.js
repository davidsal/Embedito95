// T-036: the cycle collector switch now comes from the generated `e95_config.h`,
// not from a `-D` compile argument. This host probe compiles the real `ref.h`
// runtime with an `e95_config.h` on the include path: value 0 must compile the
// collector out (a self cycle leaks, exit 1) and value 1 must reclaim it (exit
// 0). A third probe compiles with no config and no `-D`, proving the `ref.h`
// default `E95_CYCLES 1` still collects.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UTF8, writeCyclesConfigHeader } from "embedito95-core";
import { expectEqual } from "./reporting.js";
import {
	COMPILER,
	PACKAGE_DIRECTORY,
	REPOSITORY_ROOT,
} from "./runner-harness.js";

const CXX11_STANDARD_ARGUMENT = "-std=c++11";
const SYNTAX_ONLY_ARGUMENT = "-fsyntax-only";
const INCLUDE_ARGUMENT = "-I";
const OUTPUT_ARGUMENT = "-o";
const TEMPORARY_DIRECTORY_PREFIX = "embedito95-cycles-runtime-";
const PROBE_SOURCE = `#include "packages/registry/src/strategies/shared/memory/ref.h"

using core_mem::Ref;
using core_mem::RefBox;
using core_mem::TraceVisitor;
using core_mem::TypeInfo;

struct Node {
	static int live;
	int id;
	Ref<Node> next;

	explicit Node(int value) : id(value) {
		live++;
	}

	~Node() {
		live--;
	}
};

int Node::live = 0;

static void traceNode(void *box, TraceVisitor visit) {
	RefBox<Node> *typed = (RefBox<Node> *)box;
	typed->value.next.traceChild(visit);
}

static const TypeInfo NODE_TYPE_INFO = {
	&core_mem::destroyRefBox<Node>,
	&traceNode,
};

namespace core_mem {

template <>
struct TypeInfoOf<::Node> {
	static const TypeInfo *get() noexcept {
		return &NODE_TYPE_INFO;
	}
};

} // namespace core_mem

int main() {
	{
		Ref<Node> node = Ref<Node>::emplace(1);
		node->next = node;
	}
#if E95_CYCLES
	core_mem::collectCycles();
#endif
	return Node::live;
}
`;

const REF_TEST_FILE = join(PACKAGE_DIRECTORY, "runtime-tests", "ref.test.cpp");
const REF_CYCLES_TEST_FILE = join(
	PACKAGE_DIRECTORY,
	"runtime-tests",
	"ref-cycles.test.cpp",
);

const isHostCompilerAvailable = () => {
	try {
		execFileSync(COMPILER, ["--version"], { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
};

const buildProbe = ({ rootDirectory, label, cycles }) => {
	const probeDirectory = join(rootDirectory, `probe-${label}`);
	mkdirSync(probeDirectory, { recursive: true });
	const sourcePath = join(probeDirectory, "probe.cpp");
	const binaryPath = join(probeDirectory, "probe.bin");
	writeFileSync(sourcePath, PROBE_SOURCE, UTF8);

	const configArguments = [];
	if (cycles !== null) {
		const configDirectory = join(probeDirectory, "config");
		writeCyclesConfigHeader(configDirectory, cycles);
		configArguments.push(INCLUDE_ARGUMENT, configDirectory);
	}

	execFileSync(COMPILER, [
		CXX11_STANDARD_ARGUMENT,
		INCLUDE_ARGUMENT,
		REPOSITORY_ROOT,
		...configArguments,
		sourcePath,
		OUTPUT_ARGUMENT,
		binaryPath,
	]);
	return binaryPath;
};

const runProbe = (binaryPath) => {
	try {
		execFileSync(binaryPath, [], { stdio: "pipe" });
		return 0;
	} catch (error) {
		return error.status;
	}
};

const compileOnly = ({ label, sourcePath }) => {
	try {
		execFileSync(COMPILER, [
			CXX11_STANDARD_ARGUMENT,
			SYNTAX_ONLY_ARGUMENT,
			INCLUDE_ARGUMENT,
			REPOSITORY_ROOT,
			sourcePath,
		]);
		return { label, succeeded: true };
	} catch {
		return { label, succeeded: false };
	}
};

export const checkCollectorIsCompiledOutWhenDisabled = () => {
	if (!isHostCompilerAvailable()) {
		return [
			expectEqual(
				"cycles probe skipped because the host compiler is unavailable",
				true,
				true,
			),
		];
	}

	const rootDirectory = mkdtempSync(join(tmpdir(), TEMPORARY_DIRECTORY_PREFIX));
	try {
		const offBinary = buildProbe({
			rootDirectory,
			label: "off",
			cycles: false,
		});
		const onBinary = buildProbe({
			rootDirectory,
			label: "on",
			cycles: true,
		});
		const fallbackBinary = buildProbe({
			rootDirectory,
			label: "fallback",
			cycles: null,
		});

		const refCompile = compileOnly({
			label: "ref.test.cpp",
			sourcePath: REF_TEST_FILE,
		});
		const refCyclesCompile = compileOnly({
			label: "ref-cycles.test.cpp",
			sourcePath: REF_CYCLES_TEST_FILE,
		});

		return [
			expectEqual(
				"a self cycle leaks with e95_config.h E95_CYCLES 0",
				runProbe(offBinary),
				1,
			),
			expectEqual(
				"the collector reclaims the self cycle with e95_config.h E95_CYCLES 1",
				runProbe(onBinary),
				0,
			),
			expectEqual(
				"the ref.h default E95_CYCLES 1 collects without a config header",
				runProbe(fallbackBinary),
				0,
			),
			expectEqual(
				"ref.test.cpp compiles standalone without a config header",
				refCompile.succeeded,
				true,
			),
			expectEqual(
				"ref-cycles.test.cpp compiles standalone without a config header",
				refCyclesCompile.succeeded,
				true,
			),
		];
	} finally {
		rmSync(rootDirectory, { recursive: true, force: true });
	}
};
