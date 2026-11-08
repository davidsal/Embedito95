import { generateSource, generateSupport } from "../../shared/int128/common.js";

const CORE_INCLUDES = '#include "core_string.h"';

const generateSupportWithCore = () => {
	return generateSupport(CORE_INCLUDES);
};

export const definition = {
	name: "arduino",
	generateSupport: generateSupportWithCore,
	generateSource,
};
