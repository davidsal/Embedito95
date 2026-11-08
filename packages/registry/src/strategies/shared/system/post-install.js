import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveFreeHeapType } from "./common.js";

const FREE_HEAP_TYPE_MARKER = "e95.postinstall.freeHeapType";
const DEFAULT_SRAM = 2048;

export const run = (projectDir, platform) => {
	const libraryPath = join(projectDir, "core", "system", "main.e95");
	const content = readFileSync(libraryPath, "utf-8");

	if (!content.includes(FREE_HEAP_TYPE_MARKER)) {
		return;
	}

	const freeHeapType = resolveFreeHeapType(platform, DEFAULT_SRAM);
	writeFileSync(
		libraryPath,
		content.replaceAll(FREE_HEAP_TYPE_MARKER, freeHeapType),
		"utf-8",
	);
};
