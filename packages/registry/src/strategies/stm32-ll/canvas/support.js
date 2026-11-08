import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, SOURCE_TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "canvas.h",
	SOURCE_TEMPLATE: "canvas.cpp",
});

const renderInclude = () => {
	return renderArtifactInclude("canvas");
};

const generateSupport = () => {
	return TEMPLATE;
};

const generateSource = () => {
	return SOURCE_TEMPLATE;
};

export const definition = {
	name: "stm32-ll",
	dependencies: ["type"],
	renderInclude,
	generateSupport,
	generateSource,
};
