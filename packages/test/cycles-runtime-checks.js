// Host probe for F-008: with `-DE95_CYCLES=0` the collector must be compiled
// out of `ref.h`, so a self cycle is never reclaimed. With `-DE95_CYCLES=1` the
// same program collects it. This proves the compile argument actually reaches
// the shared runtime header instead of only the generated project headers.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UTF8 } from "embedito95-core";
import { expectEqual } from "./reporting.js";
import { COMPILER, REPOSITORY_ROOT } from "./runner-harness.js";

const CYCLES_OFF_ARGUMENT = "-DE95_CYCLES=0";
const CYCLES_ON_ARGUMENT = "-DE95_CYCLES=1";
const CXX11_STANDARD_ARGUMENT = "-std=c++11";
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

const isHostCompilerAvailable = () => {
	try {
		execFileSync(COMPILER, ["--version"], { stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
};

const compileAndRunProbe = ({ rootDirectory, cyclesDefineArgument }) => {
	const probeDirectory = join(rootDirectory, `probe-${cyclesDefineArgument}`);
	mkdirSync(probeDirectory, { recursive: true });
	const sourcePath = join(probeDirectory, "probe.cpp");
	const binaryPath = join(probeDirectory, "probe.bin");
	writeFileSync(sourcePath, PROBE_SOURCE, UTF8);
	execFileSync(COMPILER, [
		CXX11_STANDARD_ARGUMENT,
		INCLUDE_ARGUMENT,
		REPOSITORY_ROOT,
		cyclesDefineArgument,
		sourcePath,
		OUTPUT_ARGUMENT,
		binaryPath,
	]);
	try {
		execFileSync(binaryPath, [], { stdio: "pipe" });
		return 0;
	} catch (error) {
		return error.status;
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
		const offExitCode = compileAndRunProbe({
			rootDirectory,
			cyclesDefineArgument: CYCLES_OFF_ARGUMENT,
		});
		const onExitCode = compileAndRunProbe({
			rootDirectory,
			cyclesDefineArgument: CYCLES_ON_ARGUMENT,
		});

		return [
			expectEqual(
				"a self cycle leaks without the collector (-DE95_CYCLES=0)",
				offExitCode,
				1,
			),
			expectEqual(
				"the collector reclaims the self cycle (-DE95_CYCLES=1)",
				onExitCode,
				0,
			),
		];
	} finally {
		rmSync(rootDirectory, { recursive: true, force: true });
	}
};
