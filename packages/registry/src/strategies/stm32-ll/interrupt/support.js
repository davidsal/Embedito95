import { resolveEnumMemberFromPrefixes } from "../../shared/enum-member-resolution.js";
import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, SOURCE_TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "interrupt.h",
	SOURCE_TEMPLATE: "interrupt.cpp",
});

const ENUM_PREFIX_BY_MODULE = {
	InterruptMode: "core_interrupt::InterruptMode::INTERRUPT_",
};

const listInterruptEntries = (interrupts) => {
	return (interrupts?.available ?? []).filter((entry) => {
		return (
			entry?.pin !== undefined &&
			entry?.pin !== null &&
			entry?.line !== undefined &&
			entry?.line !== null
		);
	});
};

const buildPinInterrupt = (entry, port) => {
	return `\t{ (u8)core_gpio::Pin::PIN_${entry.pin}, ${entry.line}, LL_GPIO_AF_EXTI_PORT${port} },`;
};

const buildPinInterrupts = (platform, entries) => {
	return entries
		.map((entry) => {
			return buildPinInterrupt(entry, platform.pins[entry.pin].port);
		})
		.join("\n");
};

const renderInclude = () => {
	return renderArtifactInclude("interrupt");
};

const resolveEnumMember = (moduleName, memberName) => {
	return resolveEnumMemberFromPrefixes(
		ENUM_PREFIX_BY_MODULE,
		moduleName,
		memberName,
	);
};

const generateSupport = () => {
	return TEMPLATE;
};

const generateSource = (platform) => {
	const entries = listInterruptEntries(platform?.interrupts);

	return SOURCE_TEMPLATE.replaceAll(
		"_e95_replace_interruptPinCount",
		String(entries.length),
	).replace(
		"_e95_replace_interruptPins",
		buildPinInterrupts(platform, entries),
	);
};

export const definition = {
	name: "stm32-ll",
	dependencies: ["type", "gpio"],
	resolveEnumMember,
	renderInclude,
	generateSupport,
	generateSource,
};
