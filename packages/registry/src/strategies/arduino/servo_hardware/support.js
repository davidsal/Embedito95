import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, SOURCE_TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "servo_hardware.h",
	SOURCE_TEMPLATE: "servo_hardware.cpp",
});

const renderInclude = () => {
	return renderArtifactInclude("servo_hardware");
};

const generateSupport = () => {
	return TEMPLATE;
};

const generateSource = () => {
	return SOURCE_TEMPLATE;
};

export const definition = {
	name: "arduino",
	dependencies: ["type", "gpio"],
	renderInclude,
	generateSupport,
	generateSource,
};
