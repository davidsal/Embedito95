import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RULES_MARKER = "// e95.postinstall.interruptRules";
const INTERRUPT_PATH = join("core", "interrupt", "main.e95");
const PIN_PARAMETER = "pin";
const MODE_PARAMETER = "mode";
const PIN_FUNCTIONS = [
	"attachPinInterrupt",
	"detachPinInterrupt",
	"getInterruptNumber",
];
const UTF8 = "utf-8";

const collectUniqueValues = (values) => {
	const unique = new Set();
	const ordered = [];

	for (const value of values) {
		const key = String(value);
		if (unique.has(key)) {
			continue;
		}
		unique.add(key);
		ordered.push(key);
	}

	return ordered;
};

const collectPins = (interrupts) => {
	return collectUniqueValues(
		(interrupts?.available ?? []).map((entry) => entry.pin),
	);
};

const collectTriggers = (interrupts) => {
	const triggers = [];
	for (const entry of interrupts?.available ?? []) {
		for (const trigger of entry.triggers ?? []) {
			triggers.push(trigger);
		}
	}
	return collectUniqueValues(triggers);
};

const renderAllowedValues = (functionName, paramName, values) => {
	if (values.length === 0) {
		return null;
	}
	return `// e95.allowedValues ${functionName} ${paramName} ${values.join(",")}`;
};

const renderRules = (interrupts) => {
	const pins = collectPins(interrupts);
	const triggers = collectTriggers(interrupts);
	const lines = [];

	for (const functionName of PIN_FUNCTIONS) {
		lines.push(renderAllowedValues(functionName, PIN_PARAMETER, pins));
	}
	lines.push(
		renderAllowedValues("attachPinInterrupt", MODE_PARAMETER, triggers),
	);

	return lines
		.filter((line) => {
			return line !== null;
		})
		.join("\n");
};

export const run = (projectDir, platform) => {
	const interruptPath = join(projectDir, INTERRUPT_PATH);
	const content = readFileSync(interruptPath, UTF8);
	const rules = renderRules(platform?.interrupts);
	writeFileSync(interruptPath, content.replaceAll(RULES_MARKER, rules), UTF8);
};
