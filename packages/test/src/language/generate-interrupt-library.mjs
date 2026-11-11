import { join } from "node:path";
import {
	CORE_LIBRARY_DIRECTORY,
	isMainModule,
	listSnapshots,
	readLibraryContext,
	renderLibraryCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const INTERRUPT_PACKAGE = "@embedito95/interrupt";
const INTERRUPT_LIBRARY_PATH = join(
	CORE_LIBRARY_DIRECTORY,
	"interrupt",
	"main.e95",
);
const INTERRUPT_RULES_MARKER = "// e95.postinstall.interruptRules";
const INTERRUPT_RULES_SAMPLE = [
	"// e95.allowedValues attachPinInterrupt pin 2,3",
	"// e95.allowedValues attachPinInterrupt mode LOW,CHANGE,RISING,FALLING",
	"// e95.allowedValues detachPinInterrupt pin 2,3",
	"// e95.allowedValues getInterruptNumber pin 2,3",
].join("\n");

const STM32_INTERRUPT_RULES_SAMPLE = [
	"// e95.allowedValues attachPinInterrupt pin A0,A1,B6,C13,LED_BUILTIN",
	"// e95.allowedValues attachPinInterrupt mode LOW,CHANGE,RISING,FALLING",
	"// e95.allowedValues detachPinInterrupt pin A0,A1,B6,C13,LED_BUILTIN",
	"// e95.allowedValues getInterruptNumber pin A0,A1,B6,C13,LED_BUILTIN",
].join("\n");

const GPIO_PACKAGE = "@embedito95/gpio";
const GPIO_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "gpio", "main.e95");
const GPIO_PIN_ENUM_MARKER = "// e95.postinstall.pinEnum";
const AVR_PIN_ENUM_SAMPLE = "2,\n    3,\n    4,";
const STM32_PIN_ENUM_SAMPLE =
	"A0,\n    A1,\n    B6,\n    C13,\n    LED_BUILTIN,\n    C14";

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

const buildContext = (rulesSample, pinEnumSample) => {
	const interruptContext = readLibraryContext({
		libraryPath: INTERRUPT_LIBRARY_PATH,
		packageName: INTERRUPT_PACKAGE,
		marker: INTERRUPT_RULES_MARKER,
		sample: rulesSample,
	});
	const gpioContext = readLibraryContext({
		libraryPath: GPIO_LIBRARY_PATH,
		packageName: GPIO_PACKAGE,
		marker: GPIO_PIN_ENUM_MARKER,
		sample: pinEnumSample,
	});
	return addGpioContext(interruptContext, gpioContext);
};

const renderCases = (testCases, caseContext) => {
	return testCases
		.map((testCase) => {
			return renderLibraryCase(testCase, caseContext);
		})
		.join("\n");
};

const buildReport = () => {
	const context = buildContext(INTERRUPT_RULES_SAMPLE, AVR_PIN_ENUM_SAMPLE);
	const cases = [
		{
			label: "attachPinInterrupt accepts a channel pin and a top-level handler",
			probes: [],
			body: `import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'
import { Pin } from '@embedito95/gpio'
const onEdge = () => {}
export const register = () => {
    attachPinInterrupt(Pin.2, onEdge, InterruptMode.RISING)
}`,
		},
		{
			label: "getInterruptNumber infers u8",
			probes: ["channel"],
			body: `import { getInterruptNumber } from '@embedito95/interrupt'
import { Pin } from '@embedito95/gpio'
export const channel = getInterruptNumber(Pin.3)`,
		},
		{
			label: "nested interrupt registration produces no diagnostics",
			probes: ["nested"],
			body: `import { InterruptMode, attachPinInterrupt, detachPinInterrupt } from '@embedito95/interrupt'
import { Pin } from '@embedito95/gpio'
const onEdge = () => {}
const configure = (flag: boolean): boolean => {
    if (flag) {
        if (flag) {
            attachPinInterrupt(Pin.2, onEdge, InterruptMode.FALLING)
            detachPinInterrupt(Pin.2)
            return true
        }
        attachPinInterrupt(Pin.3, onEdge, InterruptMode.CHANGE)
    }
    return false
}
export const nested = configure(true)`,
		},
		{
			label: "pin without an interrupt channel is reported",
			probes: [],
			body: `import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'
import { Pin } from '@embedito95/gpio'
const onEdge = () => {}
export const register = () => {
    attachPinInterrupt(Pin.4, onEdge, InterruptMode.LOW)
}`,
		},
		{
			label: "handler that captures local state is reported",
			probes: [],
			body: `import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'
import { Pin } from '@embedito95/gpio'
export const register = () => {
    const threshold = 1
    attachPinInterrupt(Pin.2, () => {
        const value = threshold
    }, InterruptMode.RISING)
}`,
		},
		{
			label: "handler that takes parameters is reported",
			probes: [],
			body: `import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'
import { Pin } from '@embedito95/gpio'
const onEdge = (value: u8) => {}
export const register = () => {
    attachPinInterrupt(Pin.2, onEdge, InterruptMode.RISING)
}`,
		},
		{
			label: "inline handler without captured state is accepted",
			probes: [],
			body: `import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'
import { Pin } from '@embedito95/gpio'
export const register = () => {
    attachPinInterrupt(Pin.2, () => {}, InterruptMode.RISING)
}`,
		},
		{
			label: "raw number trigger mode is reported",
			probes: [],
			body: `import { attachPinInterrupt } from '@embedito95/interrupt'
import { Pin } from '@embedito95/gpio'
const onEdge = () => {}
export const register = () => {
    attachPinInterrupt(Pin.2, onEdge, 1)
}`,
		},
	];

	const stm32Context = buildContext(
		STM32_INTERRUPT_RULES_SAMPLE,
		STM32_PIN_ENUM_SAMPLE,
	);
	const stm32Cases = [
		{
			label: "STM32 accepts port-prefixed pins and every EXTI trigger mode",
			probes: [],
			body: `import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'
import { Pin } from '@embedito95/gpio'
const onEdge = () => {}
export const register = () => {
    attachPinInterrupt(Pin.A0, onEdge, InterruptMode.RISING)
    attachPinInterrupt(Pin.A1, onEdge, InterruptMode.LOW)
    attachPinInterrupt(Pin.B6, onEdge, InterruptMode.FALLING)
    attachPinInterrupt(Pin.C13, onEdge, InterruptMode.CHANGE)
}`,
		},
		{
			label: "STM32 nested registration produces no diagnostics",
			probes: ["configured"],
			body: `import { InterruptMode, attachPinInterrupt, detachPinInterrupt } from '@embedito95/interrupt'
import { Pin } from '@embedito95/gpio'
const onEdge = () => {}
const configure = (flag: boolean): boolean => {
    if (flag) {
        if (flag) {
            attachPinInterrupt(Pin.A0, onEdge, InterruptMode.FALLING)
            detachPinInterrupt(Pin.A0)
            return true
        }
        attachPinInterrupt(Pin.B6, onEdge, InterruptMode.CHANGE)
    }
    return false
}
export const configured = configure(true)`,
		},
		{
			label: "STM32 accepts the LED_BUILTIN alias as an EXTI line",
			probes: [],
			body: `import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'
import { Pin } from '@embedito95/gpio'
const onEdge = () => {}
export const register = () => {
    attachPinInterrupt(Pin.LED_BUILTIN, onEdge, InterruptMode.CHANGE)
}`,
		},
		{
			label: "STM32 pin without an EXTI line is reported",
			probes: [],
			body: `import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'
import { Pin } from '@embedito95/gpio'
const onEdge = () => {}
export const register = () => {
    attachPinInterrupt(Pin.C14, onEdge, InterruptMode.RISING)
}`,
		},
	];

	const header = [
		"// LSP view of the `interrupt` core library (hover types + diagnostics).",
		"// Each case is a library-style program (isLibrary) whose probes are",
		"// exported, so unused-declaration noise is suppressed. Types come from",
		"// resolveProjectTypes (the same inference the language server uses for",
		"// hover), reading the real core/interrupt/main.e95 through",
		"// collectLibraryModuleInfo. Diagnostics come from the shared check().",
		"// The pin list and trigger list are injected at the postinstall marker,",
		"// exactly as `embedito95-cli install` fills them: the first block models",
		"// the AVR target (numeric pins), the second the STM32 EXTI lines",
		"// (port-prefixed pins).",
		"",
	];

	return `${header.join("\n")}${renderCases(cases, context)}\n${renderCases(stm32Cases, stm32Context)}`;
};

export const listInterruptLibrarySnapshots = () => {
	return [...listSnapshots("interrupt-library.txt", buildReport())];
};

export const writeInterruptLibrarySnapshots = () => {
	writeSnapshots(listInterruptLibrarySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeInterruptLibrarySnapshots();
	console.log("Generated interrupt-library.txt");
}
