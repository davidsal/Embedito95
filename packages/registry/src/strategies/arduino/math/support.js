import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const COMMON_MARKER = "_e95_replace_common";

const { TEMPLATE, SOURCE_TEMPLATE, COMMON_HEADER, COMMON_SOURCE } =
	loadTemplates(import.meta, {
		TEMPLATE: "math.h",
		SOURCE_TEMPLATE: "math.cpp",
		COMMON_HEADER: "../../shared/math/math_common.h",
		COMMON_SOURCE: "../../shared/math/math_common.cpp",
	});

const renderInclude = () => {
	return renderArtifactInclude("math");
};

const generateSupport = () => {
	return TEMPLATE.replace(COMMON_MARKER, COMMON_HEADER);
};

const generateSource = () => {
	return SOURCE_TEMPLATE.replace(COMMON_MARKER, COMMON_SOURCE);
};

export const definition = {
	name: "arduino",
	dependencies: ["type"],
	renderInclude,
	generateSupport,
	generateSource,
};
