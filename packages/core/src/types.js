import { DATA_TYPES } from "./constants.js";

export const resolvePlatformTypes = (platform) => {
	if (platform?.types?.length) {
		return new Set(platform.types);
	}

	return DATA_TYPES;
};
