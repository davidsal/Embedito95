import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "eeprom_hardware.h",
});

const renderInclude = () => {
	return renderArtifactInclude("eeprom_hardware");
};

const generateSupport = () => {
	return TEMPLATE;
};

export const definition = {
	name: "stm32-ll",
	dependencies: ["type"],
	renderInclude,
	generateSupport,
};
