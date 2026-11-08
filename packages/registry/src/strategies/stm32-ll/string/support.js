import { resolveArrayGrowthDivisor } from "../../shared/array/common.js";
import {
	NUMBER_FORMAT_MARKER,
	STRING_GROWTH_DIVISOR_MARKER,
} from "../../shared/string/common.js";
import { loadTemplates } from "../../shared/templates.js";

const {
	TEMPLATE,
	SOURCE_TEMPLATE,
	COMMON_HEADER,
	COMMON_SOURCE,
	NUMBER_FORMAT,
} = loadTemplates(import.meta, {
	TEMPLATE: "string.h",
	SOURCE_TEMPLATE: "string.cpp",
	COMMON_HEADER: "../../shared/string/string_common.h",
	COMMON_SOURCE: "../../shared/string/string_common.cpp",
	NUMBER_FORMAT: "../../shared/string/number_format.inc",
});

const DEFAULT_STRING_GROWTH_FACTOR = 1.25;

const generateSupport = (platform) => {
	const header = COMMON_HEADER.replace(
		STRING_GROWTH_DIVISOR_MARKER,
		`${resolveArrayGrowthDivisor(platform, DEFAULT_STRING_GROWTH_FACTOR)}`,
	);
	return TEMPLATE.replace("_e95_replace_common", header);
};

const generateSource = () => {
	const common = COMMON_SOURCE.replace(NUMBER_FORMAT_MARKER, NUMBER_FORMAT);
	return SOURCE_TEMPLATE.replace("_e95_replace_common", common);
};

export const definition = {
	name: "stm32-ll",
	generateSupport,
	generateSource,
};
