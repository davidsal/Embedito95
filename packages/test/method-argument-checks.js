// Checker cases for arguments to library methods that are a member access or an
// `await` expression. The field/payload type must be validated against the
// parameter type at the source argument, so the program stops in the checker
// instead of failing later in the lowered intermediate. Sources run through the
// same `readLibraryContext` + `checkSource` pipeline the language server uses.
import { join } from "node:path";
import { ERROR_CODE, formatDiagnosticMessage, SEVERITY } from "embedito95-core";
import { expectEqual } from "./reporting.js";
import {
	CORE_LIBRARY_DIRECTORY,
	checkSource,
	readLibraryContext,
} from "./src/language/language-snapshot-harness.mjs";

const SERIAL_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "serial", "main.e95");
const I2C_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "i2c", "main.e95");
const SPI_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "spi", "main.e95");
const ASYNC_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "async", "main.e95");

const SERIAL_CONTEXT = readLibraryContext({
	libraryPath: SERIAL_LIBRARY_PATH,
	packageName: "@embedito95/serial",
	marker: "// e95.postinstall.serialEnum",
	sample: "1,",
});
const I2C_CONTEXT = readLibraryContext({
	libraryPath: I2C_LIBRARY_PATH,
	packageName: "@embedito95/i2c",
	marker: "// e95.postinstall.i2cEnum",
	sample: "1,",
});
const SPI_CONTEXT = readLibraryContext({
	libraryPath: SPI_LIBRARY_PATH,
	packageName: "@embedito95/spi",
	marker: "// e95.postinstall.spiEnum",
	sample: "1,",
});
const ASYNC_CONTEXT = readLibraryContext({
	libraryPath: ASYNC_LIBRARY_PATH,
	packageName: "@embedito95/async",
});

// Async sources need both the async library (which declares `AsyncTask<T>`) and
// the serial/introspection context. Merge the two so the checker sees the full
// object surface the real project gets.
const mergeLibraries = (librariesList) => {
	return {
		...librariesList[0],
		knownLibraries: new Set(
			librariesList.flatMap((libraries) => {
				return [...libraries.knownLibraries];
			}),
		),
		libraryExports: Object.assign(
			{},
			...librariesList.map((libraries) => {
				return libraries.libraryExports;
			}),
		),
		libraryFunctions: Object.assign(
			{},
			...librariesList.map((libraries) => {
				return libraries.libraryFunctions;
			}),
		),
		libraryTypes: Object.assign(
			{},
			...librariesList.map((libraries) => {
				return libraries.libraryTypes;
			}),
		),
		libraryEnumInfo: Object.assign(
			{},
			...librariesList.map((libraries) => {
				return libraries.libraryEnumInfo;
			}),
		),
		libraryObjectTypes: Object.assign(
			{},
			...librariesList.map((libraries) => {
				return libraries.libraryObjectTypes;
			}),
		),
	};
};

const SERIAL_ASYNC_LIBRARIES = mergeLibraries([
	SERIAL_CONTEXT.libraries,
	ASYNC_CONTEXT.libraries,
]);

const SERIAL_IMPORT = [
	"import { Serial, getSerial } from '@embedito95/serial'",
	"const serial = getSerial(Serial.1)",
];
const I2C_IMPORT = [
	"import { I2C, I2CBus, getI2C } from '@embedito95/i2c'",
	"const bus: I2CBus = getI2C(I2C.1)",
];
const SPI_IMPORT = [
	"import { SPI, SpiBitOrder, getSPI } from '@embedito95/spi'",
	"const spi = getSPI(SPI.1)",
];

const PERSONA_ASYNC_DECLARATIONS = [
	"type Persona = { name: string, age: i8 }",
	"const getPersona = async (): Persona => {",
	'    return { name: "ana", age: 1 }',
	"}",
	"const persona = getPersona()",
];

const NUMBER_ASYNC_DECLARATIONS = [
	"const getNumber = async (): u8 => {",
	"    return 7",
	"}",
	"const numberTask = getNumber()",
];

const OBJECT_FIELD_SOURCE = [
	...SERIAL_IMPORT,
	"const p = { inner: { x: 1 }, age: 1 }",
	"serial.sendLine(p.inner)",
].join("\n");

const NUMERIC_FIELD_SOURCE = [
	...SERIAL_IMPORT,
	"const p = { inner: { x: 1 }, age: 1 }",
	"serial.sendLine(p.age)",
].join("\n");

const WIDENING_FIELD_SOURCE = [
	...SERIAL_IMPORT,
	"type Config = { duration: u8 }",
	"const config: Config = { duration: 7 }",
	"serial.setReadTimeout(config.duration)",
].join("\n");

const NARROWING_FIELD_SOURCE = [
	...I2C_IMPORT,
	"type Wide = { value: i32 }",
	"const wide: Wide = { value: 300 }",
	"bus.sendByte(wide.value)",
].join("\n");

const ASYNC_TASK_OBJECT_FIELD_SOURCE = [
	...SERIAL_IMPORT,
	...PERSONA_ASYNC_DECLARATIONS,
	"serial.sendLine(persona.value)",
].join("\n");

const ASYNC_TASK_PRIMITIVE_FIELD_SOURCE = [
	...SERIAL_IMPORT,
	...NUMBER_ASYNC_DECLARATIONS,
	"serial.setReadTimeout(numberTask.value)",
].join("\n");

const AWAIT_OBJECT_SOURCE = [
	...SERIAL_IMPORT,
	...PERSONA_ASYNC_DECLARATIONS,
	"const run = async () => {",
	"    serial.sendLine(await persona)",
	"}",
].join("\n");

const AWAIT_PRIMITIVE_SOURCE = [
	...SERIAL_IMPORT,
	...NUMBER_ASYNC_DECLARATIONS,
	"const run = async () => {",
	"    serial.sendLine(await numberTask)",
	"}",
].join("\n");

const UNAWAITED_TASK_SOURCE = [
	...SERIAL_IMPORT,
	...PERSONA_ASYNC_DECLARATIONS,
	"serial.sendLine(persona)",
].join("\n");

const VALID_ENUM_SOURCE = [
	...SPI_IMPORT,
	"spi.setBitOrder(SpiBitOrder.MSB_FIRST)",
].join("\n");

const INVALID_ENUM_SOURCE = [
	...SPI_IMPORT,
	"spi.setBitOrder(SpiBitOrder.MISSING)",
].join("\n");

// Diagnostics report 1-based line/column; the editor converts them to 0-based.
const positionOf = (source, marker) => {
	const index = source.indexOf(marker);
	const before = source.slice(0, index);
	const lines = before.split("\n");
	return `${lines.length}:${lines[lines.length - 1].length + 1}`;
};

const collectErrors = (source, libraries) => {
	const { errors } = checkSource(source, libraries);
	return errors;
};

const errorsWithCode = (errors, code) => {
	return errors.filter((error) => {
		return error.code === code;
	});
};

const formatLocation = (diagnostic) => {
	const start = diagnostic.location?.start;
	return start ? `${start.line}:${start.column}` : "?";
};

const checkObjectFieldMismatch = () => {
	const errors = collectErrors(OBJECT_FIELD_SOURCE, SERIAL_CONTEXT.libraries);
	const diagnostics = errorsWithCode(errors, ERROR_CODE.argumentTypeMismatch);
	return [
		expectEqual(
			"a non-numeric member passed to a numeric union parameter reports argumentTypeMismatch",
			diagnostics.length,
			1,
		),
		expectEqual(
			"the member mismatch points at the argument",
			formatLocation(diagnostics[0]),
			positionOf(OBJECT_FIELD_SOURCE, "p.inner"),
		),
		expectEqual(
			"the member mismatch keeps the parameter name",
			diagnostics[0]?.params?.name,
			"data",
		),
		expectEqual(
			"the member mismatch reports the field type",
			diagnostics[0]?.params?.actual,
			"object:{x:i8}",
		),
		expectEqual(
			"the member mismatch is an error",
			diagnostics[0]?.severity,
			SEVERITY.error,
		),
		expectEqual(
			"the member mismatch message names the member",
			diagnostics[0]
				? formatDiagnosticMessage(diagnostics[0]).includes("p.inner")
				: false,
			true,
		),
	];
};

const checkNumericMemberInsideUnion = () => {
	const errors = collectErrors(NUMERIC_FIELD_SOURCE, SERIAL_CONTEXT.libraries);
	return [
		expectEqual(
			"an i8 member accepted by the numeric union parameter reports no diagnostics",
			errors.length,
			0,
		),
	];
};

const checkWideningMember = () => {
	const errors = collectErrors(WIDENING_FIELD_SOURCE, SERIAL_CONTEXT.libraries);
	return [
		expectEqual(
			"widening a u8 member into a u32 parameter reports no diagnostics",
			errors.length,
			0,
		),
	];
};

// The implicit narrowing is an automatic cast: it still happens in codegen, but
// it is no longer reported as a diagnostic. The hover explains it instead.
const checkNarrowingMember = () => {
	const errors = collectErrors(NARROWING_FIELD_SOURCE, I2C_CONTEXT.libraries);
	const diagnostics = errorsWithCode(errors, ERROR_CODE.argumentTypeMismatch);
	return [
		expectEqual(
			"narrowing an i32 member into a u8 parameter reports no diagnostic",
			errors.length,
			0,
		),
		expectEqual(
			"narrowing a member does not report argumentTypeMismatch",
			diagnostics.length,
			0,
		),
	];
};

const checkAsyncTaskObjectField = () => {
	const errors = collectErrors(
		ASYNC_TASK_OBJECT_FIELD_SOURCE,
		SERIAL_ASYNC_LIBRARIES,
	);
	const diagnostics = errorsWithCode(errors, ERROR_CODE.argumentTypeMismatch);
	return [
		expectEqual(
			"an AsyncTask payload object read through .value reports argumentTypeMismatch",
			diagnostics.length,
			1,
		),
		expectEqual(
			"the AsyncTask payload mismatch points at the member argument",
			formatLocation(diagnostics[0]),
			positionOf(ASYNC_TASK_OBJECT_FIELD_SOURCE, "persona.value"),
		),
		expectEqual(
			"the AsyncTask payload mismatch reports the payload type",
			diagnostics[0]?.params?.actual,
			"Persona",
		),
	];
};

const checkAsyncTaskPrimitiveField = () => {
	const errors = collectErrors(
		ASYNC_TASK_PRIMITIVE_FIELD_SOURCE,
		SERIAL_ASYNC_LIBRARIES,
	);
	return [
		expectEqual(
			"an AsyncTask<u8> payload read through .value widens without diagnostics",
			errors.length,
			0,
		),
	];
};

const checkAwaitObjectPayload = () => {
	const errors = collectErrors(AWAIT_OBJECT_SOURCE, SERIAL_ASYNC_LIBRARIES);
	const diagnostics = errorsWithCode(errors, ERROR_CODE.argumentTypeMismatch);
	return [
		expectEqual(
			"awaiting a task with an object payload passed to a numeric parameter reports argumentTypeMismatch",
			diagnostics.length,
			1,
		),
		expectEqual(
			"the awaited payload mismatch points at the await argument",
			formatLocation(diagnostics[0]),
			positionOf(AWAIT_OBJECT_SOURCE, "await persona"),
		),
		expectEqual(
			"the awaited payload mismatch value names the await expression",
			diagnostics[0]?.params?.value,
			"await persona",
		),
	];
};

const checkAwaitPrimitivePayload = () => {
	const errors = collectErrors(AWAIT_PRIMITIVE_SOURCE, SERIAL_ASYNC_LIBRARIES);
	return [
		expectEqual(
			"awaiting a task with a u8 payload passes the numeric union without diagnostics",
			errors.length,
			0,
		),
	];
};

const checkUnawaitedTaskArgument = () => {
	const errors = collectErrors(UNAWAITED_TASK_SOURCE, SERIAL_ASYNC_LIBRARIES);
	const asyncTaskDiagnostics = errorsWithCode(
		errors,
		ERROR_CODE.asyncTaskArgument,
	);
	return [
		expectEqual(
			"passing an un-awaited task to a method reports asyncTaskArgument",
			asyncTaskDiagnostics.length,
			1,
		),
		expectEqual(
			"asyncTaskArgument points at the method argument",
			formatLocation(asyncTaskDiagnostics[0]),
			positionOf(UNAWAITED_TASK_SOURCE, "persona)"),
		),
		expectEqual(
			"the un-awaited task does not also report argumentTypeMismatch",
			errorsWithCode(errors, ERROR_CODE.argumentTypeMismatch).length,
			0,
		),
	];
};

const checkValidEnumMember = () => {
	const errors = collectErrors(VALID_ENUM_SOURCE, SPI_CONTEXT.libraries);
	return [
		expectEqual(
			"a valid enum member passed to an enum method parameter reports no diagnostics",
			errors.length,
			0,
		),
	];
};

const checkInvalidEnumMember = () => {
	const errors = collectErrors(INVALID_ENUM_SOURCE, SPI_CONTEXT.libraries);
	const diagnostics = errorsWithCode(errors, ERROR_CODE.argumentTypeMismatch);
	return [
		expectEqual(
			"an invalid enum member passed to an enum method parameter reports argumentTypeMismatch",
			diagnostics.length,
			1,
		),
		expectEqual(
			"the invalid enum member diagnostic points at the argument",
			formatLocation(diagnostics[0]),
			positionOf(INVALID_ENUM_SOURCE, "SpiBitOrder.MISSING"),
		),
	];
};

export const runMethodArgumentChecks = () => {
	return [
		...checkObjectFieldMismatch(),
		...checkNumericMemberInsideUnion(),
		...checkWideningMember(),
		...checkNarrowingMember(),
		...checkAsyncTaskObjectField(),
		...checkAsyncTaskPrimitiveField(),
		...checkAwaitObjectPayload(),
		...checkAwaitPrimitivePayload(),
		...checkUnawaitedTaskArgument(),
		...checkValidEnumMember(),
		...checkInvalidEnumMember(),
	];
};
