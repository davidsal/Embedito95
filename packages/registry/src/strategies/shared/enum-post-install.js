import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const isEntrySelected = (entry, isEntrySelectable) => {
	if (!isEntrySelectable) {
		return true;
	}

	return isEntrySelectable(entry);
};

const collectSelectedEntries = (available, isEntrySelectable) => {
	return (available ?? []).filter((entry) => {
		return (
			entry?.number !== undefined &&
			entry?.number !== null &&
			isEntrySelected(entry, isEntrySelectable)
		);
	});
};

const collectMemberNumbers = (entries) => {
	const numbers = new Set();

	for (const entry of entries) {
		numbers.add(entry.number);
	}

	return [...numbers].sort((first, second) => first - second);
};

const buildMemberLines = (numbers, indent) => {
	return numbers.map((number) => `${indent}${number}`).join(",\n");
};

const buildMemberDocs = (entries) => {
	const lines = [];

	for (const entry of entries) {
		if (entry.name) {
			lines.push(` * @member ${entry.number} ${entry.name}`);
		}
	}

	return lines;
};

export const runEnumPostInstall = ({
	projectDir,
	platform,
	platformKey,
	marker,
	relativePath,
	isEntrySelectable,
}) => {
	const available = platform?.[platformKey]?.available;
	const entries = collectSelectedEntries(available, isEntrySelectable);
	const numbers = collectMemberNumbers(entries);

	if (numbers.length === 0) {
		return;
	}

	const filePath = join(projectDir, relativePath);
	const lines = readFileSync(filePath, "utf-8").split("\n");
	const markerIndex = lines.findIndex((line) => line.trim() === marker);

	if (markerIndex === -1) {
		return;
	}

	const indent = lines[markerIndex].match(/^\s*/)[0];
	const memberLines = buildMemberLines(numbers, indent);
	lines.splice(markerIndex, 1, memberLines);

	const docCloseIndex = markerIndex - 2;
	if (docCloseIndex >= 0 && lines[docCloseIndex].trim() === "*/") {
		const docLines = buildMemberDocs(entries);

		if (docLines.length > 0) {
			lines.splice(docCloseIndex, 0, ...docLines);
		}
	}

	writeFileSync(filePath, lines.join("\n"), "utf-8");
};
