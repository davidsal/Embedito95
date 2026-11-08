import { join } from "node:path";
import {
	CLIENT_LIBRARY_DIRECTORY,
	CORE_LIBRARY_DIRECTORY,
	isMainModule,
	listSnapshots,
	readLibraryContext,
	renderLibraryCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const SOFTWARE_SERIAL_PACKAGE = "@embedito95/software-serial";
const SOFTWARE_SERIAL_LIBRARY_PATH = join(
	CLIENT_LIBRARY_DIRECTORY,
	"software-serial",
	"main.e95",
);
const GPIO_PACKAGE = "@embedito95/gpio";
const GPIO_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "gpio", "main.e95");
const GPIO_PIN_ENUM_MARKER = "// e95.postinstall.pinEnum";
const AVR_PIN_ENUM_SAMPLE_MEMBERS =
	"2,\n    3,\n    8,\n    9,\n    10,\n    A0,";
const TRANSMIT_PIN_NAME = "3";
const RECEIVE_PIN_NAME = "2";
const SECOND_RECEIVE_PIN_NAME = "8";

// The library surface takes `Pin`, so the context also needs the gpio type
// declarations to resolve enum members and report the correct argument types,
// exactly like the editor does after installing both libraries.
const addGpioContext = (context, gpioContext) => {
	context.libraries.knownLibraries.add(GPIO_PACKAGE);
	context.libraries.libraryExports[GPIO_PACKAGE] =
		gpioContext.libraries.libraryExports[GPIO_PACKAGE];
	context.libraries.libraryTypes[GPIO_PACKAGE] =
		gpioContext.libraries.libraryTypes[GPIO_PACKAGE];
	context.libraries.libraryEnumInfo[GPIO_PACKAGE] =
		gpioContext.libraries.libraryEnumInfo[GPIO_PACKAGE];
	return context;
};

const buildReport = () => {
	const libraryContext = readLibraryContext({
		libraryPath: SOFTWARE_SERIAL_LIBRARY_PATH,
		packageName: SOFTWARE_SERIAL_PACKAGE,
	});
	const gpioContext = readLibraryContext({
		libraryPath: GPIO_LIBRARY_PATH,
		packageName: GPIO_PACKAGE,
		marker: GPIO_PIN_ENUM_MARKER,
		sample: AVR_PIN_ENUM_SAMPLE_MEMBERS,
	});
	const context = addGpioContext(libraryContext, gpioContext);
	const cases = [
		{
			label: "getSoftwareSerial infers the software serial handle type",
			probes: ["port"],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
export const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})`,
		},
		{
			label: "getSoftwareSerialReceiveCapacity infers u8",
			probes: ["capacity"],
			body: `import { getSoftwareSerialReceiveCapacity } from '@embedito95/software-serial'
export const capacity = getSoftwareSerialReceiveCapacity()`,
		},
		{
			label: "initialize accepts a u32 baud rate and listening is boolean",
			probes: ["listening"],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
port.initialize(115200)
export const listening = port.isListening()`,
		},
		{
			label: "read infers a nullable u8 and hasData infers boolean",
			probes: ["incoming", "waiting"],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const incoming = port.read()
export const waiting = port.hasData()`,
		},
		{
			label: "readLine infers string and readInteger infers i32",
			probes: ["line", "number"],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const line = port.readLine()
export const number = port.readInteger()`,
		},
		{
			label: "getNextByte infers nullable u8 and overflow is boolean",
			probes: ["next", "overflowed"],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const next = port.getNextByte()
export const overflowed = port.hasOverflowed()`,
		},
		{
			label:
				"nested listening and reads narrow the nullable read without diagnostics",
			probes: ["nested"],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
const readByte = (value: u8): u8 => {
    const empty: u8 = 0
    if (value > 0) {
        if (port.hasData()) {
            const incoming: u8 | null = port.read()
            if (incoming != null) {
                return incoming
            }
        }
        port.startListening()
        return empty
    }
    port.stopListening()
    return empty
}
export const nested = readByte(5)`,
		},
		{
			label:
				"a null check that does not exit the branch does not narrow the return",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
const readByte = (): u8 => {
    const value: u8 | null = port.read()
    if (value == null) {
        port.startListening()
    }
    return value
}
export const badNarrow = readByte()`,
		},
		{
			label:
				"reassigning a nullable value after the guard is no longer narrowed",
			probes: [],
			body: `const readMaybe = (): u8 | null => {
    return null
}
const readValue = (): u8 => {
    let value: u8 | null = readMaybe()
    if (value == null) {
        return 0 as u8
    }
    value = readMaybe()
    return value
}
export const reassigned = readValue()`,
		},
		{
			label:
				"reassigning inside a narrowed nested branch no longer narrows the return",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
const readValue = (): u8 => {
    let value: u8 | null = port.read()
    if (value != null) {
        if (port.hasData()) {
            value = null
            return value
        }
    }
    return 0 as u8
}
export const branchReassigned = readValue()`,
		},
		{
			label:
				"assignment in the else of a guard that exits no longer narrows the return",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
const readValue = (): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        value = null
    }
    return value
}
export const elseReassigned = readValue()`,
		},
		{
			label:
				"a homonym reassigned inside a nested function keeps the outer narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
type Reset = {
    run: (value: u8) => u8
}
const readValue = (): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    }
    const reset: Reset = {
        run: (value: u8): u8 => {
            value = 0 as u8
            return value
        }
    }
    reset.run(0 as u8)
    return value
}
export const nestedShadow = readValue()`,
		},
		{
			label:
				"a guard that exits through an exhaustive switch narrows the return",
			probes: [],
			body: `const readMaybe = (): u8 | null => {
    return null
}
const readValue = (): u8 => {
    const value: u8 | null = readMaybe()
    const code: u8 = 1
    if (value == null) {
        switch (code) {
            case 1:
                return 1 as u8
            default:
                return 0 as u8
        }
    }
    return value
}
export const switched = readValue()`,
		},
		{
			label:
				"send, sendLine, close and flushOutput accept their documented arguments",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const transmit = () => {
    port.send("AT")
    port.sendLine("AT")
    port.flushOutput()
    port.close()
}`,
		},
		{
			label: "send reports a numeric payload because the port is text-only",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const badPayload = () => {
    port.send(5)
}`,
		},
		{
			label: "wrong argument count reported",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const badCount = () => {
    port.initialize()
}`,
		},
		{
			label: "non-pin receive argument reported",
			probes: ["badPin"],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
export const badPin = getSoftwareSerial(3, 2)`,
		},
		{
			label: "non-numeric baud rate reported",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const badRate = () => {
    port.initialize("fast")
}`,
		},
		{
			label: "unknown method reported and left unresolved",
			probes: ["missing"],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const missing = port.listen()`,
		},
		{
			label:
				"updating a narrowed read inside the branch keeps its operand narrowed",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const updated = () => {
    let value: u8 | null = port.read()
    if (value != null) {
        value += 1
        return 0 as u8
    }
    return 0 as u8
}`,
		},
		{
			label:
				"reading a narrowed value in its own assignment inside the branch keeps it narrowed",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const selfAssigned = () => {
    let value: u8 | null = port.read()
    if (value != null) {
        value = value + 1
        return 0 as u8
    }
    return 0 as u8
}`,
		},
		{
			label:
				"reading a narrowed value in its own assignment after the guard keeps it narrowed",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const assignedAfterGuard = () => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    }
    value = value + 1
    return 0 as u8
}`,
		},
		{
			label:
				"a conditional reassignment in the else branch that always exits keeps the narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const conditionalElse = (flag: boolean): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else if (flag) {
        value = null
        return 1 as u8
    }
    return value
}`,
		},
		{
			label:
				"a nested conditional reassignment in the else branch invalidates the later narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const nestedElse = (flag: boolean): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        if (flag) {
            value = null
        }
    }
    return value
}`,
		},
		{
			label:
				"a nested switch reassignment in the else branch invalidates the later narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const switchedElse = (code: u8): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        switch (code) {
            case 1:
                value = null
                break
            default:
                break
        }
    }
    return value
}`,
		},
		{
			label:
				"an else-if that returns without reassigning keeps the narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const elseIfReturns = (flag: boolean): u8 => {
    const value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else if (flag) {
        return 1 as u8
    }
    return value
}`,
		},
		{
			label:
				"a nested if that returns without reassigning keeps the narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const nestedElseReturns = (flag: boolean): u8 => {
    const value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        if (flag) {
            return 1 as u8
        }
    }
    return value
}`,
		},
		// Removed: "a closure that reassigns the value invalidates the later
		// narrowing". e95 has no supported nested function that can assign an
		// enclosing local (a local closure is rejected with unsupportedLocalClosure
		// and a callback record cannot capture local state), so any rewrite either
		// does not touch the outer `value` or adds an unrelated diagnostic. The
		// invalidation itself stays covered by the else/nested/loop cases, and the
		// function-expression branch of the narrowing scan is covered by the
		// homonym case above, where a parameter shadow correctly does NOT invalidate.
		{
			label:
				"a while loop in the else that assigns and breaks invalidates the subsequent narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const whileElse = (flag: boolean): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        while (flag) {
            value = null
            break
        }
    }
    return value
}`,
		},
		{
			label:
				"a for loop in the else that assigns invalidates the subsequent narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const forElse = (): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        for (let index: u8 = 0; index < 1; index += 1) {
            value = null
        }
    }
    return value
}`,
		},
		{
			label:
				"a do-while loop in the else that assigns invalidates the subsequent narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const doWhileElse = (flag: boolean): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        do {
            value = null
        } while (flag)
    }
    return value
}`,
		},
		{
			label:
				"a while-true loop that only returns keeps the subsequent narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const infiniteElse = (): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        while (true) {
            return 1 as u8
        }
    }
    return value
}`,
		},
		{
			label:
				"a while loop in the else that never assigns keeps the subsequent narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const whileNoAssign = (flag: boolean): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        while (flag) {
            port.startListening()
        }
    }
    return value
}`,
		},
		{
			label:
				"a for update assignment in the else invalidates the subsequent narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const forUpdateElse = (flag: boolean): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        for (; flag; value = null) {
            flag = false
        }
    }
    return value
}`,
		},
		{
			label:
				"a for init assignment in the else invalidates even when the test is true and the body breaks",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const forInitElse = (): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        for (value = null; true; ) {
            break
        }
    }
    return value
}`,
		},
		{
			label:
				"a while test assignment in the else invalidates the subsequent narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const whileTestElse = (): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        while (value = null) {
        }
    }
    return value
}`,
		},
		{
			label:
				"a for test assignment in the else invalidates the subsequent narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const forTestElse = (): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        for (; value = null; ) {
        }
    }
    return value
}`,
		},
		{
			label:
				"a do-while test assignment in the else invalidates the subsequent narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const doWhileTestElse = (): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        do {
        } while (value = null)
    }
    return value
}`,
		},
		{
			label:
				"initialize at 115200 with nested listening and overflow checks has no diagnostics",
			probes: ["nested"],
			body: `import { getSoftwareSerial, getSoftwareSerialReceiveCapacity } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
const inspect = (): u8 => {
    port.initialize(115200)
    if (port.isListening()) {
        if (port.hasOverflowed()) {
            const capacity: u8 = getSoftwareSerialReceiveCapacity()
            if (capacity > 0) {
                port.startListening()
            }
        }
    }
    const next: u8 | null = port.getNextByte()
    if (next != null) {
        return next
    }
    return 0 as u8
}
export const nested = inspect()`,
		},
		{
			label:
				"a for update assignment whose body always returns keeps the subsequent narrowing",
			probes: [],
			body: `import { getSoftwareSerial } from '@embedito95/software-serial'
import { Pin } from '@embedito95/gpio'
const port = getSoftwareSerial(Pin.${TRANSMIT_PIN_NAME}, Pin.${RECEIVE_PIN_NAME})
export const forUpdateReturns = (flag: boolean): u8 => {
    let value: u8 | null = port.read()
    if (value == null) {
        return 0 as u8
    } else {
        for (; flag; value = null) {
            return 1 as u8
        }
    }
    return value
}`,
		},
	];

	const header = [
		"// LSP view of the `software-serial` library (hover types + diagnostics).",
		"// Each case is a library-style program (isLibrary) whose probes are",
		"// exported, so unused-declaration noise is suppressed. Types come from",
		"// resolveProjectTypes (the same inference the language server uses for",
		"// hover), reading the real libraries/software-serial/main.e95 through",
		"// collectLibraryModuleInfo. Diagnostics come from the shared check().",
		"// The installed AVR view is injected at the postinstall marker, so the",
		"// cases use timer-free pins with a pin-change channel (D2, D3 and D8).",
		"// Completions follow the same convention as the servo and eeprom",
		"// generators: the handle's members are a plain `SoftwareSerialPort`",
		"// object type, so member completions come from the generic type-method",
		"// completion path and are not duplicated in this snapshot.",
		"",
	];

	return `${header.join("\n")}${cases
		.map((testCase) => {
			return renderLibraryCase(testCase, context);
		})
		.join("\n")}`;
};

export const listSoftwareSerialLibrarySnapshots = () => {
	return listSnapshots("software-serial-library.txt", buildReport());
};

export const writeSoftwareSerialLibrarySnapshots = () => {
	writeSnapshots(listSoftwareSerialLibrarySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeSoftwareSerialLibrarySnapshots();
	console.log("Generated software-serial-library.txt");
}
