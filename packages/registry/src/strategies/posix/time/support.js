import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, SOURCE_TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "time.h",
	SOURCE_TEMPLATE: "time.cpp",
});

const STRATEGY_NAME = "posix";
const TIME_ARTIFACT_NAME = "time";
const TIME_DEPENDENCIES = ["type"];

const renderInclude = () => {
	return renderArtifactInclude(TIME_ARTIFACT_NAME);
};

const generateSupport = () => {
	return TEMPLATE;
};

const generateSource = () => {
	return SOURCE_TEMPLATE;
};

export const definition = {
	name: STRATEGY_NAME,
	dependencies: TIME_DEPENDENCIES,
	renderInclude,
	generateSupport,
	generateSource,
};
