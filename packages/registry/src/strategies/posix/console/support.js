import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, SOURCE_TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "console.h",
	SOURCE_TEMPLATE: "console.cpp",
});

const STRATEGY_NAME = "posix";
const CONSOLE_ARTIFACT_NAME = "console";
const CONSOLE_DEPENDENCIES = ["type", "string"];

const renderInclude = () => {
	return renderArtifactInclude(CONSOLE_ARTIFACT_NAME);
};

const generateSupport = () => {
	return TEMPLATE;
};

const generateSource = () => {
	return SOURCE_TEMPLATE;
};

export const definition = {
	name: STRATEGY_NAME,
	dependencies: CONSOLE_DEPENDENCIES,
	renderInclude,
	generateSupport,
	generateSource,
};
