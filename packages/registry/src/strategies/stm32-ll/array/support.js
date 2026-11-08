import {
	ARRAY_GROWTH_DIVISOR_MARKER,
	resolveArrayGrowthDivisor,
} from "../../shared/array/common.js";
import { loadTemplates } from "../../shared/templates.js";

const { TEMPLATE, COMMON_HEADER } = loadTemplates(import.meta, {
	TEMPLATE: "array.h",
	COMMON_HEADER: "../../shared/array/array.common.h",
});

const DEFAULT_ARRAY_GROWTH_FACTOR = 1.5;

const generateSupport = (platform) => {
	const common = COMMON_HEADER.replace(
		ARRAY_GROWTH_DIVISOR_MARKER,
		`${resolveArrayGrowthDivisor(platform, DEFAULT_ARRAY_GROWTH_FACTOR)}`,
	);
	return TEMPLATE.replace("_e95_replace_common", common);
};

export const definition = {
	name: "stm32-ll",
	generateSupport,
};
