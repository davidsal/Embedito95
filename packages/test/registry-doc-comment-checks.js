import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { UTF8 } from "embedito95-core";
import {
	DOC_COMMENT_SCAN_EXTENSIONS,
	REGISTRY_SOURCE_DIRECTORY,
} from "./constants.js";
import { expectEqual } from "./reporting.js";

// Regression guard for reviewHelper rule 14: e95 API doc-comments describe the
// symbol's own behavior, never framing it as an Arduino mirror/equivalent. The
// internal "mirror" notes between our own headers never mention Arduino and the
// platform strategies only include <Arduino.h>, so neither matches.
const ARDUINO_REFERENCE_PATTERN = /arduino/i;
const MIRROR_REFERENCE_PATTERN = /mirror|equivalen/i;

const listRegistrySourceFiles = (directory) => {
	const sourceFiles = [];

	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const entryPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			sourceFiles.push(...listRegistrySourceFiles(entryPath));
			continue;
		}
		if (DOC_COMMENT_SCAN_EXTENSIONS.includes(extname(entry.name))) {
			sourceFiles.push(entryPath);
		}
	}

	return sourceFiles;
};

const framesE95AsArduinoMirror = (line) => {
	return (
		ARDUINO_REFERENCE_PATTERN.test(line) && MIRROR_REFERENCE_PATTERN.test(line)
	);
};

const collectArduinoMirrorReferences = () => {
	const references = [];

	for (const filePath of listRegistrySourceFiles(REGISTRY_SOURCE_DIRECTORY)) {
		const fileLines = readFileSync(filePath, UTF8).split("\n");
		fileLines.forEach((line, lineIndex) => {
			if (!framesE95AsArduinoMirror(line)) {
				return;
			}
			references.push(
				`${relative(REGISTRY_SOURCE_DIRECTORY, filePath)}:${lineIndex + 1}`,
			);
		});
	}

	return references;
};

export const runRegistryDocCommentChecks = () => {
	return [
		expectEqual(
			"registry API doc-comments never frame e95 as an Arduino mirror",
			collectArduinoMirrorReferences().join(", "),
			"",
		),
	];
};
