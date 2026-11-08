import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE } = loadTemplates(import.meta, { TEMPLATE: "time.h" });

const renderInclude = () => {
	return renderArtifactInclude("time");
};

const generateSupport = () => {
	return TEMPLATE;
};

export const definition = {
	name: "arduino",
	renderInclude,
	generateSupport,
};
