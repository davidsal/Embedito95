import { join } from "node:path";
import {
	CORE_LIBRARY_DIRECTORY,
	isMainModule,
	listSnapshots,
	readLibraryContext,
	renderLibraryCase,
	writeSnapshots,
} from "./language-snapshot-harness.mjs";

const TIMER_PACKAGE = "@embedito95/timer";
const TIMER_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "timer", "main.e95");
const GPIO_PACKAGE = "@embedito95/gpio";
const GPIO_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "gpio", "main.e95");
const GPIO_PIN_ENUM_MARKER = "// e95.postinstall.pinEnum";
const AVR_PIN_ENUM_SAMPLE_MEMBERS = "2,\n    3,\n    9,";
const STM32_PIN_ENUM_SAMPLE_MEMBERS = "B9,\n    B10,";
const AVR_TONE_PIN_NAME = "2";
const AVR_PULSE_PIN_NAME = "3";
const STM32_TONE_PIN_NAME = "B9";
const STM32_PULSE_PIN_NAME = "B10";
const STM32_TIMER_ENUM_SAMPLE_MEMBERS = "1,\n    2,\n    3,\n    4,";
const AVR_PLATFORM_NOTE =
	"// The installed AVR view is injected at the postinstall marker, so the";
const AVR_PLATFORM_NOTE_CONTINUATION =
	"// reserved counter (`Timer.0`) is absent exactly as on the device.";
const STM32_PLATFORM_NOTE =
	"// The installed STM32 view is injected at the postinstall marker: TIMER_1";
const STM32_PLATFORM_NOTE_CONTINUATION =
	"// through TIMER_4 are all selectable and TIMER_0 does not exist.";

// The shipped `main.e95` keeps its timer list in a postinstall marker: `install`
// replaces the marker with the target's counters, excluding the one reserved by
// the runtime clock. The editor always reads the installed project, so we inject
// the AVR view (Timer1/Timer2) here, the same trick the gpio/i2c generators use.
const TIMER_ENUM_MARKER = "// e95.postinstall.timerEnum";
const TIMER_ENUM_SAMPLE_MEMBERS = "1,\n    2,";

// The timer surface takes `Pin` and `DigitalLevel`, so the timer context also
// needs the gpio type declarations to resolve enum members and report the
// correct argument types, just like the editor does.
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

const buildReport = ({
	sample = TIMER_ENUM_SAMPLE_MEMBERS,
	pinSample = AVR_PIN_ENUM_SAMPLE_MEMBERS,
	tonePinName = AVR_TONE_PIN_NAME,
	pulsePinName = AVR_PULSE_PIN_NAME,
	extraCases = [],
	platformNote = AVR_PLATFORM_NOTE,
	platformNoteContinuation = AVR_PLATFORM_NOTE_CONTINUATION,
} = {}) => {
	const timerContext = readLibraryContext({
		libraryPath: TIMER_LIBRARY_PATH,
		packageName: TIMER_PACKAGE,
		marker: TIMER_ENUM_MARKER,
		sample,
	});
	const gpioContext = readLibraryContext({
		libraryPath: GPIO_LIBRARY_PATH,
		packageName: GPIO_PACKAGE,
		marker: GPIO_PIN_ENUM_MARKER,
		sample: pinSample,
	});
	const context = addGpioContext(timerContext, gpioContext);
	const cases = [
		{
			label: "getTimer infers the hardware timer type",
			probes: ["timer"],
			body: `import { Timer, getTimer } from '@embedito95/timer'
export const timer = getTimer(Timer.1)`,
		},
		{
			label: "initialize accepts a period and a top-level callback",
			probes: [],
			body: `import { Timer, getTimer } from '@embedito95/timer'
const onPeriod = () => {}
const timer = getTimer(Timer.1)
export const start = () => {
    timer.initialize(1000, onPeriod)
    timer.start()
    timer.stop()
}`,
		},
		{
			label: "setPeriod accepts every available timer and period",
			probes: [],
			body: `import { Timer, getTimer } from '@embedito95/timer'
const onPeriod = () => {}
const first = getTimer(Timer.1)
const second = getTimer(Timer.2)
export const configure = () => {
    first.initialize(1000, onPeriod)
    second.initialize(1000, onPeriod)
    first.setPeriod(2000)
    second.setPeriod(2000)
}`,
		},
		{
			label: "nested timer configuration produces no diagnostics",
			probes: ["nested"],
			body: `import { Timer, getTimer } from '@embedito95/timer'
const onPeriod = () => {}
const timer = getTimer(Timer.1)
const choose = (value: u8): u8 => {
    if (value > 0) {
        if (value > 10) {
            timer.initialize(1000, onPeriod)
            timer.start()
            return value
        }
        timer.setPeriod(2000)
        return value
    }
    timer.stop()
    return value
}
export const nested = choose(5)`,
		},
		{
			label: "reserved timer member is reported as unknown",
			probes: ["missing"],
			body: `import { Timer, getTimer } from '@embedito95/timer'
export const missing = getTimer(Timer.0)`,
		},
		{
			label: "wrong argument count reported",
			probes: [],
			body: `import { Timer, getTimer } from '@embedito95/timer'
const timer = getTimer(Timer.1)
export const badCount = () => {
    timer.setPeriod()
}`,
		},
		{
			label: "non-numeric period reported",
			probes: [],
			body: `import { Timer, getTimer } from '@embedito95/timer'
const timer = getTimer(Timer.1)
export const badPeriod = () => {
    timer.setPeriod("slow")
}`,
		},
		{
			label: "non-enum timer selector reported",
			probes: ["badSelector"],
			body: `import { getTimer } from '@embedito95/timer'
export const badSelector = getTimer(1)`,
		},
		{
			label: "unknown method reported and left unresolved",
			probes: ["missing"],
			body: `import { Timer, getTimer } from '@embedito95/timer'
const timer = getTimer(Timer.1)
export const missing = timer.configure(1000)`,
		},
		{
			label: "startTone accepts a timer, a pin and a frequency",
			probes: [],
			body: `import { Timer, startTone, stopTone } from '@embedito95/timer'
import { Pin } from '@embedito95/gpio'
export const play = () => {
    startTone(Timer.2, Pin.${tonePinName}, 440)
    stopTone(Pin.${tonePinName})
}`,
		},
		{
			label: "measurePulseWidth infers u32 microseconds",
			probes: ["width"],
			body: `import { measurePulseWidth } from '@embedito95/timer'
import { Pin, HIGH } from '@embedito95/gpio'
export const width = measurePulseWidth(Pin.${pulsePinName}, HIGH, 1000)`,
		},
		{
			label: "nested tone and pulse configuration produces no diagnostics",
			probes: ["nested"],
			body: `import { Timer, startTone, stopTone, measurePulseWidth } from '@embedito95/timer'
import { Pin, HIGH } from '@embedito95/gpio'
const choose = (value: u8): u32 => {
    if (value > 0) {
        if (value > 10) {
            startTone(Timer.2, Pin.${tonePinName}, 880)
            stopTone(Pin.${tonePinName})
            return measurePulseWidth(Pin.${pulsePinName}, HIGH, 500)
        }
        stopTone(Pin.${tonePinName})
        return measurePulseWidth(Pin.${pulsePinName}, HIGH, 500)
    }
    stopTone(Pin.${tonePinName})
    return measurePulseWidth(Pin.${pulsePinName}, HIGH, 500)
}
export const nested = choose(5)`,
		},
		{
			label: "non-pin tone argument reported",
			probes: [],
			body: `import { Timer, startTone } from '@embedito95/timer'
export const badPin = () => {
    startTone(Timer.2, 2, 440)
}`,
		},
		{
			label: "tone frequency outside u16 range reported",
			probes: [],
			body: `import { Timer, startTone } from '@embedito95/timer'
import { Pin } from '@embedito95/gpio'
export const badFrequency = () => {
    startTone(Timer.2, Pin.${tonePinName}, 70000)
}`,
		},
		{
			label: "non-level pulse argument reported",
			probes: [],
			body: `import { measurePulseWidth } from '@embedito95/timer'
import { Pin } from '@embedito95/gpio'
export const badLevel = measurePulseWidth(Pin.${pulsePinName}, 1, 1000)`,
		},
		{
			label: "stopTone requires a pin",
			probes: [],
			body: `import { stopTone } from '@embedito95/timer'
export const badPin = () => {
    stopTone(2)
}`,
		},
		{
			label: "startTone wrong argument count reported",
			probes: [],
			body: `import { Timer, startTone } from '@embedito95/timer'
import { Pin } from '@embedito95/gpio'
export const badCount = () => {
    startTone(Timer.2, Pin.${tonePinName})
}`,
		},
		...extraCases,
	];

	const header = [
		"// LSP view of the `timer` core library (hover types + diagnostics).",
		"// Each case is a library-style program (isLibrary) whose probes are",
		"// exported, so unused-declaration noise is suppressed. Types come from",
		"// resolveProjectTypes (the same inference the language server uses for",
		"// hover), reading the real core/timer/main.e95 through",
		"// collectLibraryModuleInfo. Diagnostics come from the shared check().",
		platformNote,
		platformNoteContinuation,
		"",
	];

	return `${header.join("\n")}${cases
		.map((testCase) => {
			return renderLibraryCase(testCase, context);
		})
		.join("\n")}`;
};

const STM32_EXTRA_CASES = [
	{
		label: "STM32 accepts the fourth hardware timer",
		probes: ["timer"],
		body: `import { Timer, getTimer } from '@embedito95/timer'
export const timer = getTimer(Timer.4)`,
	},
	{
		label: "STM32 tone accepts any of the four timers",
		probes: [],
		body: `import { Timer, startTone, stopTone } from '@embedito95/timer'
import { Pin } from '@embedito95/gpio'
export const play = () => {
    startTone(Timer.3, Pin.${STM32_TONE_PIN_NAME}, 440)
    stopTone(Pin.${STM32_TONE_PIN_NAME})
}`,
	},
];

export const listTimerLibrarySnapshots = () => {
	return [
		...listSnapshots("timer-library.txt", buildReport()),
		...listSnapshots(
			"timer-library-stm32.txt",
			buildReport({
				sample: STM32_TIMER_ENUM_SAMPLE_MEMBERS,
				pinSample: STM32_PIN_ENUM_SAMPLE_MEMBERS,
				tonePinName: STM32_TONE_PIN_NAME,
				pulsePinName: STM32_PULSE_PIN_NAME,
				extraCases: STM32_EXTRA_CASES,
				platformNote: STM32_PLATFORM_NOTE,
				platformNoteContinuation: STM32_PLATFORM_NOTE_CONTINUATION,
			}),
		),
	];
};

export const writeTimerLibrarySnapshots = () => {
	writeSnapshots(listTimerLibrarySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeTimerLibrarySnapshots();
	console.log("Generated timer-library.txt");
}
