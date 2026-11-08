// Editor-facing checks for the direct object self-reference guard. Diagnostics
// come from `computeDiagnostics`, the same pipeline the language server runs, so
// the message, severity and range match what the editor shows. The guard rejects
// `obj.field = obj` when the field holds the object's own type, including a
// nullable field; acyclic linked lists and indirect cycles stay undetected.
import { pathToFileURL } from "node:url";
import { ERROR_CODE, formatDiagnosticMessage } from "embedito95-core";
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

const ERROR_SEVERITY_LABEL = LSP_SEVERITY_NAMES[LSP_SEVERITY.error];

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

const findDiagnostic = (diagnostics, code) => {
	return diagnostics.find((diagnostic) => {
		return diagnostic.code === code;
	});
};

const renderDiagnostic = (diagnostic) => {
	const start = diagnostic.range.start;
	const severity = LSP_SEVERITY_NAMES[diagnostic.severity] ?? "unknown";
	return `${start.line + 1}:${start.character + 1} ${severity} ${diagnostic.code} ${diagnostic.message}`;
};

const renderSelfReferenceDiagnostic = (diagnostic) => {
	return diagnostic ? renderDiagnostic(diagnostic) : "none";
};

const renderExpected = ({ line, column, name, field }) => {
	return `${line}:${column} ${ERROR_SEVERITY_LABEL} ${ERROR_CODE.objectSelfReference} ${formatDiagnosticMessage(
		{
			code: ERROR_CODE.objectSelfReference,
			params: { name, field },
		},
	)}`;
};

const computeUserDiagnostics = async (source) => {
	return computeDiagnostics(source, null, {}, false, true);
};

const checkExactSelfReferenceDiagnostic = async () => {
	const diagnostics = await computeUserDiagnostics(EXACT_SELF_REFERENCE_SOURCE);
	const diagnostic = findDiagnostic(
		diagnostics,
		ERROR_CODE.objectSelfReference,
	);
	return expectEqual(
		"LSP reports obj.field = obj when the field has the object type",
		renderSelfReferenceDiagnostic(diagnostic),
		renderExpected({ line: 8, column: 5, name: "n", field: "next" }),
	);
};

const checkNullableSelfReferenceDiagnostic = async () => {
	const diagnostics = await computeUserDiagnostics(
		NULLABLE_SELF_REFERENCE_SOURCE,
	);
	const diagnostic = findDiagnostic(
		diagnostics,
		ERROR_CODE.objectSelfReference,
	);
	return expectEqual(
		"LSP reports obj.field = obj when the field is nullable",
		renderSelfReferenceDiagnostic(diagnostic),
		renderExpected({ line: 8, column: 5, name: "n", field: "next" }),
	);
};

const checkNestedSelfReferenceDiagnostic = async () => {
	const diagnostics = await computeUserDiagnostics(
		NESTED_SELF_REFERENCE_SOURCE,
	);
	const diagnostic = findDiagnostic(
		diagnostics,
		ERROR_CODE.objectSelfReference,
	);
	return expectEqual(
		"LSP reports nullable obj.field = obj nested in an if inside an if",
		renderSelfReferenceDiagnostic(diagnostic),
		renderExpected({ line: 10, column: 13, name: "n", field: "next" }),
	);
};

const checkAcyclicListAllowed = async () => {
	const diagnostics = await computeUserDiagnostics(ACYCLIC_LIST_SOURCE);
	const diagnostic = findDiagnostic(
		diagnostics,
		ERROR_CODE.objectSelfReference,
	);
	return expectEqual(
		"LSP keeps accepting an acyclic linked list",
		renderSelfReferenceDiagnostic(diagnostic),
		"none",
	);
};

const checkIndirectCycleNotDetected = async () => {
	const diagnostics = await computeUserDiagnostics(INDIRECT_CYCLE_SOURCE);
	const diagnostic = findDiagnostic(
		diagnostics,
		ERROR_CODE.objectSelfReference,
	);
	return expectEqual(
		"LSP does not flag an indirect cycle across variables",
		renderSelfReferenceDiagnostic(diagnostic),
		"none",
	);
};

export const runLspObjectSelfReferenceChecks = async () => {
	return [
		await checkExactSelfReferenceDiagnostic(),
		await checkNullableSelfReferenceDiagnostic(),
		await checkNestedSelfReferenceDiagnostic(),
		await checkAcyclicListAllowed(),
		await checkIndirectCycleNotDetected(),
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
	const results = await runLspObjectSelfReferenceChecks();
	process.exit(reportResults(results) > 0 ? 1 : 0);
}
