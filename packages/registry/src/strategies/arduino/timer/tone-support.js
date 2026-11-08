// Emits the tone helpers and compare-match dispatch for each counter. A tone
// owns the compare match while its pin is set; otherwise the registered
// callback runs, so both share the same ISR.

import { resolveTimerDefinition } from "./timer-definitions.js";

const buildToneSetCase = (entry) => {
	const definition = resolveTimerDefinition(entry);
	return [
		`\t\tcase Timer::${entry.name}: {`,
		`\t\t\t${definition.toneVariable} = pin;`,
		"\t\t\tbreak;",
		"\t\t}",
	].join("\n");
};

const buildToneClearCase = (entry) => {
	const definition = resolveTimerDefinition(entry);
	return [
		`\t\tcase Timer::${entry.name}: {`,
		`\t\t\t${definition.toneVariable} = TONE_NONE;`,
		"\t\t\tbreak;",
		"\t\t}",
	].join("\n");
};

const buildToneFindCheck = (entry) => {
	const definition = resolveTimerDefinition(entry);
	return [
		`\tif (${definition.toneVariable} == pin) {`,
		`\t\treturn (u8)Timer::${entry.name};`,
		"\t}",
	].join("\n");
};

const buildTonePinCase = (entry) => {
	const definition = resolveTimerDefinition(entry);
	return [
		`\t\tcase Timer::${entry.name}: {`,
		`\t\t\treturn ${definition.toneVariable};`,
		"\t\t}",
	].join("\n");
};

export const buildToneHelpers = (entries) => {
	const setCases = entries.map(buildToneSetCase).join("\n");
	const clearCases = entries.map(buildToneClearCase).join("\n");
	const findChecks = entries.map(buildToneFindCheck).join("\n");
	const pinCases = entries.map(buildTonePinCase).join("\n");

	return [
		"inline void setTonePin(u8 number, u8 pin) {",
		"\tswitch (number) {",
		setCases,
		"\t\tdefault: {",
		"\t\t\tbreak;",
		"\t\t}",
		"\t}",
		"}",
		"",
		"inline void clearTonePin(u8 number) {",
		"\tswitch (number) {",
		clearCases,
		"\t\tdefault: {",
		"\t\t\tbreak;",
		"\t\t}",
		"\t}",
		"}",
		"",
		"inline u8 findToneTimer(u8 pin) {",
		findChecks,
		"\treturn TONE_NONE;",
		"}",
		"",
		"inline u8 findTonePin(u8 number) {",
		"\tswitch (number) {",
		pinCases,
		"\t\tdefault: {",
		"\t\t\treturn TONE_NONE;",
		"\t\t}",
		"\t}",
		"}",
	].join("\n");
};

export const buildRunFunction = (entry) => {
	const definition = resolveTimerDefinition(entry);
	return [
		`inline void run${definition.functionSuffix}Callback() {`,
		`\tif (${definition.toneVariable} != TONE_NONE) {`,
		`\t\ttoggleTonePin(${definition.toneVariable});`,
		`\t} else if (${definition.callbackVariable} != nullptr) {`,
		`\t\t${definition.callbackVariable}();`,
		"\t}",
		"}",
	].join("\n");
};
