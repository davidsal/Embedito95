import { PIN_MODE } from "../../../platforms/enums.js";
import { resolveEnumMemberFromPrefixes } from "../enum-member-resolution.js";

export const BASE_PIN_MODES = [PIN_MODE.INPUT, PIN_MODE.OUTPUT];

const GPIO_ENUM_PREFIX = "core_gpio::";
const PIN_ENUM_PREFIX = `${GPIO_ENUM_PREFIX}Pin::PIN_`;

// Each exported gpio enum maps to a C++ qualified symbol defined by the gpio
// header: the Pin enum prefixes its members with PIN_, while PinMode,
// DigitalLevel, BitOrder and VoltageReference keep their plain names inside
// core_gpio.
const ENUM_PREFIX_BY_MODULE = {
	Pin: PIN_ENUM_PREFIX,
	PinMode: GPIO_ENUM_PREFIX,
	DigitalLevel: GPIO_ENUM_PREFIX,
	BitOrder: GPIO_ENUM_PREFIX,
	VoltageReference: GPIO_ENUM_PREFIX,
};

export const buildPinModeMembers = (platform) => {
	const available = new Set(platform?.pinModes?.available ?? []);
	const order = platform?.pinModes?.available ?? [];
	const pushed = new Set();
	const lines = [];

	for (const mode of [...BASE_PIN_MODES, ...order]) {
		if (!available.has(mode) || pushed.has(mode)) {
			continue;
		}
		pushed.add(mode);
		lines.push(`\t${mode} = ${lines.length},`);
	}

	return lines.join("\n");
};

export const resolvePinMember = (memberName) => {
	return `${PIN_ENUM_PREFIX}${memberName}`;
};

export const resolveEnumMember = (moduleName, memberName) => {
	return resolveEnumMemberFromPrefixes(
		ENUM_PREFIX_BY_MODULE,
		moduleName,
		memberName,
	);
};
