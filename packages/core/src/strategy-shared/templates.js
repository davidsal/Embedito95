import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const loadTemplates = (importMeta, files) => {
	const directory = dirname(fileURLToPath(importMeta.url));
	const templates = {};

	for (const [name, fileName] of Object.entries(files)) {
		templates[name] = readFileSync(join(directory, fileName), "utf-8");
	}

	return templates;
};
