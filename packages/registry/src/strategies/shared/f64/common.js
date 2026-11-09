import { loadTemplates } from "../templates.js";

const { TEMPLATE, SOURCE_TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "f64.h",
	SOURCE_TEMPLATE: "f64.cpp",
});

export const generateSupport = (enabled) => {
	return enabled ? TEMPLATE : "";
};

export const generateSource = (enabled) => {
	return enabled ? SOURCE_TEMPLATE : "";
};
