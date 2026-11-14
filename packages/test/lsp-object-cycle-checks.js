// Editor-facing checks for object reference cycles. Diagnostics come from
// `computeDiagnostics`, the same pipeline the language server runs. Cycles are
// handled at runtime by the trial-deletion collector, so the checker must NOT
// emit any static diagnostic for `obj.field = obj` (nullable or not, nested or
// not), nor for longer cycles. A real type error must still be reported.
import { pathToFileURL } from "node:url";
import { ERROR_CODE } from "embedito95-core";
import { computeDiagnostics } from "../lsp/src/diagnostics.js";
import { SNAPSHOT_STATUS } from "./constants.js";
import { expectEqual } from "./reporting.js";

const LSP_SEVERITY = {
	error: 1,
	warning: 2,
	info: 3,
	hint: 4,
};

const LSP_SEVERITY_NAMES = {
	[LSP_SEVERITY.error]: "error",
	[LSP_SEVERITY.warning]: "warning",
	[LSP_SEVERITY.info]: "info",
	[LSP_SEVERITY.hint]: "hint",
};

const SELF_REFERENCE_PATTERN =
	/objectSelfReference|self-reference|reference cycle/i;

const EXACT_SELF_REFERENCE_SOURCE = [
	"type Node = {",
	"    next: Node",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    let n: Node = { next: null as Node }",
	"    n.next = n",
	"}",
	"main()",
].join("\n");

const NULLABLE_SELF_REFERENCE_SOURCE = [
	"type Node = {",
	"    next: Node | null",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    let n: Node = { next: null }",
	"    n.next = n",
	"}",
	"main()",
].join("\n");

const NESTED_SELF_REFERENCE_SOURCE = [
	"type Node = {",
	"    next: Node | null",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    let n: Node = { next: null }",
	"    if (true) {",
	"        if (true) {",
	"            n.next = n",
	"        }",
	"    }",
	"}",
	"main()",
].join("\n");

const ACYCLIC_LIST_SOURCE = [
	"type Node = {",
	"    next: Node | null",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    let a: Node = { next: null }",
	"    let b: Node = { next: null }",
	"    a.next = b",
	"    b.next = null",
	"}",
	"main()",
].join("\n");

const INDIRECT_CYCLE_SOURCE = [
	"type Node = {",
	"    next: Node | null",
	"}",
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    let a: Node = { next: null }",
	"    let b: Node = { next: null }",
	"    a.next = b",
	"    b.next = a",
	"}",
	"main()",
].join("\n");

const TYPE_ERROR_SOURCE = [
	"const setup = () => {}",
	"const main = () => {",
	"    setup()",
	"    let count: i16 = 1",
	'    count = "not a number"',
	"}",
	"main()",
].join("\n");

const findDiagnostic = (diagnostics, code) => {
	return diagnostics.find((diagnostic) => {
		return diagnostic.code === code;
	});
};

const findSelfReferenceDiagnostic = (diagnostics) => {
	return diagnostics.find((diagnostic) => {
		return SELF_REFERENCE_PATTERN.test(
			`${diagnostic.code ?? ""} ${diagnostic.message ?? ""}`,
		);
	});
};

const renderSelfReferenceDiagnostic = (diagnostic) => {
	if (!diagnostic) {
		return "none";
	}
	const severity = LSP_SEVERITY_NAMES[diagnostic.severity] ?? "unknown";
	return `${diagnostic.code} ${severity} ${diagnostic.message}`;
};

const computeUserDiagnostics = async (source) => {
	return computeDiagnostics(source, null, {}, false, true);
};

const checkNoSelfReferenceDiagnostic = async (label, source) => {
	const diagnostics = await computeUserDiagnostics(source);
	return expectEqual(
		label,
		renderSelfReferenceDiagnostic(findSelfReferenceDiagnostic(diagnostics)),
		"none",
	);
};

const checkExactSelfReferenceAllowed = async () => {
	return checkNoSelfReferenceDiagnostic(
		"LSP accepts obj.field = obj when the field has the object type",
		EXACT_SELF_REFERENCE_SOURCE,
	);
};

const checkNullableSelfReferenceAllowed = async () => {
	return checkNoSelfReferenceDiagnostic(
		"LSP accepts obj.field = obj when the field is nullable",
		NULLABLE_SELF_REFERENCE_SOURCE,
	);
};

const checkNestedSelfReferenceAllowed = async () => {
	return checkNoSelfReferenceDiagnostic(
		"LSP accepts nullable obj.field = obj nested in an if inside an if",
		NESTED_SELF_REFERENCE_SOURCE,
	);
};

const checkAcyclicListAllowed = async () => {
	return checkNoSelfReferenceDiagnostic(
		"LSP keeps accepting an acyclic linked list",
		ACYCLIC_LIST_SOURCE,
	);
};

const checkIndirectCycleAllowed = async () => {
	return checkNoSelfReferenceDiagnostic(
		"LSP does not flag an indirect cycle across variables",
		INDIRECT_CYCLE_SOURCE,
	);
};

const checkRealTypeErrorStillReported = async () => {
	const diagnostics = await computeUserDiagnostics(TYPE_ERROR_SOURCE);
	const diagnostic = findDiagnostic(
		diagnostics,
		ERROR_CODE.assignmentTypeMismatch,
	);
	return expectEqual(
		"LSP still reports a real assignment type error",
		Boolean(diagnostic),
		true,
	);
};

export const runLspObjectCycleChecks = async () => {
	return [
		await checkExactSelfReferenceAllowed(),
		await checkNullableSelfReferenceAllowed(),
		await checkNestedSelfReferenceAllowed(),
		await checkAcyclicListAllowed(),
		await checkIndirectCycleAllowed(),
		await checkRealTypeErrorStillReported(),
	];
};

const reportResults = (results) => {
	for (const result of results) {
		const status = result.status === SNAPSHOT_STATUS.match ? "PASS" : "FAIL";
		process.stdout.write(`${status} ${result.label}\n`);
		if (result.status !== SNAPSHOT_STATUS.match) {
			process.stderr.write(
				`  expected ${JSON.stringify(result.expected)}\n  actual   ${JSON.stringify(result.actual)}\n`,
			);
		}
	}
	return results.filter((result) => {
		return result.status !== SNAPSHOT_STATUS.match;
	}).length;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const results = await runLspObjectCycleChecks();
	process.exit(reportResults(results) > 0 ? 1 : 0);
}
