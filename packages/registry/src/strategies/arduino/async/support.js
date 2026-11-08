import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE } = loadTemplates(import.meta, { TEMPLATE: "async.h" });

const renderInclude = () => {
	return renderArtifactInclude("async");
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
