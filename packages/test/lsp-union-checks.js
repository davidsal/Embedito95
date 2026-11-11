// Editor-facing checks for arbitrary union restrictions. Diagnostics come from
// the same `check()` the language server runs, so the message, severity and
// range match what the editor shows. Core libraries keep accepting union
// signatures because they compile to a C++ overload set.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ERROR_CODE, formatDiagnosticMessage, UTF8 } from "embedito95-core";
import { computeDiagnostics } from "../lsp/src/diagnostics.js";
import { SNAPSHOT_STATUS } from "./constants.js";
import { expectEqual } from "./reporting.js";
import { REPOSITORY_ROOT } from "./runner-harness.js";
import {
	checkSource,
	readLibraryContext,
} from "./src/language/language-snapshot-harness.mjs";

const SERIAL_PACKAGE = "@embedito95/serial";
const PORTABLE_PACKAGE = "@demo/lcd";
const SERIAL_LIBRARY_PATH = join(
	REPOSITORY_ROOT,
	"packages",
	"registry",
	"src",
	"core",
	"serial",
	"main.e95",
);
const SERIAL_ENUM_MARKER = "// e95.postinstall.serialEnum";
const SERIAL_ENUM_SAMPLE_MEMBER = "1,";

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

const USER_SOURCE = [
	"const setup = () => {}",
	"const main = () => { setup() }",
	'const value: string | u8 = "a"',
	"main()",
].join("\n");

const NESTED_PARAMETER_SOURCE = [
	"const setup = () => {}",
	"const handle = (data: string | u8): boolean => {",
	"    if (data != null) {",
	"        if (true) {",
	"            return true",
	"        }",
	"    }",
	"    return false",
	"}",
	"const main = () => {",
	'    handle("a")',
	"    setup()",
	"}",
	"main()",
].join("\n");

const PORTABLE_LIBRARY_SOURCE = [
	"export const handle = (data: string | u8) => {",
	"    return data",
	"}",
].join("\n");

const NULLABLE_SOURCE = [
	"const setup = () => {}",
	"const read = (fallback: string | null): string | null => {",
	"    if (fallback != null) {",
	"        return fallback",
	"    }",
	"    return null",
	"}",
	"const main = () => {",
	"    setup()",
	'    read("value")',
	"}",
	"main()",
].join("\n");

const SERIAL_CALL_SOURCE = [
	"import { Serial, getSerial } from '@embedito95/serial'",
	"const serial = getSerial(Serial.1)",
	'serial.send("text")',
	"serial.send('c')",
	"serial.send(1)",
	"serial.send(1.5)",
	"serial.sendLine(2)",
].join("\n");

const SERIAL_LIBRARY_CONTEXT = readLibraryContext({
	libraryPath: SERIAL_LIBRARY_PATH,
	packageName: SERIAL_PACKAGE,
	marker: SERIAL_ENUM_MARKER,
	sample: SERIAL_ENUM_SAMPLE_MEMBER,
});

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

const checkUserVariableUnionDiagnostic = async () => {
	const diagnostics = await computeDiagnostics(
		USER_SOURCE,
		null,
		{},
		false,
		true,
	);
	const unionDiagnostic = findDiagnostic(
		diagnostics,
		ERROR_CODE.arbitraryUnion,
	);
	const rendered = unionDiagnostic ? renderDiagnostic(unionDiagnostic) : "none";
	return expectEqual(
		"LSP reports an arbitrary union on a user variable at the type location",
		rendered,
		`3:14 ${ERROR_SEVERITY_LABEL} ${ERROR_CODE.arbitraryUnion} ${formatDiagnosticMessage(
			{
				code: ERROR_CODE.arbitraryUnion,
				params: { type: "string | u8" },
			},
		)}`,
	);
};

const checkNestedParameterUnionDiagnostic = async () => {
	const diagnostics = await computeDiagnostics(
		NESTED_PARAMETER_SOURCE,
		null,
		{},
		false,
		true,
	);
	const unionDiagnostic = findDiagnostic(
		diagnostics,
		ERROR_CODE.arbitraryUnion,
	);
	const rendered = unionDiagnostic ? renderDiagnostic(unionDiagnostic) : "none";
	return expectEqual(
		"LSP reports an arbitrary union on a nested function parameter",
		rendered,
		`2:23 ${ERROR_SEVERITY_LABEL} ${ERROR_CODE.arbitraryUnion} ${formatDiagnosticMessage(
			{
				code: ERROR_CODE.arbitraryUnion,
				params: { type: "string | u8" },
			},
		)}`,
	);
};

const checkPortableLibraryUnionDiagnostic = async () => {
	const libraries = {
		libraryPackage: PORTABLE_PACKAGE,
		coreLibraryPackages: new Set([SERIAL_PACKAGE]),
	};
	const diagnostics = await computeDiagnostics(
		PORTABLE_LIBRARY_SOURCE,
		null,
		libraries,
		true,
		false,
	);
	const unionDiagnostic = findDiagnostic(
		diagnostics,
		ERROR_CODE.arbitraryUnion,
	);
	const rendered = unionDiagnostic ? renderDiagnostic(unionDiagnostic) : "none";
	return expectEqual(
		"LSP reports an arbitrary union inside a portable library",
		rendered,
		`1:30 ${ERROR_SEVERITY_LABEL} ${ERROR_CODE.arbitraryUnion} ${formatDiagnosticMessage(
			{
				code: ERROR_CODE.arbitraryUnion,
				params: { type: "string | u8" },
			},
		)}`,
	);
};

const checkCoreLibraryUnionAllowed = async () => {
	const source = readFileSync(SERIAL_LIBRARY_PATH, UTF8).replaceAll(
		SERIAL_ENUM_MARKER,
		SERIAL_ENUM_SAMPLE_MEMBER,
	);
	const libraries = {
		libraryPackage: SERIAL_PACKAGE,
		coreLibraryPackages: new Set([SERIAL_PACKAGE]),
	};
	const diagnostics = await computeDiagnostics(
		source,
		null,
		libraries,
		true,
		false,
	);
	const unionDiagnostic = findDiagnostic(
		diagnostics,
		ERROR_CODE.arbitraryUnion,
	);
	return expectEqual(
		"LSP accepts arbitrary unions in a core library with a C++ backend",
		unionDiagnostic ? renderDiagnostic(unionDiagnostic) : "none",
		"none",
	);
};

const checkNullableUnionAllowed = async () => {
	const diagnostics = await computeDiagnostics(
		NULLABLE_SOURCE,
		null,
		{},
		false,
		true,
	);
	const unionDiagnostic = findDiagnostic(
		diagnostics,
		ERROR_CODE.arbitraryUnion,
	);
	return expectEqual(
		"LSP keeps accepting T|null in variables, parameters and returns",
		unionDiagnostic ? renderDiagnostic(unionDiagnostic) : "none",
		"none",
	);
};

const checkSerialCallsWithUnionMembers = () => {
	const { errors } = checkSource(SERIAL_CALL_SOURCE, {
		...SERIAL_LIBRARY_CONTEXT.libraries,
		isLibrary: false,
		isEntry: true,
	});
	const unionErrors = errors.filter((error) => {
		return (
			error.code === ERROR_CODE.arbitraryUnion ||
			error.code === ERROR_CODE.argumentTypeMismatch
		);
	});
	return expectEqual(
		"calls to a core union signature accept each member without diagnostics",
		unionErrors.map((error) => error.code).join(","),
		"",
	);
};

export const runLspUnionChecks = async () => {
	return [
		await checkUserVariableUnionDiagnostic(),
		await checkNestedParameterUnionDiagnostic(),
		await checkPortableLibraryUnionDiagnostic(),
		await checkCoreLibraryUnionAllowed(),
		await checkNullableUnionAllowed(),
		checkSerialCallsWithUnionMembers(),
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
	const results = await runLspUnionChecks();
	process.exit(reportResults(results) > 0 ? 1 : 0);
}
