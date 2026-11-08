import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, UTF8 } from "embedito95-core";
import { red, writeErrorLine } from "../../console.js";

export const loadProjectConfiguration = (
	workingDirectory,
	missingMessage = "config.json not found",
) => {
	const configurationPath = join(workingDirectory, CONFIG_FILE);
	if (!existsSync(configurationPath)) {
		writeErrorLine(`${red("✖")} ${missingMessage}`);
		process.exit(1);
	}
	return JSON.parse(readFileSync(configurationPath, UTF8));
};
