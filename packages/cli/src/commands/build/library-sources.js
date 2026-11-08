import { existsSync, readFileSync } from "node:fs";
import { parse, shared, tokenize, UTF8 } from "embedito95-core";

export const collectProjectLibraryImports = (
	projectLibraries,
	usedLibraries,
) => {
	const libraryNames = new Set(usedLibraries);

	for (const [packageName, sourcePath] of Object.entries(
		projectLibraries?.librarySources ?? {},
	)) {
		if (!usedLibraries.has(packageName)) {
			continue;
		}
		if (!existsSync(sourcePath)) {
			continue;
		}
		const source = readFileSync(sourcePath, UTF8);
		const { tokens } = tokenize(source);
		const { ast } = parse(tokens);
		for (const libraryName of shared.extractUsedLibraries(ast)) {
			libraryNames.add(libraryName);
		}
	}

	return libraryNames;
};

export const readLibrarySources = (projectLibraries, usedLibraries) => {
	const sources = [];

	for (const packageName of usedLibraries) {
		const sourcePath = projectLibraries?.librarySources?.[packageName];
		if (!sourcePath || !existsSync(sourcePath)) {
			continue;
		}
		sources.push(readFileSync(sourcePath, UTF8));
	}

	return sources;
};
