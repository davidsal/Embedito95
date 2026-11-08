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

const SERVO_PACKAGE = "@embedito95/servo";
const SERVO_LIBRARY_PATH = join(
	CLIENT_LIBRARY_DIRECTORY,
	"servo",
	"main.e95",
);
const GPIO_PACKAGE = "@embedito95/gpio";
const GPIO_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "gpio", "main.e95");
const GPIO_PIN_ENUM_MARKER = "// e95.postinstall.pinEnum";
const AVR_PIN_ENUM_SAMPLE_MEMBERS = "2,\n    3,\n    9,\n    10,";
const STM32_PIN_ENUM_SAMPLE_MEMBERS = "A8,\n    A9,\n    A10,\n    A11,";
const AVR_SERVO_PIN_NAME = "9";
const AVR_SECOND_SERVO_PIN_NAME = "10";
const STM32_SERVO_PIN_NAME = "A8";
const STM32_SECOND_SERVO_PIN_NAME = "A11";

// The servo surface takes `Pin`, so the context also needs the gpio type
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

const buildReport = ({
	pinSample = AVR_PIN_ENUM_SAMPLE_MEMBERS,
	firstPinName = AVR_SERVO_PIN_NAME,
	secondPinName = AVR_SECOND_SERVO_PIN_NAME,
	extraCases = [],
	platformNote = "// The installed AVR view is injected at the postinstall marker,",
	platformNoteContinuation =
		"// so the servo cases use the pins wired to Timer1 (9 and 10).",
} = {}) => {
	const servoContext = readLibraryContext({
		libraryPath: SERVO_LIBRARY_PATH,
		packageName: SERVO_PACKAGE,
	});
	const gpioContext = readLibraryContext({
		libraryPath: GPIO_LIBRARY_PATH,
		packageName: GPIO_PACKAGE,
		marker: GPIO_PIN_ENUM_MARKER,
		sample: pinSample,
	});
	const context = addGpioContext(servoContext, gpioContext);
	const cases = [
		{
			label: "getServo infers the servo handle type",
			probes: ["servo"],
			body: `import { getServo } from '@embedito95/servo'
import { Pin } from '@embedito95/gpio'
export const servo = getServo(Pin.${firstPinName})`,
		},
		{
			label: "getServoChannelCount infers u8",
			probes: ["count"],
			body: `import { getServoChannelCount } from '@embedito95/servo'
export const count = getServoChannelCount()`,
		},
		{
			label: "setAngle and getAngle use a u8 angle",
			probes: ["angle"],
			body: `import { getServo } from '@embedito95/servo'
import { Pin } from '@embedito95/gpio'
const servo = getServo(Pin.${firstPinName})
servo.setAngle(180)
export const angle = servo.getAngle()`,
		},
		{
			label: "setPulseWidth and getPulseWidth use u16 microseconds",
			probes: ["pulse"],
			body: `import { getServo } from '@embedito95/servo'
import { Pin } from '@embedito95/gpio'
const servo = getServo(Pin.${firstPinName})
servo.setPulseWidth(1500)
export const pulse = servo.getPulseWidth()`,
		},
		{
			label: "setPulseRange accepts two pulse widths and release has no result",
			probes: ["active"],
			body: `import { getServo } from '@embedito95/servo'
import { Pin } from '@embedito95/gpio'
const servo = getServo(Pin.${firstPinName})
servo.setPulseRange(500, 2500)
servo.release()
export const active = servo.isActive()`,
		},
		{
			label: "nested servo configuration produces no diagnostics",
			probes: ["nested"],
			body: `import { getServo } from '@embedito95/servo'
import { Pin } from '@embedito95/gpio'
const servo = getServo(Pin.${firstPinName})
const choose = (value: u8): u8 => {
    if (value > 0) {
        if (value > 10) {
            servo.setAngle(90)
            return servo.getAngle()
        }
        servo.setPulseWidth(1500)
        return servo.getAngle()
    }
    servo.release()
    return 0
}
export const nested = choose(5)`,
		},
		{
			label: "wrong argument count reported",
			probes: [],
			body: `import { getServo } from '@embedito95/servo'
import { Pin } from '@embedito95/gpio'
const servo = getServo(Pin.${firstPinName})
export const badCount = () => {
    servo.setAngle()
}`,
		},
		{
			label: "non-pin servo argument reported",
			probes: ["badPin"],
			body: `import { getServo } from '@embedito95/servo'
export const badPin = getServo(9)`,
		},
		{
			label: "non-numeric angle reported",
			probes: [],
			body: `import { getServo } from '@embedito95/servo'
import { Pin } from '@embedito95/gpio'
const servo = getServo(Pin.${firstPinName})
export const badAngle = () => {
    servo.setAngle("wide")
}`,
		},
		{
			label: "angle beyond u8 range reported",
			probes: [],
			body: `import { getServo } from '@embedito95/servo'
import { Pin } from '@embedito95/gpio'
const servo = getServo(Pin.${firstPinName})
export const badAngle = () => {
    servo.setAngle(300)
}`,
		},
		{
			label: "unknown method reported and left unresolved",
			probes: ["missing"],
			body: `import { getServo } from '@embedito95/servo'
import { Pin } from '@embedito95/gpio'
const servo = getServo(Pin.${firstPinName})
export const missing = servo.attach(Pin.${secondPinName})`,
		},
		...extraCases,
	];

	const header = [
		"// LSP view of the `servo` library (hover types + diagnostics).",
		"// Each case is a library-style program (isLibrary) whose probes are",
		"// exported, so unused-declaration noise is suppressed. Types come from",
		"// resolveProjectTypes (the same inference the language server uses for",
		"// hover), reading the real libraries/servo/main.e95 through",
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
		label: "STM32 accepts all four pulse pins",
		probes: ["first", "fourth"],
		body: `import { getServo } from '@embedito95/servo'
import { Pin } from '@embedito95/gpio'
export const first = getServo(Pin.${STM32_SERVO_PIN_NAME})
export const fourth = getServo(Pin.${STM32_SECOND_SERVO_PIN_NAME})`,
	},
];

export const listServoLibrarySnapshots = () => {
	return [
		...listSnapshots("servo-library.txt", buildReport()),
		...listSnapshots(
			"servo-library-stm32.txt",
			buildReport({
				pinSample: STM32_PIN_ENUM_SAMPLE_MEMBERS,
				firstPinName: STM32_SERVO_PIN_NAME,
				secondPinName: STM32_SECOND_SERVO_PIN_NAME,
				extraCases: STM32_EXTRA_CASES,
				platformNote:
					"// The installed STM32 view is injected at the postinstall marker,",
				platformNoteContinuation:
					"// so the servo cases use the pins wired to TIM1 (PA8..PA11).",
			}),
		),
	];
};

export const writeServoLibrarySnapshots = () => {
	writeSnapshots(listServoLibrarySnapshots());
};

if (isMainModule(import.meta.url)) {
	writeServoLibrarySnapshots();
	console.log("Generated servo-library.txt");
}
