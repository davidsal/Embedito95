import { FLOAT64_MODE } from "../../../platforms/enums.js";
import { generateSource, generateSupport } from "../../shared/f64/common.js";

const isSoftwareFloat64 = (platform) => {
	return platform?.float64 === FLOAT64_MODE.SOFTWARE;
};

const generateSupportForPlatform = (platform) => {
	return generateSupport(isSoftwareFloat64(platform));
};

const generateSourceForPlatform = (platform) => {
	return generateSource(isSoftwareFloat64(platform));
};

export const definition = {
	name: "arduino",
	generateSupport: generateSupportForPlatform,
	generateSource: generateSourceForPlatform,
};
