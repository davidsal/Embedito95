// Editor-facing checks for the `interrupt` core library: hover signatures,
// module and enum completions, and diagnostics for pins without a channel,
// unsupported trigger modes and ISR handlers that capture local state or take
// parameters. Documents live beside the registry source so hover/completions
// read the real `core/interrupt/main.e95` surface, and diagnostics reuse the
// same library introspection `check()` receives in the editor.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { check, formatDiagnosticMessage } from "embedito95-core";
import { onCompletion } from "../lsp/src/server/completions/index.js";
import { onHover } from "../lsp/src/server/hover/index.js";
import { SNAPSHOT_STATUS } from "./constants.js";
import { expectEqual, reportUnitChecks } from "./reporting.js";
import {
	CORE_LIBRARY_DIRECTORY,
	isMainModule,
	parseSource,
	readLibraryContext,
} from "./src/language/language-snapshot-harness.mjs";

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
const RESTRICTED_RULES_SAMPLE = [
	"// e95.allowedValues attachPinInterrupt pin 2,3",
	"// e95.allowedValues attachPinInterrupt mode LOW,CHANGE",
	"// e95.allowedValues detachPinInterrupt pin 2,3",
	"// e95.allowedValues getInterruptNumber pin 2,3",
].join("\n");

// STM32F103: the pin list carries the port-prefixed pin names the editor sees
// (Pin.A0, ...) and every EXTI line accepts the four trigger modes.
const STM32_INTERRUPT_RULES_SAMPLE = [
	"// e95.allowedValues attachPinInterrupt pin A0,A1,B6,C13,LED_BUILTIN",
	"// e95.allowedValues attachPinInterrupt mode LOW,CHANGE,RISING,FALLING",
	"// e95.allowedValues detachPinInterrupt pin A0,A1,B6,C13,LED_BUILTIN",
	"// e95.allowedValues getInterruptNumber pin A0,A1,B6,C13,LED_BUILTIN",
].join("\n");
const STM32_RESTRICTED_RULES_SAMPLE = [
	"// e95.allowedValues attachPinInterrupt pin A0,A1,B6,C13,LED_BUILTIN",
	"// e95.allowedValues attachPinInterrupt mode RISING,FALLING",
	"// e95.allowedValues detachPinInterrupt pin A0,A1,B6,C13,LED_BUILTIN",
	"// e95.allowedValues getInterruptNumber pin A0,A1,B6,C13,LED_BUILTIN",
].join("\n");

const GPIO_PACKAGE = "@embedito95/gpio";
const GPIO_LIBRARY_PATH = join(CORE_LIBRARY_DIRECTORY, "gpio", "main.e95");
const GPIO_PIN_ENUM_MARKER = "// e95.postinstall.pinEnum";
const AVR_PIN_ENUM_SAMPLE = "2,\n    3,\n    4,";
const STM32_PIN_ENUM_SAMPLE =
	"A0,\n    A1,\n    B6,\n    C13,\n    LED_BUILTIN,\n    C14";

const INTERRUPT_DOCUMENT_URI = pathToFileURL(INTERRUPT_LIBRARY_PATH).href;

const REGISTER_SOURCE = [
	"import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'",
	"import { Pin } from '@embedito95/gpio'",
	"const onEdge = () => {}",
	"export const register = () => {",
	"    attachPinInterrupt(Pin.2, onEdge, InterruptMode.RISING)",
	"}",
].join("\n");

const NESTED_SOURCE = [
	"import { InterruptMode, attachPinInterrupt, detachPinInterrupt } from '@embedito95/interrupt'",
	"import { Pin } from '@embedito95/gpio'",
	"const onEdge = () => {}",
	"const configure = (flag: boolean): boolean => {",
	"    if (flag) {",
	"        if (flag) {",
	"            attachPinInterrupt(Pin.2, onEdge, InterruptMode.FALLING)",
	"            detachPinInterrupt(Pin.2)",
	"            return true",
	"        }",
	"        attachPinInterrupt(Pin.3, onEdge, InterruptMode.CHANGE)",
	"    }",
	"    return false",
	"}",
	"export const nested = configure(true)",
].join("\n");

const PIN_WITHOUT_CHANNEL_SOURCE = [
	"import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'",
	"import { Pin } from '@embedito95/gpio'",
	"const onEdge = () => {}",
	"export const register = () => {",
	"    attachPinInterrupt(Pin.4, onEdge, InterruptMode.LOW)",
	"}",
].join("\n");

const CAPTURED_HANDLER_SOURCE = [
	"import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'",
	"import { Pin } from '@embedito95/gpio'",
	"export const register = () => {",
	"    const threshold = 1",
	"    attachPinInterrupt(Pin.2, () => {",
	"        const value = threshold",
	"    }, InterruptMode.RISING)",
	"}",
].join("\n");

const PARAMETER_HANDLER_SOURCE = [
	"import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'",
	"import { Pin } from '@embedito95/gpio'",
	"const onEdge = (value: u8) => {}",
	"export const register = () => {",
	"    attachPinInterrupt(Pin.2, onEdge, InterruptMode.RISING)",
	"}",
].join("\n");

const UNSUPPORTED_MODE_SOURCE = [
	"import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'",
	"import { Pin } from '@embedito95/gpio'",
	"const onEdge = () => {}",
	"export const register = () => {",
	"    attachPinInterrupt(Pin.2, onEdge, InterruptMode.RISING)",
	"}",
].join("\n");

const ENUM_COLLISION_SOURCE = [
	"import { setDigital, LOW } from '@embedito95/gpio'",
	"import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'",
	"import { Pin } from '@embedito95/gpio'",
	"const onEdge = () => {}",
	"export const configure = () => {",
	"    setDigital(Pin.2, LOW)",
	"    attachPinInterrupt(Pin.2, onEdge, InterruptMode.LOW)",
	"}",
].join("\n");

const IMPORT_COMPLETION_SOURCE = "import { } from '@embedito95/interrupt'";
const ENUM_COMPLETION_SOURCE = [
	"import { InterruptMode } from '@embedito95/interrupt'",
	"InterruptMode.",
].join("\n");
const STM32_REGISTER_SOURCE = [
	"import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'",
	"import { Pin } from '@embedito95/gpio'",
	"const onEdge = () => {}",
	"export const register = () => {",
	"    attachPinInterrupt(Pin.A0, onEdge, InterruptMode.RISING)",
	"    attachPinInterrupt(Pin.B6, onEdge, InterruptMode.FALLING)",
	"    attachPinInterrupt(Pin.C13, onEdge, InterruptMode.CHANGE)",
	"    attachPinInterrupt(Pin.A1, onEdge, InterruptMode.LOW)",
	"}",
].join("\n");

const STM32_ALIAS_REGISTER_SOURCE = [
	"import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'",
	"import { Pin } from '@embedito95/gpio'",
	"const onEdge = () => {}",
	"export const register = () => {",
	"    attachPinInterrupt(Pin.LED_BUILTIN, onEdge, InterruptMode.CHANGE)",
	"}",
].join("\n");

const STM32_PIN_WITHOUT_LINE_SOURCE = [
	"import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'",
	"import { Pin } from '@embedito95/gpio'",
	"const onEdge = () => {}",
	"export const register = () => {",
	"    attachPinInterrupt(Pin.C14, onEdge, InterruptMode.RISING)",
	"}",
].join("\n");

const STM32_UNSUPPORTED_MODE_SOURCE = [
	"import { InterruptMode, attachPinInterrupt } from '@embedito95/interrupt'",
	"import { Pin } from '@embedito95/gpio'",
	"const onEdge = () => {}",
	"export const register = () => {",
	"    attachPinInterrupt(Pin.A0, onEdge, InterruptMode.LOW)",
	"}",
].join("\n");

const INTERRUPT_EXPORT_LABELS =
	"attachPinInterrupt,detachPinInterrupt,getInterruptNumber,enableInterrupts,disableInterrupts,InterruptMode";
const INTERRUPT_MODE_LABELS = "LOW,CHANGE,RISING,FALLING";

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

const buildLibraryContext = (
	rulesSample,
	pinEnumSample = AVR_PIN_ENUM_SAMPLE,
) => {
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

const findPosition = (source, marker, offset = 0) => {
	const index = source.indexOf(marker);
	const point = index + offset;
	const before = source.slice(0, point);
	const lines = before.split("\n");
	return {
		line: lines.length - 1,
		character: lines[lines.length - 1].length,
	};
};

const hoverInDocument = async (source, position) => {
	const documents = new Map([
		[
			INTERRUPT_DOCUMENT_URI,
			{ uri: INTERRUPT_DOCUMENT_URI, getText: () => source },
		],
	]);
	const hover = await onHover(
		{
			textDocument: { uri: INTERRUPT_DOCUMENT_URI },
			position,
		},
		documents,
	);
	return hover?.contents?.value ?? null;
};

const completeAt = async (source, position) => {
	const documents = new Map([
		[
			INTERRUPT_DOCUMENT_URI,
			{ uri: INTERRUPT_DOCUMENT_URI, getText: () => source },
		],
	]);
	const items = await onCompletion(
		{
			textDocument: { uri: INTERRUPT_DOCUMENT_URI },
			position,
		},
		documents,
	);
	return items.map((item) => item.label).join(",");
};

const parseDiagnostics = (source, rulesSample, pinEnumSample) => {
	const { ast, comments } = parseSource(source);
	const context = buildLibraryContext(rulesSample, pinEnumSample);
	const { errors } = check(ast, { ...context.libraries, comments });
	return errors.map((error) => {
		const start = error.location?.start;
		const position = start ? `${start.line}:${start.column}` : "?";
		return `${position} ${error.code} ${formatDiagnosticMessage(error)}`;
	});
};

const checkAttachPinInterruptHover = async () => {
	const position = findPosition(REGISTER_SOURCE, "attachPinInterrupt");
	const hover = await hoverInDocument(REGISTER_SOURCE, position);
	return expectEqual(
		"LSP hover shows the attachPinInterrupt signature and documentation",
		hover,
		"```e95\nconst attachPinInterrupt(pin: Pin, handler: () => void, mode: InterruptMode): void\n```\n\nRegisters `handler` to run when `pin` reports the transition selected by  \n`mode`. The pin must expose an interrupt channel and the mode must be one the  \npin supports. `handler` is declared as `() => void` and runs in interrupt  \ncontext: pass a named function or a captureless inline arrow with that exact  \nsignature.  \n@param pin - Pin whose interrupt channel is used  \n@param handler - Function invoked on each matching transition  \n@param mode - Signal transition that triggers the handler",
	);
};

const checkInterruptModeHover = async () => {
	const position = findPosition(REGISTER_SOURCE, "InterruptMode");
	const hover = await hoverInDocument(REGISTER_SOURCE, position);
	return expectEqual(
		"LSP hover shows the InterruptMode enum and its members",
		hover,
		"```e95\nenum InterruptMode\n```\n\nSignal transition that triggers a pin interrupt.\n\n**Members:**\n- LOW\n- CHANGE\n- RISING\n- FALLING",
	);
};

const checkImportCompletions = async () => {
	const labels = await completeAt(IMPORT_COMPLETION_SOURCE, {
		line: 0,
		character: IMPORT_COMPLETION_SOURCE.length,
	});
	return expectEqual(
		"LSP completions of the interrupt import list every exported symbol",
		labels,
		INTERRUPT_EXPORT_LABELS,
	);
};

const checkEnumCompletions = async () => {
	const lastLine = ENUM_COMPLETION_SOURCE.split("\n").length - 1;
	const labels = await completeAt(ENUM_COMPLETION_SOURCE, {
		line: lastLine,
		character: "InterruptMode.".length,
	});
	return expectEqual(
		"LSP completions after InterruptMode list every trigger mode",
		labels,
		INTERRUPT_MODE_LABELS,
	);
};

const checkNestedNoFalsePositives = () => {
	const diagnostics = parseDiagnostics(NESTED_SOURCE, INTERRUPT_RULES_SAMPLE);
	return expectEqual(
		"LSP reports no diagnostics for valid nested interrupt registration",
		diagnostics.join("\n"),
		"",
	);
};

const checkPinWithoutChannel = () => {
	const diagnostics = parseDiagnostics(
		PIN_WITHOUT_CHANNEL_SOURCE,
		INTERRUPT_RULES_SAMPLE,
	);
	return expectEqual(
		"LSP reports a pin without an interrupt channel",
		diagnostics.join("\n"),
		"5:24 error.argumentValueNotAllowed Argument 'pin' does not accept 'Pin.4'; allowed values: 2, 3.",
	);
};

const checkCapturedHandler = () => {
	const diagnostics = parseDiagnostics(
		CAPTURED_HANDLER_SOURCE,
		INTERRUPT_RULES_SAMPLE,
	);
	return expectEqual(
		"LSP reports a handler that captures local state",
		diagnostics.join("\n"),
		"5:37 error.callbackCapturesLocalState Callback handler for 'handler' captures local state; register a top-level function instead.",
	);
};

const checkParameterHandler = () => {
	const diagnostics = parseDiagnostics(
		PARAMETER_HANDLER_SOURCE,
		INTERRUPT_RULES_SAMPLE,
	);
	return expectEqual(
		"LSP reports a named handler that takes parameters",
		diagnostics.join("\n"),
		"5:31 error.callbackSignatureMismatch Callback handler 'handler' does not match the expected signature '() => void' (found '(value: u8) => void'): parameter count (expected 0, found 1).",
	);
};

const checkUnsupportedMode = () => {
	const diagnostics = parseDiagnostics(
		UNSUPPORTED_MODE_SOURCE,
		RESTRICTED_RULES_SAMPLE,
	);
	return expectEqual(
		"LSP reports a trigger mode the pin does not support",
		diagnostics.join("\n"),
		"5:39 error.argumentValueNotAllowed Argument 'mode' does not accept 'InterruptMode.RISING'; allowed values: LOW, CHANGE.",
	);
};

const checkEnumCollisionNoFalsePositives = () => {
	const diagnostics = parseDiagnostics(
		ENUM_COLLISION_SOURCE,
		INTERRUPT_RULES_SAMPLE,
	);
	return expectEqual(
		"LSP accepts unqualified DigitalLevel.LOW and qualified InterruptMode.LOW together",
		diagnostics.join("\n"),
		"",
	);
};

const checkStm32RegisterNoFalsePositives = () => {
	const diagnostics = parseDiagnostics(
		STM32_REGISTER_SOURCE,
		STM32_INTERRUPT_RULES_SAMPLE,
		STM32_PIN_ENUM_SAMPLE,
	);
	return expectEqual(
		"LSP accepts every STM32 EXTI trigger mode and port-prefixed pin",
		diagnostics.join("\n"),
		"",
	);
};

const checkStm32AliasPinNoFalsePositives = () => {
	const diagnostics = parseDiagnostics(
		STM32_ALIAS_REGISTER_SOURCE,
		STM32_INTERRUPT_RULES_SAMPLE,
		STM32_PIN_ENUM_SAMPLE,
	);
	return expectEqual(
		"LSP accepts the LED_BUILTIN alias as an STM32 EXTI line",
		diagnostics.join("\n"),
		"",
	);
};

const checkStm32PinWithoutLine = () => {
	const diagnostics = parseDiagnostics(
		STM32_PIN_WITHOUT_LINE_SOURCE,
		STM32_INTERRUPT_RULES_SAMPLE,
		STM32_PIN_ENUM_SAMPLE,
	);
	return expectEqual(
		"LSP reports an STM32 pin without an EXTI line",
		diagnostics.join("\n"),
		"5:24 error.argumentValueNotAllowed Argument 'pin' does not accept 'Pin.C14'; allowed values: A0, A1, B6, C13, LED_BUILTIN.",
	);
};

const checkStm32UnsupportedMode = () => {
	const diagnostics = parseDiagnostics(
		STM32_UNSUPPORTED_MODE_SOURCE,
		STM32_RESTRICTED_RULES_SAMPLE,
		STM32_PIN_ENUM_SAMPLE,
	);
	return expectEqual(
		"LSP reports an STM32 trigger mode the platform does not expose",
		diagnostics.join("\n"),
		"5:40 error.argumentValueNotAllowed Argument 'mode' does not accept 'InterruptMode.LOW'; allowed values: RISING, FALLING.",
	);
};

export const runLspInterruptChecks = async () => {
	return [
		await checkAttachPinInterruptHover(),
		await checkInterruptModeHover(),
		await checkImportCompletions(),
		await checkEnumCompletions(),
		checkNestedNoFalsePositives(),
		checkPinWithoutChannel(),
		checkCapturedHandler(),
		checkParameterHandler(),
		checkUnsupportedMode(),
		checkEnumCollisionNoFalsePositives(),
		checkStm32RegisterNoFalsePositives(),
		checkStm32AliasPinNoFalsePositives(),
		checkStm32PinWithoutLine(),
		checkStm32UnsupportedMode(),
	];
};

if (isMainModule(import.meta.url)) {
	const results = await runLspInterruptChecks();
	reportUnitChecks("lsp-interrupt", results);
	const hasMismatch = results.some((result) => {
		return result.status === SNAPSHOT_STATUS.mismatch;
	});
	process.exit(hasMismatch ? 1 : 0);
}
