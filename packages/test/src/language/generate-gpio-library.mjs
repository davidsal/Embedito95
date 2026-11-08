import { join } from "node:path";
import {
	CORE_LIBRARY_DIRECTORY,
	isMainModule,
	listSnapshots,
	readLibraryContext,
	renderLibraryCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const GPIO_PACKAGE = "@embedito95/gpio";
const GPIO_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "gpio", "main.e95");

// The shipped `main.e95` keeps its pins in a postinstall marker: `install`
// replaces the marker with the target's pin list. The editor always reads the
// installed project, so we inject a couple of sample pins here to mirror that
// view (the same trick the i2c generator uses for its bus marker).
const PIN_ENUM_MARKER = "// e95.postinstall.pinEnum";
const PIN_ENUM_SAMPLE_MEMBERS = "2,\n    3,";

const buildReport = () => {
	const context = readLibraryContext({
		libraryPath: GPIO_LIBRARY_PATH,
		packageName: GPIO_PACKAGE,
		marker: PIN_ENUM_MARKER,
		sample: PIN_ENUM_SAMPLE_MEMBERS,
	});
	const cases = [
		{
			label: "readShift infers u8 and accepts both bit order forms",
			probes: ["received", "first"],
			body: `import { Pin, BitOrder, MSB_FIRST, readShift } from '@embedito95/gpio'
export const received = readShift(Pin.2, Pin.3, BitOrder.MSB_FIRST)
export const first = readShift(Pin.2, Pin.3, MSB_FIRST)`,
		},
		{
			label: "writeShift accepts an enum member and a bit order constant",
			probes: [],
			body: `import { Pin, BitOrder, LSB_FIRST, writeShift } from '@embedito95/gpio'
export const send = () => {
    writeShift(Pin.2, Pin.3, BitOrder.LSB_FIRST, 165)
    writeShift(Pin.2, Pin.3, LSB_FIRST, 60)
}`,
		},
		{
			label: "nested shift reads inside nested conditionals produce no diagnostics",
			probes: ["nested"],
			body: `import { Pin, BitOrder, MSB_FIRST, readShift } from '@embedito95/gpio'
const choose = (value: u8): u8 => {
    if (value > 0) {
        if (value > 10) {
            return readShift(Pin.2, Pin.3, BitOrder.MSB_FIRST)
        }
        return readShift(Pin.2, Pin.3, MSB_FIRST)
    }
    return readShift(Pin.2, Pin.3, MSB_FIRST)
}
export const nested = choose(5)`,
		},
		{
			label: "wrong argument count reported",
			probes: ["badCount"],
			body: `import { Pin, readShift } from '@embedito95/gpio'
export const badCount = readShift(Pin.2, Pin.3)`,
		},
		{
			label: "unknown export reported and left unresolved",
			probes: ["missing"],
			body: `import { notExported } from '@embedito95/gpio'
export const missing = notExported`,
		},
		{
			label: "wider integer argument warns on a u8 parameter",
			probes: [],
			body: `import { Pin, BitOrder, writeShift } from '@embedito95/gpio'
export const wideValue: i32 = 300
export const widened = () => {
    writeShift(Pin.2, Pin.3, BitOrder.MSB_FIRST, wideValue)
}`,
		},
		{
			label: "non-enum bit order argument reported",
			probes: [],
			body: `import { Pin, writeShift } from '@embedito95/gpio'
export const badOrder = () => {
    writeShift(Pin.2, Pin.3, 1, 0)
}`,
		},
		{
			label: "non-numeric argument reported",
			probes: [],
			body: `import { Pin, BitOrder, writeShift } from '@embedito95/gpio'
export const badType = () => {
    writeShift(Pin.2, Pin.3, BitOrder.MSB_FIRST, "byte")
}`,
		},
		{
			label: "reference setter accepts every enum member",
			probes: [],
			body: `import { VoltageReference, setReference } from '@embedito95/gpio'
export const configure = () => {
    setReference(VoltageReference.EXTERNAL)
    setReference(VoltageReference.SUPPLY)
    setReference(VoltageReference.INTERNAL)
}`,
		},
		{
			label: "nested reference configuration produces no diagnostics",
			probes: [],
			body: `import { VoltageReference, setReference } from '@embedito95/gpio'
const choose = (value: u8): u8 => {
    if (value > 0) {
        if (value > 10) {
            setReference(VoltageReference.INTERNAL)
            return value
        }
        setReference(VoltageReference.SUPPLY)
        return value
    }
    setReference(VoltageReference.EXTERNAL)
    return value
}
export const nested = choose(5)`,
		},
		{
			label: "literal reference argument reported",
			probes: [],
			body: `import { setReference } from '@embedito95/gpio'
export const badReference = () => {
    setReference(1)
}`,
		},
		{
			label: "enum member of the wrong type reported for the reference",
			probes: [],
			body: `import { PinMode, setReference } from '@embedito95/gpio'
export const badReference = () => {
    setReference(PinMode.OUTPUT)
}`,
		},
	];

	const header = [
		"// LSP view of the `gpio` core library (hover types + diagnostics).",
		"// Each case is a library-style program (isLibrary) whose probes are",
		"// exported, so unused-declaration noise is suppressed. Types come from",
		"// resolveProjectTypes (the same inference the language server uses for",
		"// hover), reading the real core/gpio/main.e95 through",
		"// collectLibraryModuleInfo. Diagnostics come from the shared check().",
		"",
	];

	return `${header.join("\n")}${cases
		.map((testCase) => {
			return renderLibraryCase(testCase, context);
		})
		.join("\n")}`;
};

export const listGpioLibrarySnapshots = () => {
	return listSnapshots("gpio-library.txt", buildReport());
};

export const writeGpioLibrarySnapshots = () => {
	writeSnapshots(listGpioLibrarySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeGpioLibrarySnapshots();
	console.log("Generated gpio-library.txt");
}
