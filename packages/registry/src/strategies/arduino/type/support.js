import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "type.h",
});

const renderInclude = () => {
	return renderArtifactInclude("type");
};

const generateSupport = () => {
	return TEMPLATE;
};

export const definition = {
	name: "arduino",
	renderInclude,
	generateSupport,
};
