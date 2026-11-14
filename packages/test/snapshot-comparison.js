import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, extname, join } from "node:path";
import {
	BUILD_DIRECTORY_NAME,
	CORE_LIBRARIES_DIRECTORY_NAME,
	CYCLES_CONFIG_FILE_NAME,
	LIBRARIES_DIRECTORY_NAME,
	UTF8,
} from "embedito95-core";
import {
	ENGINE_DIRECTORY_NAME,
	ENTRY_SUFFIX_PATTERN,
	SNAPSHOT_STATUS,
	TEST_ENTRY_SUFFIX_PATTERN,
} from "./constants.js";

const writeSnapshotFile = (snapshotPath, content) => {
	mkdirSync(dirname(snapshotPath), { recursive: true });
	writeFileSync(snapshotPath, content, UTF8);
};

const normalizeLineEndings = (text) => {
	return text.replace(/\r\n/g, "\n");
};

export const processSnapshotFile = (snapshotPath, content, updateSnapshots) => {
	const normalizedContent = normalizeLineEndings(content);

	if (updateSnapshots) {
		writeSnapshotFile(snapshotPath, normalizedContent);
		return { status: SNAPSHOT_STATUS.match, snapshotPath };
	}

	if (!existsSync(snapshotPath)) {
		writeSnapshotFile(snapshotPath, normalizedContent);
		return { status: SNAPSHOT_STATUS.created, snapshotPath };
	}

	return normalizeLineEndings(readFileSync(snapshotPath, UTF8)) ===
		normalizedContent
		? { status: SNAPSHOT_STATUS.match, snapshotPath }
		: { status: SNAPSHOT_STATUS.mismatch, snapshotPath };
};

const aggregateSnapshotStatus = (results) => {
	const mismatched = results.find((result) => {
		return result.status === SNAPSHOT_STATUS.mismatch;
	});
	if (mismatched) {
		return {
			status: SNAPSHOT_STATUS.mismatch,
			snapshotPath: mismatched.snapshotPath,
		};
	}
	if (
		results.some((result) => {
			return result.status === SNAPSHOT_STATUS.created;
		})
	) {
		return { status: SNAPSHOT_STATUS.created, snapshotPath: null };
	}
	return { status: SNAPSHOT_STATUS.match, snapshotPath: null };
};

const processLibrariesSnapshot = (
	snapshotsDirectory,
	librariesDirectory,
	updateSnapshots,
) => {
	const results = [];

	for (const libraryName of readdirSync(librariesDirectory)) {
		const librarySourceDirectory = join(librariesDirectory, libraryName);
		for (const fileName of readdirSync(librarySourceDirectory)) {
			// The generated config header is validated by `config-include-checks.js`;
			// skipping it avoids one duplicated snapshot per library.
			if (fileName === CYCLES_CONFIG_FILE_NAME) {
				continue;
			}
			const snapshotPath = join(
				snapshotsDirectory,
				ENGINE_DIRECTORY_NAME,
				libraryName,
				fileName,
			);
			const content = readFileSync(
				join(librarySourceDirectory, fileName),
				UTF8,
			);
			results.push(processSnapshotFile(snapshotPath, content, updateSnapshots));
		}
	}

	return results;
};

export const snapshotBuild = (
	snapshotsDirectory,
	projectDirectory,
	platformName,
	entryFile,
	category,
	updateSnapshots,
) => {
	const buildDirectory = join(
		projectDirectory,
		BUILD_DIRECTORY_NAME,
		platformName,
	);
	const categorySnapshotDirectory = join(snapshotsDirectory, category);
	const testName = entryFile
		.replace(TEST_ENTRY_SUFFIX_PATTERN, "")
		.replace(ENTRY_SUFFIX_PATTERN, "");
	const results = [];

	for (const entry of readdirSync(buildDirectory, { withFileTypes: true })) {
		const sourcePath = join(buildDirectory, entry.name);

		if (
			entry.isDirectory() &&
			(entry.name === LIBRARIES_DIRECTORY_NAME ||
				entry.name === CORE_LIBRARIES_DIRECTORY_NAME)
		) {
			results.push(
				...processLibrariesSnapshot(
					snapshotsDirectory,
					sourcePath,
					updateSnapshots,
				),
			);
			continue;
		}

		if (entry.isFile()) {
			// The generated config header is validated by `config-include-checks.js`;
			// skipping it avoids one duplicated snapshot per unit/library.
			if (entry.name === CYCLES_CONFIG_FILE_NAME) {
				continue;
			}
			const snapshotPath = join(
				categorySnapshotDirectory,
				`${testName}${extname(entry.name)}`,
			);
			const content = readFileSync(sourcePath, UTF8);
			results.push(processSnapshotFile(snapshotPath, content, updateSnapshots));
		}
	}

	return aggregateSnapshotStatus(results);
};
