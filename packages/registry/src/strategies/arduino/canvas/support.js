import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE } = loadTemplates(import.meta, { TEMPLATE: "canvas.h" });

const renderInclude = () => {
	return renderArtifactInclude("canvas");
};

const generateSupport = () => {
	return TEMPLATE;
};

export const definition = {
	name: "arduino",
	dependencies: ["type"],
	renderInclude,
	generateSupport,
};
