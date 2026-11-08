import { DATA_TYPES } from "embedito95-core";

import { DATA_TYPES as CANONICAL_DATA_TYPES } from "../core/src/constants.js";
import { expectEqual } from "./reporting.js";

const checkDataTypesUsesCanonicalName = () => {
	return [
		expectEqual(
			"core barrel exports DATA_TYPES identical to its canonical definition",
			DATA_TYPES === CANONICAL_DATA_TYPES,
			true,
		),
	];
};

export const runCoreSurfaceChecks = () => {
	return checkDataTypesUsesCanonicalName();
};
