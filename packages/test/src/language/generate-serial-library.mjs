import { join } from "node:path";
import {
	CORE_LIBRARY_DIRECTORY,
	isMainModule,
	listSnapshots,
	readLibraryContext,
	renderLibraryCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const SERIAL_PACKAGE = "@embedito95/serial";
const SERIAL_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "serial", "main.e95");

// The shipped `main.e95` keeps its interfaces in a postinstall marker: `install`
// replaces the marker with the target's serial numbers. The editor always reads
// the installed project, so we inject one sample interface here to mirror that
// view (the same trick the i2c/gpio generators use for their markers).
const SERIAL_ENUM_MARKER = "// e95.postinstall.serialEnum";
const SERIAL_ENUM_SAMPLE_MEMBER = "1,";

const buildReport = () => {
	const context = readLibraryContext({
		libraryPath: SERIAL_LIBRARY_PATH,
		packageName: SERIAL_PACKAGE,
		marker: SERIAL_ENUM_MARKER,
		sample: SERIAL_ENUM_SAMPLE_MEMBER,
	});
	const cases = [
		{
			label: "readLine infers string and readInteger infers i32",
			probes: ["text", "parsed"],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const text = serial.readLine()
export const parsed = serial.readInteger()`,
		},
		{
			label: "readTextUntil infers string from a char terminator",
			probes: ["untilSemicolon", "untilPipe"],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const untilSemicolon = serial.readTextUntil(';')
export const untilPipe = serial.readTextUntil('|')`,
		},
		{
			label: "readTextUntil inside nested conditionals produces no diagnostics",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
export const nestedUntil = () => {
    const serial = getSerial(Serial.1)
    if (serial.hasData()) {
        if (serial.hasData()) {
            return serial.readTextUntil(';')
        }
        return serial.readTextUntil('|')
    }
    return ""
}`,
		},
		{
			label: "send accepts every numeric width and char without diagnostics",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const sendAll = (smallUnsigned: u8, smallSigned: i8, mediumUnsigned: u16, mediumSigned: i16, wideUnsigned: u32, wideSigned: i32, hugeUnsigned: u64, hugeSigned: i64, real: f32, doubleReal: f64, letter: char) => {
    serial.send(smallUnsigned)
    serial.send(smallSigned)
    serial.send(mediumUnsigned)
    serial.send(mediumSigned)
    serial.send(wideUnsigned)
    serial.send(wideSigned)
    serial.send(hugeUnsigned)
    serial.send(hugeSigned)
    serial.send(real)
    serial.send(doubleReal)
    serial.send(letter)
    serial.sendLine(hugeUnsigned)
    serial.sendLine(hugeSigned)
}`,
		},
		{
			label: "nested reads inside nested conditionals produce no diagnostics",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
export const nested = () => {
    const serial = getSerial(Serial.1)
    if (serial.hasData()) {
        if (serial.hasData()) {
            serial.send(serial.readInteger())
            return serial.readLine()
        }
        return ""
    }
    return ""
}`,
		},
		{
			label: "stream helpers infer their return types",
			probes: ["nextByte", "writeSpace", "block", "until"],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const nextByte = serial.peekByte()
export const writeSpace = serial.getWriteSpace()
export const block = serial.readBlock(4)
export const until = serial.readBlockUntil(10, 8)`,
		},
		{
			label: "text search and float helpers infer their return types",
			probes: ["text", "found", "foundUntil", "real"],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const text = serial.readText()
export const found = serial.findText("needle")
export const foundUntil = serial.findTextUntil("needle", ';')
export const real = serial.readFloat()`,
		},
		{
			label: "read timeout helpers accept and report a duration",
			probes: ["previousTimeout"],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const previousTimeout = serial.getReadTimeout()
export const applyImmediateTimeout = () => {
    serial.setReadTimeout(0)
}`,
		},
		{
			label: "text search helpers inside nested conditionals produce no diagnostics",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
export const nestedSearch = () => {
    const serial = getSerial(Serial.1)
    if (serial.hasData()) {
        if (serial.findText("needle")) {
            return serial.readText()
        }
        return serial.readFloat()
    }
    return serial.readText()
}`,
		},
		{
			label: "findText arity reported",
			probes: ["badCount"],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const badCount = serial.findText()`,
		},
		{
			label: "findTextUntil rejects a string terminator",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const badTerminator = () => {
    serial.findTextUntil("needle", "newline")
}`,
		},
		{
			label: "readTextUntil arity reported",
			probes: ["badCount"],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const badCount = serial.readTextUntil()`,
		},
		{
			label: "readTextUntil rejects a string terminator",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const badTerminator = () => {
    serial.readTextUntil("newline")
}`,
		},
		{
			label: "setReadTimeout rejects a non-numeric duration",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const badTimeout = () => {
    serial.setReadTimeout("fast")
}`,
		},
		{
			label: "sendBuffer accepts a byte array without diagnostics",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
const payload: u8[] = [1, 2, 3]
export const sendPayload = () => {
    serial.sendBuffer(payload)
}`,
		},
		{
			label: "stream helpers inside nested conditionals produce no diagnostics",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
export const nestedRead = () => {
    const serial = getSerial(Serial.1)
    if (serial.hasData()) {
        if (serial.peekByte() != null) {
            serial.sendBuffer(serial.readBlockUntil(10, 8))
        }
        return serial.readBlock(4)
    }
    return serial.readBlock(0)
}`,
		},
		{
			label: "stream helper arity reported",
			probes: ["badCount"],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const badCount = serial.readBlock(1, 2)`,
		},
		{
			label: "stream helper argument type reported",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const badTerminator = () => {
    serial.readBlockUntil("newline", 8)
}`,
		},
		{
			label: "sendBuffer rejects a non-array argument",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
const payload: u16 = 255
export const badBuffer = () => {
    serial.sendBuffer(payload)
}`,
		},
		{
			label: "sendBuffer rejects a numeric literal",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const badBuffer = () => {
    serial.sendBuffer(255)
}`,
		},
		{
			label: "sendBuffer rejects a string literal",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const badBuffer = () => {
    serial.sendBuffer("abc")
}`,
		},
		{
			label: "readBlockUntil rejects an array literal terminator",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const badTerminator = () => {
    serial.readBlockUntil([1], 8)
}`,
		},
		{
			label: "readBlock rejects a float literal maximum",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const badMaximum = serial.readBlock(1.5)`,
		},
		{
			label: "wrong argument count reported",
			probes: ["badCount"],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const badCount = serial.readInteger(5)`,
		},
		{
			label: "unknown method reported and left unresolved",
			probes: ["missing"],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
export const missing = serial.receive(0)`,
		},
		{
			label: "non-numeric argument reported",
			probes: [],
			body: `import { Serial, getSerial } from '@embedito95/serial'
const serial = getSerial(Serial.1)
const enabled: boolean = true
export const badType = () => {
    serial.send(enabled)
}`,
		},
	];

	const header = [
		"// LSP view of the `serial` core library (hover types + diagnostics).",
		"// Each case is a library-style program (isLibrary) whose probes are",
		"// exported, so unused-declaration noise is suppressed. Types come from",
		"// resolveProjectTypes (the same inference the language server uses for",
		"// hover), reading the real core/serial/main.e95 through",
		"// collectLibraryModuleInfo. Diagnostics come from the shared check().",
		"",
	];

	return `${header.join("\n")}${cases
		.map((testCase) => {
			return renderLibraryCase(testCase, context);
		})
		.join("\n")}`;
};

export const listSerialLibrarySnapshots = () => {
	return listSnapshots("serial-library.txt", buildReport());
};

export const writeSerialLibrarySnapshots = () => {
	writeSnapshots(listSerialLibrarySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeSerialLibrarySnapshots();
	console.log("Generated serial-library.txt");
}
