import { generateSource, generateSupport } from "../../shared/int128/common.js";

const CORE_INCLUDE = '#include "core_string.h"';

const generateSupportWithCore = () => {
	return generateSupport(CORE_INCLUDE);
};

export const definition = {
	name: "stm32-ll",
	generateSupport: generateSupportWithCore,
	generateSource,
};
