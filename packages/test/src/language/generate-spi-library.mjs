import { join } from "node:path";
import {
	CORE_LIBRARY_DIRECTORY,
	isMainModule,
	listSnapshots,
	readLibraryContext,
	renderLibraryCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const SPI_PACKAGE = "@embedito95/spi";
const SPI_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "spi", "main.e95");

// The shipped `main.e95` keeps its bus list in a postinstall marker: `install`
// replaces the marker with the target's SPI numbers. The editor always reads
// the installed project, so we inject one sample bus here to mirror that view
// (the same trick the gpio/i2c/serial generators use for their markers).
const SPI_ENUM_MARKER = "// e95.postinstall.spiEnum";
const SPI_ENUM_SAMPLE_MEMBER = "1,";

const buildReport = () => {
	const context = readLibraryContext({
		libraryPath: SPI_LIBRARY_PATH,
		packageName: SPI_PACKAGE,
		marker: SPI_ENUM_MARKER,
		sample: SPI_ENUM_SAMPLE_MEMBER,
	});
	const cases = [
		{
			label: "transfer infers u8 and transferBuffer infers u8[]",
			probes: ["received", "exchanged"],
			body: `import { SPI, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const received = bus.transfer(0)
export const exchanged = bus.transferBuffer([1, 2])`,
		},
		{
			label: "transfer16 infers u16",
			probes: ["word"],
			body: `import { SPI, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const word = bus.transfer16(4660)`,
		},
		{
			label: "transaction scope accepts its arguments and restores without diagnostics",
			probes: [],
			body: `import { SPI, SpiBitOrder, SpiClockMode, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const share = (value: u16): u16 => {
    bus.beginTransaction(8, SpiClockMode.MODE_0, SpiBitOrder.MSB_FIRST)
    bus.beginTransaction(16, SpiClockMode.MODE_3, SpiBitOrder.LSB_FIRST)
    const received: u16 = bus.transfer16(value)
    bus.endTransaction()
    bus.endTransaction()
    return received
}
export const close = () => {
    bus.close()
}`,
		},
		{
			label: "configuration setters accept every enum member without diagnostics",
			probes: [],
			body: `import { SPI, SpiBitOrder, SpiClockMode, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const configure = () => {
    bus.setClockDivider(8)
    bus.setBitOrder(SpiBitOrder.MSB_FIRST)
    bus.setBitOrder(SpiBitOrder.LSB_FIRST)
    bus.setClockMode(SpiClockMode.MODE_0)
    bus.setClockMode(SpiClockMode.MODE_1)
    bus.setClockMode(SpiClockMode.MODE_2)
    bus.setClockMode(SpiClockMode.MODE_3)
}`,
		},
		{
			label: "nested configuration and word transfer produce no diagnostics",
			probes: ["nested"],
			body: `import { SPI, SpiBitOrder, SpiClockMode, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
const choose = (value: u8): u8 => {
    if (value > 0) {
        if (value > 10) {
            bus.beginTransaction(16, SpiClockMode.MODE_3, SpiBitOrder.LSB_FIRST)
            bus.setBitOrder(SpiBitOrder.LSB_FIRST)
            const received: u8 = bus.transfer(value)
            bus.endTransaction()
            return received
        }
        bus.beginTransaction(8, SpiClockMode.MODE_0, SpiBitOrder.MSB_FIRST)
        const received: u8 = bus.transfer16(value) as u8
        bus.endTransaction()
        return received
    }
    return bus.transfer(value)
}
export const nested = choose(5)`,
		},
		{
			label: "wrong argument count reported",
			probes: [],
			body: `import { SPI, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const badCount = () => {
    bus.transfer(1, 2)
}`,
		},
		{
			label: "transfer16 wrong argument count reported",
			probes: [],
			body: `import { SPI, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const badCount = () => {
    bus.transfer16()
}`,
		},
		{
			label: "transaction wrong argument count reported",
			probes: [],
			body: `import { SPI, SpiClockMode, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const badCount = () => {
    bus.beginTransaction(8, SpiClockMode.MODE_0)
}`,
		},
		{
			label: "transaction bit order argument type reported",
			probes: [],
			body: `import { SPI, SpiClockMode, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const badOrder = () => {
    bus.beginTransaction(8, SpiClockMode.MODE_0, 1)
}`,
		},
		{
			label: "close rejects arguments",
			probes: [],
			body: `import { SPI, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const badClose = () => {
    bus.close(1)
}`,
		},
		{
			label: "non-enum bit order argument reported",
			probes: [],
			body: `import { SPI, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const badOrder = () => {
    bus.setBitOrder(1)
}`,
		},
		{
			label: "enum member of the wrong type reported",
			probes: [],
			body: `import { SPI, SpiClockMode, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const badMode = () => {
    bus.setBitOrder(SpiClockMode.MODE_0)
}`,
		},
		{
			label: "non-numeric clock divider reported",
			probes: [],
			body: `import { SPI, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const badDivider = () => {
    bus.setClockDivider("fast")
}`,
		},
		{
			label: "unknown method reported and left unresolved",
			probes: ["missing"],
			body: `import { SPI, getSPI } from '@embedito95/spi'
const bus = getSPI(SPI.1)
export const missing = bus.configure(1)`,
		},
	];

	const header = [
		"// LSP view of the `spi` core library (hover types + diagnostics).",
		"// Each case is a library-style program (isLibrary) whose probes are",
		"// exported, so unused-declaration noise is suppressed. Types come from",
		"// resolveProjectTypes (the same inference the language server uses for",
		"// hover), reading the real core/spi/main.e95 through",
		"// collectLibraryModuleInfo. Diagnostics come from the shared check().",
		"",
	];

	return `${header.join("\n")}${cases
		.map((testCase) => {
			return renderLibraryCase(testCase, context);
		})
		.join("\n")}`;
};

export const listSpiLibrarySnapshots = () => {
	return listSnapshots("spi-library.txt", buildReport());
};

export const writeSpiLibrarySnapshots = () => {
	writeSnapshots(listSpiLibrarySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeSpiLibrarySnapshots();
	console.log("Generated spi-library.txt");
}
