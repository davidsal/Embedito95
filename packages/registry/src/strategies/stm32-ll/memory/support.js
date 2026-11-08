import { loadTemplates } from "../../shared/templates.js";

const { TEMPLATE, COMMON_HEADER } = loadTemplates(import.meta, {
	TEMPLATE: "memory.h",
	COMMON_HEADER: "../../shared/memory/ref.h",
});

const generateSupport = () => {
	return TEMPLATE.replace("_e95_replace_common", COMMON_HEADER);
};

export const definition = {
	name: "stm32-ll",
	generateSupport,
};
