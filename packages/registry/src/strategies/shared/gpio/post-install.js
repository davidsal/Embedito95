import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PIN_MODE, RESTRICTION } from "../../../platforms/enums.js";
import { resolveIntegerType } from "../int-type-resolution.js";
import { BASE_PIN_MODES } from "./common.js";

const PIN_MARKER = "// e95.postinstall.pinEnum";
const PIN_MODE_MARKER = "// e95.postinstall.pinModeExtras";
const PIN_MODE_REEXPORT_MARKER = "// e95.postinstall.pinModeReexports";

const resolveAnalogType = (maxValue) => {
	if (maxValue === undefined || maxValue === null) {
		return "i8";
	}
	return resolveIntegerType(0, maxValue, true);
};

const RESTRICTION_MESSAGES = {
	[RESTRICTION.ADC_ONLY]: "ADC-only pin, cannot be used as digital",
	[RESTRICTION.INPUT_ONLY]: "Input-only pin, cannot be used as output",
	[RESTRICTION.DAC_ONLY]: "DAC-only pin",
	[RESTRICTION.INTERNAL_FLASH]:
		"Connected to internal flash, not available as GPIO",
	[RESTRICTION.DEBUG]: "Reserved for debug interface (SWD/JTAG)",
	[RESTRICTION.SLOW_ONLY]: "Open-drain pin, limited switching speed",
	[RESTRICTION.OSC_ONLY]: "Connected to oscillator circuit",
};

const MODE_MESSAGES = {
	[PIN_MODE.INPUT_PULLUP]: "Set pin as input with internal pull-up",
	[PIN_MODE.INPUT_PULLDOWN]: "Set pin as input with internal pull-down",
};

const collectUniqueKeys = (source, seen, target) => {
	for (const key of Object.keys(source)) {
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		target.push(key);
	}
};

const fillEnumMembers = (lines, marker, members, sort = true) => {
	const markerIndex = lines.findIndex((line) => line.trim() === marker);
	if (markerIndex === -1) {
		return null;
	}

	const orderedMembers = sort
		? [...members].sort((first, second) => first.localeCompare(second))
		: [...members];

	const indent = lines[markerIndex].match(/^\s*/)[0];
	const memberLines = orderedMembers
		.map((name) => `${indent}${name}`)
		.join(",\n");
	lines.splice(markerIndex, 1, memberLines);
	return orderedMembers;
};

const resolveAnalogMaxValue = (source) => {
	const entryMaxValues = (source.available ?? []).map((entry) => {
		return entry.maxValue ?? 0;
	});
	const parentMaxValue = source.maxValue ?? 0;
	return Math.max(parentMaxValue, ...entryMaxValues);
};

export const run = (projectDir, platform) => {
	const { pins, pinModes, adc, pwm } = platform ?? {};
	if (!pins) {
		return;
	}

	const gpioPath = join(projectDir, "core", "gpio", "main.e95");
	let content = readFileSync(gpioPath, "utf-8");

	if (pwm) {
		const pwmMaxValue = resolveAnalogMaxValue(pwm);
		content = content.replaceAll(
			"e95.postinstall.pwmType",
			resolveAnalogType(pwmMaxValue),
		);
		content = content.replaceAll("e95.postinstall.pwmMax", String(pwmMaxValue));
	}

	if (adc) {
		const adcMaxValue = resolveAnalogMaxValue(adc);
		content = content.replaceAll(
			"e95.postinstall.adcType",
			resolveAnalogType(adcMaxValue),
		);
		content = content.replaceAll("e95.postinstall.adcMax", String(adcMaxValue));
	}

	const lines = content.split("\n");

	if (pinModes?.available?.length > 0) {
		const modeMarkerIndex = lines.findIndex(
			(line) => line.trim() === PIN_MODE_MARKER,
		);

		if (modeMarkerIndex !== -1) {
			const extraModes = pinModes.available.filter((mode) => {
				return !BASE_PIN_MODES.includes(mode);
			});

			if (extraModes.length > 0) {
				const previousLineIndex = modeMarkerIndex - 1;
				if (
					previousLineIndex >= 0 &&
					!lines[previousLineIndex].trimEnd().endsWith(",")
				) {
					lines[previousLineIndex] = `${lines[previousLineIndex].trimEnd()},`;
				}
			}

			fillEnumMembers(lines, PIN_MODE_MARKER, extraModes, false);

			let modeDocCloseIndex = -1;
			for (let index = modeMarkerIndex - 1; index >= 0; index--) {
				if (lines[index].trim() === "*/") {
					modeDocCloseIndex = index;
					break;
				}
			}

			if (modeDocCloseIndex !== -1) {
				const modeDocLines = [];

				for (const mode of extraModes) {
					if (MODE_MESSAGES[mode]) {
						modeDocLines.push(` * @member ${mode} ${MODE_MESSAGES[mode]}`);
					}
				}

				if (modeDocLines.length > 0) {
					lines.splice(modeDocCloseIndex, 0, ...modeDocLines);
				}
			}

			const reexportMarkerIndex = lines.findIndex(
				(line) => line.trim() === PIN_MODE_REEXPORT_MARKER,
			);
			if (reexportMarkerIndex !== -1) {
				const reexportLines = extraModes.map((mode) => {
					return `export const ${mode} = PinMode.${mode}`;
				});
				lines.splice(reexportMarkerIndex, 1, ...reexportLines);
			}
		}
	}

	const pinMarkerIndex = lines.findIndex((line) => line.trim() === PIN_MARKER);

	if (pinMarkerIndex !== -1) {
		const seen = new Set();
		const members = [];

		collectUniqueKeys(pins, seen, members);

		fillEnumMembers(lines, PIN_MARKER, members);

		const docCloseIndex = pinMarkerIndex - 2;
		if (docCloseIndex >= 0 && lines[docCloseIndex].trim() === "*/") {
			const restrictionLines = [];

			for (const [key, pin] of Object.entries(pins)) {
				if (pin.restriction && RESTRICTION_MESSAGES[pin.restriction]) {
					restrictionLines.push(
						` * @member ${key} ${RESTRICTION_MESSAGES[pin.restriction]}`,
					);
				}
			}

			if (restrictionLines.length > 0) {
				lines.splice(docCloseIndex, 0, ...restrictionLines);
			}
		}
	}

	writeFileSync(gpioPath, lines.join("\n"), "utf-8");
};
