import { loadTemplates } from "../templates.js";

const { TEMPLATE, SOURCE_TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "int128.h",
	SOURCE_TEMPLATE: "int128.cpp",
});

export const generateSupport = (coreInclude) => {
	return TEMPLATE.replace("_e95_replace_coreInclude", coreInclude);
};

export const generateSource = () => {
	return SOURCE_TEMPLATE;
};
