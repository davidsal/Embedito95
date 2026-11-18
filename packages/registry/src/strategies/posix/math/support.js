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

const STRATEGY_NAME = "posix";
const MATH_ARTIFACT_NAME = "math";
const MATH_DEPENDENCIES = ["type"];

const renderInclude = () => {
	return renderArtifactInclude(MATH_ARTIFACT_NAME);
};

const generateSupport = () => {
	return TEMPLATE.replace(COMMON_MARKER, COMMON_HEADER);
};

const generateSource = () => {
	return SOURCE_TEMPLATE.replace(COMMON_MARKER, COMMON_SOURCE);
};

export const definition = {
	name: STRATEGY_NAME,
	dependencies: MATH_DEPENDENCIES,
	renderInclude,
	generateSupport,
	generateSource,
};
