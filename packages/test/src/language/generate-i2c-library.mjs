import { join } from "node:path";
import {
	CORE_LIBRARY_DIRECTORY,
	isMainModule,
	listSnapshots,
	readLibraryContext,
	renderLibraryCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const I2C_PACKAGE = "@embedito95/i2c";
const I2C_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "i2c", "main.e95");

// The shipped `main.e95` keeps its buses in a postinstall marker: `install`
// replaces the marker with the target's bus numbers. The editor always reads
// the installed project, so we inject one sample bus here to mirror that view.
const I2C_ENUM_MARKER = "// e95.postinstall.i2cEnum";
const I2C_ENUM_SAMPLE_MEMBER = "1,";
const SLAVE_ADDRESS = 66;

const buildReport = () => {
	const context = readLibraryContext({
		libraryPath: I2C_LIBRARY_PATH,
		packageName: I2C_PACKAGE,
		marker: I2C_ENUM_MARKER,
		sample: I2C_ENUM_SAMPLE_MEMBER,
	});
	const cases = [
		{
			label: "read infers u8",
			probes: ["receivedByte"],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const receivedByte = bus.read()`,
		},
		{
			label: "requestFrom and available infer u8",
			probes: ["requested", "pending"],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const requested = bus.requestFrom(60, 1)
export const pending = bus.available()`,
		},
		{
			label: "endWrite infers I2CStatus",
			probes: ["status"],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
bus.beginWrite(60)
bus.sendByte(0)
export const status = bus.endWrite()`,
		},
		{
			label: "step transaction in nested conditionals produces no diagnostics",
			probes: ["result"],
			body: `import { I2C, I2CBus, I2CStatus, getI2C } from '@embedito95/i2c'
const send = (bus: I2CBus, value: u8): I2CStatus => {
    bus.beginWrite(60)
    bus.sendByte(0)
    bus.sendByte(value)
    const status: I2CStatus = bus.endWrite()
    if (status != I2CStatus.OK) {
        if (status == I2CStatus.DATA_NACK) {
            return status
        }
        bus.beginWrite(60)
        bus.sendByte(value)
        return bus.endWrite()
    }
    return status
}
export const result = send(getI2C(I2C.1), 1)`,
		},
		{
			label: "beginWrite wrong argument count reported",
			probes: ["badCount"],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const badCount = bus.beginWrite()`,
		},
		{
			label: "wider integer argument warns on sendByte",
			probes: ["widened"],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const wideValue: i32 = 300
bus.beginWrite(60)
export const widened = bus.sendByte(wideValue)`,
		},
		{
			label: "non-numeric argument reported on beginWrite",
			probes: ["badType"],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const badType = bus.beginWrite("sixty")`,
		},
		{
			label: "nested reads inside nested conditionals produce no diagnostics",
			probes: ["nested"],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const choose = (bus: I2CBus): u8 => {
    bus.requestFrom(60, 2)
    if (bus.available() > 0) {
        if (bus.available() > 1) {
            return bus.read()
        }
        return bus.read()
    }
    return 0
}
export const nested = choose(getI2C(I2C.1))`,
		},
		{
			label: "wrong argument count reported",
			probes: ["badCount"],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const badCount = bus.requestFrom(60)`,
		},
		{
			label: "unknown method reported and left unresolved",
			probes: ["missing"],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const missing = bus.somewhere(0)`,
		},
		{
			label: "wider integer argument warns on a u8 parameter",
			probes: ["widened"],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const wideQuantity: i32 = 4
export const widened = bus.requestFrom(60, wideQuantity)`,
		},
		{
			label: "non-numeric argument reported",
			probes: ["badType"],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const badType = bus.requestFrom("sixty", 1)`,
		},
		{
			label: "slave handlers register without diagnostics",
			probes: [],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
const onSlaveReceive = () => {
    const receivedByte: u8 = bus.read()
    const pending: u8 = bus.available()
}
const onSlaveRequest = () => {
    bus.sendResponse([1, 2])
}
export const start = () => {
    bus.initializeSlave(${SLAVE_ADDRESS})
    bus.onReceive(onSlaveReceive)
    bus.onRequest(onSlaveRequest)
}`,
		},
		{
			label: "slave address above the 7-bit range reported",
			probes: [],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const start = () => {
    bus.initializeSlave(200)
}`,
		},
		{
			label: "slave address above the 7-bit range inside nested conditionals reported",
			probes: [],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const start = () => {
    if (bus.available() > 0) {
        if (bus.available() > 1) {
            bus.initializeSlave(200)
        }
    }
}`,
		},
		{
			label: "inline handler with captured state reported",
			probes: [],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const start = () => {
    const payload: u8 = 1
    bus.initializeSlave(${SLAVE_ADDRESS})
    bus.onRequest(() => {
        bus.sendResponse([payload])
    })
}`,
		},
		{
			label: "inline stateless handler is accepted",
			probes: [],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
export const start = () => {
    bus.onReceive(() => {})
}`,
		},
		{
			label: "nested reads inside the slave handler produce no diagnostics",
			probes: [],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
const onSlaveReceive = () => {
    if (bus.available() > 0) {
        if (bus.available() > 1) {
            bus.read()
        }
        bus.read()
    }
}
export const start = () => {
    bus.initializeSlave(${SLAVE_ADDRESS})
    bus.onReceive(onSlaveReceive)
}`,
		},
		{
			label: "non-function handler identifier reported",
			probes: [],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
const notAHandler: u8 = 1
export const start = () => {
    bus.onReceive(notAHandler)
}`,
		},
		{
			label: "handler with parameters reported",
			probes: [],
			body: `import { I2C, I2CBus, getI2C } from '@embedito95/i2c'
const bus: I2CBus = getI2C(I2C.1)
const onSlaveReceive = (value: u8) => {}
export const start = () => {
    bus.initializeSlave(${SLAVE_ADDRESS})
    bus.onReceive(onSlaveReceive)
}`,
		},
	];

	const header = [
		"// LSP view of the `i2c` core library (hover types + diagnostics).",
		"// Each case is a library-style program (isLibrary) whose probes are",
		"// exported, so unused-declaration noise is suppressed. Types come from",
		"// resolveProjectTypes (the same inference the language server uses for",
		"// hover), reading the real core/i2c/main.e95 through",
		"// collectLibraryModuleInfo. Diagnostics come from the shared check().",
		"",
	];

	return `${header.join("\n")}${cases
		.map((testCase) => {
			return renderLibraryCase(testCase, context);
		})
		.join("\n")}`;
};

export const listI2CLibrarySnapshots = () => {
	return listSnapshots("i2c-library.txt", buildReport());
};

export const writeI2CLibrarySnapshots = () => {
	writeSnapshots(listI2CLibrarySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeI2CLibrarySnapshots();
	console.log("Generated i2c-library.txt");
}
