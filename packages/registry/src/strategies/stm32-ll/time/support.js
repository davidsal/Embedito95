import { loadTemplates } from "../../shared/templates.js";
import { profile, renderArtifactInclude } from "../profile.js";

const { TEMPLATE, SOURCE_TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "time.h",
	SOURCE_TEMPLATE: "time.cpp",
});

const renderInclude = () => {
	return renderArtifactInclude("time");
};

const generateSupport = () => {
	return TEMPLATE;
};

const generateSource = (platform) => {
	const frequency = platform?.specs?.frequency ?? profile.defaults.frequency;
	return SOURCE_TEMPLATE.replaceAll("_e95_replace_frequency", frequency);
};

export const definition = {
	name: "stm32-ll",
	dependencies: ["type"],
	renderInclude,
	generateSupport,
	generateSource,
};
