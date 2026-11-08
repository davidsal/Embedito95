import { loadTemplates } from "../../shared/templates.js";
import { profile, renderArtifactInclude } from "../profile.js";

const { TEMPLATE, SOURCE_TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "system.h",
	SOURCE_TEMPLATE: "system.cpp",
});

import {
	FREE_HEAP_TYPE_MARKER,
	resolveFreeHeapType,
} from "../../shared/system/common.js";

const renderInclude = () => {
	return renderArtifactInclude("system");
};

const generateSupport = (platform) => {
	return TEMPLATE.replaceAll(
		FREE_HEAP_TYPE_MARKER,
		resolveFreeHeapType(platform, profile.defaults.sram),
	);
};

const generateSource = (platform) => {
	return SOURCE_TEMPLATE.replaceAll(
		FREE_HEAP_TYPE_MARKER,
		resolveFreeHeapType(platform, profile.defaults.sram),
	);
};

export const definition = {
	name: "arduino",
	renderInclude,
	generateSupport,
	generateSource,
};
