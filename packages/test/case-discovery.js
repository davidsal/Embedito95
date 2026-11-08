import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { E95_EXTENSION, LIBRARIES_DIRECTORY_NAME } from "embedito95-core";
import {
	EXAMPLES_DIRECTORY_NAME,
	EXCLUDED_TESTS_BY_PLATFORM,
	FORMATTER_DIRECTORY_NAME,
	LANGUAGE_DIRECTORY_NAME,
	TEST_SOURCES_DIRECTORY,
} from "./constants.js";

export const listSubdirectories = (directory) => {
	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
};

export const listEntryFiles = (directory) => {
	if (!existsSync(directory)) {
		return [];
	}
	return readdirSync(directory).filter((fileName) => {
		return fileName.endsWith(E95_EXTENSION);
	});
};

export const listExcludedEntryFiles = (platformName) => {
	return new Set(EXCLUDED_TESTS_BY_PLATFORM[platformName] ?? []);
};

export const listPlatformNames = () => {
	return listSubdirectories(TEST_SOURCES_DIRECTORY).filter((directoryName) => {
		return (
			directoryName !== LANGUAGE_DIRECTORY_NAME &&
			directoryName !== FORMATTER_DIRECTORY_NAME
		);
	});
};

export const listCategories = () => {
	return [LIBRARIES_DIRECTORY_NAME, EXAMPLES_DIRECTORY_NAME];
};

export const listTestDirectory = (platformName, category) => {
	return join(TEST_SOURCES_DIRECTORY, platformName, category);
};

const listTestFileSetsByPlatform = (platformNames, category) => {
	const testSets = new Map();

	for (const platformName of platformNames) {
		const excluded = listExcludedEntryFiles(platformName);
		const tests = new Set(
			listEntryFiles(listTestDirectory(platformName, category)).filter(
				(entryFile) => {
					return !excluded.has(entryFile);
				},
			),
		);
		testSets.set(platformName, tests);
	}

	return testSets;
};

const validateCategoryTestParity = (platformNames, category) => {
	const testSets = listTestFileSetsByPlatform(platformNames, category);
	const baselineTests = new Set();
	for (const tests of testSets.values()) {
		for (const test of tests) {
			baselineTests.add(test);
		}
	}

	const sortedBaseline = [...baselineTests].sort();
	const errors = [];

	for (const [platformName, tests] of testSets) {
		const excluded = listExcludedEntryFiles(platformName);
		const missing = sortedBaseline.filter((test) => {
			return !tests.has(test) && !excluded.has(test);
		});
		if (missing.length === 0) {
			continue;
		}
		errors.push(
			`[${category}] "${platformName}" has ${tests.size} test(s) but must cover ${sortedBaseline.length}: missing ${missing.join(", ")}`,
		);
	}

	return errors;
};

export const validatePlatformTestParity = (platformNames) => {
	if (platformNames.length === 0) {
		return [];
	}

	const errors = [];

	for (const category of listCategories()) {
		errors.push(...validateCategoryTestParity(platformNames, category));
	}

	return errors;
};
