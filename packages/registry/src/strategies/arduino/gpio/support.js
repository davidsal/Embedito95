import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE } = loadTemplates(import.meta, { TEMPLATE: "gpio.h" });

import {
	buildPinModeMembers,
	resolveEnumMember,
} from "../../shared/gpio/common.js";

const buildPinsTable = (pins) => {
	const members = [];

	for (const key of Object.keys(pins)) {
		const pinNumber = Number(key);
		const pinValue = !Number.isNaN(pinNumber)
			? pinNumber
			: (pins[key]?.value ?? pins[key]?.name ?? key);
		members.push(`\tPIN_${key} = ${pinValue}`);
	}

	const lines = ["typedef enum : u8 {", members.join(",\n"), "} Pin;"];

	if (pins?.LED_BUILTIN) {
		lines.push("", "static constexpr Pin LED_BUILTIN = PIN_LED_BUILTIN;");
	}

	return lines.join("\n");
};

const renderInclude = () => {
	return renderArtifactInclude("gpio");
};

const buildPinUndefs = (pins) => {
	const lines = [];

	for (const key of Object.keys(pins)) {
		if (/^A\d+$/.test(key)) {
			lines.push(`#undef PIN_${key}`);
		}
	}

	return lines.join("\n");
};

const generateSupport = (platform) => {
	const pins = platform?.pins ?? {};
	const pinsTable = buildPinsTable(pins);
	const pinModeMembers = buildPinModeMembers(platform);
	const pinUndefs = buildPinUndefs(pins);

	return TEMPLATE.replace("_e95_replace_pinsTable", pinsTable)
		.replace("_e95_replace_pinModeMembers", pinModeMembers)
		.replace("_e95_replace_pinUndefs", pinUndefs);
};

export const definition = {
	name: "arduino",
	dependencies: ["type"],
	resolveEnumMember,
	renderInclude,
	generateSupport,
};
