import { resolveIntegerType } from "../int-type-resolution.js";

export const FREE_HEAP_TYPE_MARKER = "_e95_replace_freeHeapType";

export const resolveFreeHeapType = (platform, defaultSram) => {
	const sram = platform?.specs?.sram ?? defaultSram;
	return resolveIntegerType(0, sram);
};
