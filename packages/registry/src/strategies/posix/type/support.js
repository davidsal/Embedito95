import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "type.h",
});

const STRATEGY_NAME = "posix";
const TYPE_ARTIFACT_NAME = "type";

const renderInclude = () => {
	return renderArtifactInclude(TYPE_ARTIFACT_NAME);
};

const generateSupport = () => {
	return TEMPLATE;
};

export const definition = {
	name: STRATEGY_NAME,
	renderInclude,
	generateSupport,
};
