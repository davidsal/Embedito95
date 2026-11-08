import { loadTemplates } from "../../shared/templates.js";

const { TEMPLATE, COMMON_HEADER } = loadTemplates(import.meta, {
	TEMPLATE: "object.h",
	COMMON_HEADER: "../../shared/object/object.common.h",
});

const generateSupport = () => {
	return TEMPLATE.replace("_e95_replace_common", COMMON_HEADER);
};

export const definition = {
	name: "arduino",
	generateSupport,
};
