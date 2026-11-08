import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { ENTRY_OPTION, MAIN_FILE, UTF8 } from "embedito95-core";
import { red, writeErrorLine } from "../../console.js";

export const parseEntryFile = () => {
	const entryIndex = process.argv.indexOf(ENTRY_OPTION);
	if (entryIndex === -1) {
		return MAIN_FILE;
	}
	return process.argv[entryIndex + 1];
};

export const readEntrySource = (entryFile, workingDirectory) => {
	const mainPath = isAbsolute(entryFile)
		? entryFile
		: join(workingDirectory, entryFile);
	const source = existsSync(mainPath) ? readFileSync(mainPath, UTF8) : "";

	if (!source) {
		writeErrorLine(`${red("✖")} ${entryFile} not found or empty`);
		process.exit(1);
	}

	return { source, sourceLines: source.split("\n"), entryPath: mainPath };
};
