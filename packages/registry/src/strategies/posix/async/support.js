import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE } = loadTemplates(import.meta, { TEMPLATE: "async.h" });

const STRATEGY_NAME = "posix";
const ASYNC_ARTIFACT_NAME = "async";
const ASYNC_DEPENDENCIES = ["time"];

const renderInclude = () => {
	return renderArtifactInclude(ASYNC_ARTIFACT_NAME);
};

const generateSupport = () => {
	return TEMPLATE;
};

export const definition = {
	name: STRATEGY_NAME,
	dependencies: ASYNC_DEPENDENCIES,
	renderInclude,
	generateSupport,
};
