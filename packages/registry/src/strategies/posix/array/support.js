import {
	ARRAY_GROWTH_DIVISOR_MARKER,
	resolveArrayGrowthDivisor,
} from "../../shared/array/common.js";
import { loadTemplates } from "../../shared/templates.js";

const { TEMPLATE, COMMON_HEADER, MEMORY_HEADER } = loadTemplates(import.meta, {
	TEMPLATE: "array.h",
	COMMON_HEADER: "../../shared/array/array.common.h",
	MEMORY_HEADER: "../../shared/memory/ref.h",
});

const DEFAULT_ARRAY_GROWTH_FACTOR = 1.25;
const MEMORY_MARKER = "_e95_replace_memory";

const generateSupport = (platform) => {
	const common = COMMON_HEADER.replace(
		ARRAY_GROWTH_DIVISOR_MARKER,
		`${resolveArrayGrowthDivisor(platform, DEFAULT_ARRAY_GROWTH_FACTOR)}`,
	);
	return TEMPLATE.replace(MEMORY_MARKER, MEMORY_HEADER).replace(
		"_e95_replace_common",
		common,
	);
};

export const definition = {
	name: "posix",
	generateSupport,
};
