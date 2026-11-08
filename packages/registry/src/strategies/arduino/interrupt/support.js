import { resolveEnumMemberFromPrefixes } from "../../shared/enum-member-resolution.js";
import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "interrupt.h",
});

const ENUM_PREFIX_BY_MODULE = {
	InterruptMode: "core_interrupt::InterruptMode::INTERRUPT_",
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

export const definition = {
	name: "arduino",
	dependencies: ["type", "gpio"],
	resolveEnumMember,
	renderInclude,
	generateSupport,
};
