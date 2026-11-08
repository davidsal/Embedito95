import { join } from "node:path";
import {
	CLIENT_LIBRARY_DIRECTORY,
	isMainModule,
	listSnapshots,
	readLibraryContext,
	renderLibraryCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const EEPROM_PACKAGE = "@embedito95/eeprom";
const EEPROM_LIBRARY_PATH = join(
	CLIENT_LIBRARY_DIRECTORY,
	"eeprom",
	"main.e95",
);

const buildReport = () => {
	const context = readLibraryContext({
		libraryPath: EEPROM_LIBRARY_PATH,
		packageName: EEPROM_PACKAGE,
	});
	const cases = [
		{
			label:
				"readEepromByte infers u8, readEepromBlock infers u8[] and getCapacity infers u16",
			probes: ["stored", "block", "capacity"],
			body: `import { getCapacity, readEepromBlock, readEepromByte } from '@embedito95/eeprom'
export const stored = readEepromByte(0)
export const block = readEepromBlock(0, 4)
export const capacity = getCapacity()`,
		},
		{
			label: "writeEepromByte and updateEepromByte accept a u16 address and a u8 value",
			probes: [],
			body: `import { getCapacity, updateEepromByte, writeEepromByte } from '@embedito95/eeprom'
export const store = () => {
    writeEepromByte(0, 42)
    updateEepromByte(getCapacity() - 1, 42)
}`,
		},
		{
			label:
				"writeEepromBlock accepts a u16 address and a u8[] byte sequence",
			probes: [],
			body: `import { writeEepromBlock } from '@embedito95/eeprom'
export const storeBlock = (data: u8[]) => {
    writeEepromBlock(0, data)
    writeEepromBlock(1, [1, 2])
}`,
		},
		{
			label: "nested reads and updates inside nested conditionals produce no diagnostics",
			probes: ["nested"],
			body: `import { readEepromByte, updateEepromByte } from '@embedito95/eeprom'
const choose = (address: u16): u8 => {
    if (address > 0) {
        if (address > 10) {
            updateEepromByte(address, 1)
            return readEepromByte(address)
        }
        updateEepromByte(address, 2)
        return readEepromByte(address)
    }
    return readEepromByte(address)
}
export const nested = choose(5)`,
		},
		{
			label:
				"nested block reads and writes inside nested conditionals produce no diagnostics",
			probes: ["block"],
			body: `import { readEepromBlock, writeEepromBlock } from '@embedito95/eeprom'
const choose = (address: u16): u8[] => {
    if (address > 0) {
        if (address > 10) {
            writeEepromBlock(address, [1, 2])
            return readEepromBlock(address, 2)
        }
        writeEepromBlock(address, [3])
        return readEepromBlock(address, 1)
    }
    return readEepromBlock(address, 0)
}
export const block = choose(5)`,
		},
		{
			label: "wrong argument count reported",
			probes: ["badCount"],
			body: `import { readEepromByte } from '@embedito95/eeprom'
export const badCount = readEepromByte()`,
		},
		{
			label: "readEepromBlock reports a wrong argument count",
			probes: [],
			body: `import { readEepromBlock } from '@embedito95/eeprom'
export const badBlockCount = readEepromBlock(0)`,
		},
		{
			label: "writeEepromBlock reports a data argument that is not a byte sequence",
			probes: [],
			body: `import { writeEepromBlock } from '@embedito95/eeprom'
export const badBlockData = () => {
    writeEepromBlock(0, 1)
}`,
		},
		{
			label: "unknown export reported and left unresolved",
			probes: ["missing"],
			body: `import { eraseAll } from '@embedito95/eeprom'
export const missing = eraseAll`,
		},
		{
			label: "wider integer argument warns on a u8 value",
			probes: [],
			body: `import { writeEepromByte } from '@embedito95/eeprom'
export const wideValue: i32 = 300
export const widened = () => {
    writeEepromByte(1, wideValue)
}`,
		},
		{
			label: "non-numeric address reported",
			probes: ["badType"],
			body: `import { readEepromByte } from '@embedito95/eeprom'
export const badType = readEepromByte("first")`,
		},
		{
			label: "a u16 literal beyond the installed cell count stays type-valid",
			probes: ["outOfRange"],
			body: `import { readEepromByte } from '@embedito95/eeprom'
export const outOfRange = readEepromByte(65535)`,
		},
	];

	const header = [
		"// LSP view of the `eeprom` library (hover types + diagnostics).",
		"// Each case is a library-style program (isLibrary) whose probes are",
		"// exported, so unused-declaration noise is suppressed. Types come from",
		"// resolveProjectTypes (the same inference the language server uses for",
		"// hover), reading the real libraries/eeprom/main.e95 through",
		"// collectLibraryModuleInfo. Diagnostics come from the shared check().",
		"// The inference is platform-independent, so these cases cover both",
		"// targets; only the STM32 strategy rejects the library at build time",
		"// (the F103 has no internal EEPROM).",
		"",
	];

	return `${header.join("\n")}${cases
		.map((testCase) => {
			return renderLibraryCase(testCase, context);
		})
		.join("\n")}`;
};

export const listEepromLibrarySnapshots = () => {
	return listSnapshots("eeprom-library.txt", buildReport());
};

export const writeEepromLibrarySnapshots = () => {
	writeSnapshots(listEepromLibrarySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeEepromLibrarySnapshots();
	console.log("Generated eeprom-library.txt");
}
