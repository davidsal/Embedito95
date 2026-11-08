// Emits the per-counter C++ support block (`Timer` enum, compare/tone wiring
// and ISR handlers) from the timer data definitions. Each generator takes one
// entry so the output stays uniform across counters.

import {
	listTimerEntries,
	resolveTimerDefinition,
} from "./timer-definitions.js";
import { buildRunFunction, buildToneHelpers } from "./tone-support.js";

const buildTimerEnum = (entries) => {
	const enumMembers = entries
		.map((entry) => {
			return `\t${entry.name} = ${entry.number}`;
		})
		.join(",\n");

	return `typedef enum : u8 {\n${enumMembers}\n} Timer;`;
};

const buildCompanionLine = (definition) => {
	if (!definition.companionRegister) {
		return null;
	}

	return `\t${definition.companionRegister} = 0;`;
};

const buildModeLine = (definition) => {
	if (definition.modeRegister === definition.prescalerRegister) {
		return `\t${definition.modeRegister} = (u8)(_BV(${definition.modeBit}) | prescalerToControlBits(config.prescaler));`;
	}

	return `\t${definition.modeRegister} = (u8)_BV(${definition.modeBit});`;
};

const buildPrescalerLine = (definition) => {
	if (definition.modeRegister === definition.prescalerRegister) {
		return null;
	}

	return `\t${definition.prescalerRegister} = (u8)prescalerToControlBits(config.prescaler);`;
};

const buildPeriodFunction = (entry) => {
	const definition = resolveTimerDefinition(entry);
	const lines = [
		`inline void apply${definition.functionSuffix}Period(u32 periodMicros) {`,
		`\tconst PrescalerConfig config = computePrescaler(periodMicros, F_CPU, ${definition.maximumTicks}, AVR_PRESCALER_LADDER);`,
	];

	for (const line of [
		buildCompanionLine(definition),
		buildModeLine(definition),
		buildPrescalerLine(definition),
	]) {
		if (line) {
			lines.push(line);
		}
	}

	lines.push(
		`\t${definition.counterRegister} = 0;`,
		`\t${definition.compareRegister} = (${definition.compareCast})(config.ticks - 1);`,
		"}",
	);

	return lines.join("\n");
};

const buildStartCase = (entry) => {
	const definition = resolveTimerDefinition(entry);
	return [
		`\t\tcase Timer::${entry.name}: {`,
		`\t\t\t${definition.interruptMaskRegister} |= (u8)_BV(${definition.compareInterruptBit});`,
		`\t\t\t${definition.interruptFlagRegister} = (u8)_BV(${definition.compareFlagBit});`,
		"\t\t\tbreak;",
		"\t\t}",
	].join("\n");
};

const buildStopCase = (entry) => {
	const definition = resolveTimerDefinition(entry);
	return [
		`\t\tcase Timer::${entry.name}: {`,
		`\t\t\t${definition.interruptMaskRegister} &= (u8)~_BV(${definition.compareInterruptBit});`,
		"\t\t\tbreak;",
		"\t\t}",
	].join("\n");
};

const buildPeriodCase = (entry) => {
	const definition = resolveTimerDefinition(entry);
	return [
		`\t\tcase Timer::${entry.name}: {`,
		`\t\t\tapply${definition.functionSuffix}Period(periodMicros);`,
		"\t\t\tbreak;",
		"\t\t}",
	].join("\n");
};

const buildCallbackCase = (entry) => {
	const definition = resolveTimerDefinition(entry);
	return [
		`\t\tcase Timer::${entry.name}: {`,
		`\t\t\t${definition.callbackVariable} = callback;`,
		"\t\t\tbreak;",
		"\t\t}",
	].join("\n");
};

const buildTimerDetail = (entries) => {
	const callbackVariables = entries
		.map((entry) => {
			const definition = resolveTimerDefinition(entry);
			return `static void (*${definition.callbackVariable})() = nullptr;`;
		})
		.join("\n");
	const toneVariables = entries
		.map((entry) => {
			const definition = resolveTimerDefinition(entry);
			return `static u8 ${definition.toneVariable} = TONE_NONE;`;
		})
		.join("\n");
	const toneHelpers = buildToneHelpers(entries);
	const periodFunctions = entries.map(buildPeriodFunction).join("\n\n");
	const periodCases = entries.map(buildPeriodCase).join("\n");
	const callbackCases = entries.map(buildCallbackCase).join("\n");
	const startCases = entries.map(buildStartCase).join("\n");
	const stopCases = entries.map(buildStopCase).join("\n");
	const runFunctions = entries.map(buildRunFunction).join("\n\n");

	return [
		"namespace timer_detail {",
		callbackVariables,
		toneVariables,
		"",
		toneHelpers,
		"",
		periodFunctions,
		"",
		"inline void setCallback(u8 number, void (*callback)()) {",
		"\tswitch (number) {",
		callbackCases,
		"\t\tdefault: {",
		"\t\t\tbreak;",
		"\t\t}",
		"\t}",
		"}",
		"",
		"inline void applyPeriod(u8 number, u32 periodMicros) {",
		"\tswitch (number) {",
		periodCases,
		"\t\tdefault: {",
		"\t\t\tbreak;",
		"\t\t}",
		"\t}",
		"}",
		"",
		"inline void startCounter(u8 number) {",
		"\tswitch (number) {",
		startCases,
		"\t\tdefault: {",
		"\t\t\tbreak;",
		"\t\t}",
		"\t}",
		"}",
		"",
		"inline void stopCounter(u8 number) {",
		"\tswitch (number) {",
		stopCases,
		"\t\tdefault: {",
		"\t\t\tbreak;",
		"\t\t}",
		"\t}",
		"}",
		"",
		runFunctions,
		"} // namespace timer_detail",
	].join("\n");
};

const buildInterruptHandlers = (entries) => {
	return entries
		.map((entry) => {
			const definition = resolveTimerDefinition(entry);
			return [
				`ISR(${definition.compareVector}) {`,
				`\tcore_timer::timer_detail::run${definition.functionSuffix}Callback();`,
				"}",
			].join("\n");
		})
		.join("\n\n");
};

const buildGetTimer = (entries) => {
	const cases = entries
		.map((entry) => {
			return [
				`\t\tcase Timer::${entry.name}: {`,
				`\t\t\treturn HardwareTimer((u8)Timer::${entry.name});`,
				"\t\t}",
			].join("\n");
		})
		.join("\n");

	return [
		"inline HardwareTimer getTimer(Timer selector) {",
		"\tswitch (selector) {",
		cases,
		"\t\tdefault: {",
		"\t\t\treturn HardwareTimer();",
		"\t\t}",
		"\t}",
		"}",
	].join("\n");
};

const buildEmptyTimerSupport = () => {
	return [
		"typedef enum : u8 {",
		"} Timer;",
		"",
		"namespace timer_detail {",
		"inline void setTonePin(u8 number, u8 pin) {",
		"\t(void)number;",
		"\t(void)pin;",
		"}",
		"",
		"inline void clearTonePin(u8 number) {",
		"\t(void)number;",
		"}",
		"",
		"inline u8 findToneTimer(u8 pin) {",
		"\t(void)pin;",
		"\treturn TONE_NONE;",
		"}",
		"",
		"inline u8 findTonePin(u8 number) {",
		"\t(void)number;",
		"\treturn TONE_NONE;",
		"}",
		"} // namespace timer_detail",
		"",
		"inline HardwareTimer getTimer(Timer selector) {",
		"\treturn HardwareTimer((u8)selector);",
		"}",
	].join("\n");
};

export const buildTimerSupport = (timers) => {
	const entries = listTimerEntries(timers);

	if (entries.length === 0) {
		return buildEmptyTimerSupport();
	}

	return [
		buildTimerEnum(entries),
		"",
		buildTimerDetail(entries),
		"} // namespace core_timer",
		"",
		buildInterruptHandlers(entries),
		"",
		"namespace core_timer {",
		"",
		buildGetTimer(entries),
	].join("\n");
};
