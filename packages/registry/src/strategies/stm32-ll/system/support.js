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

const HZ_TO_MHZ = 1000000;

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
	const crystal = platform?.specs?.crystal ?? profile.defaults.crystal;
	const frequency = platform?.specs?.frequency ?? profile.defaults.frequency;
	const pllMultiplier = frequency / crystal;

	let result = SOURCE_TEMPLATE;
	result = result.replaceAll("_e95_replace_crystal", crystal / HZ_TO_MHZ);
	result = result.replaceAll("_e95_replace_frequency", frequency);
	result = result.replaceAll("_e95_replace_pllMultiplier", pllMultiplier);
	result = result.replaceAll(
		FREE_HEAP_TYPE_MARKER,
		resolveFreeHeapType(platform, profile.defaults.sram),
	);
	return result;
};

export const definition = {
	name: "stm32-ll",
	initializeName: "initializeSystemClock",
	renderInclude,
	generateSupport,
	generateSource,
};
