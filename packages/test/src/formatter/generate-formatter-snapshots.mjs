import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format, parse, tokenize } from "embedito95-core";

const FORMATTER_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIRECTORY = join(FORMATTER_DIRECTORY, "snapshots");
const TEST_FILE_SUFFIX = ".test.e95";
const SNAPSHOT_FILE_SUFFIX = ".snap.e95";
const UTF8 = "utf-8";

const listFormatterTestFileNames = () => {
	return readdirSync(FORMATTER_DIRECTORY)
		.filter((fileName) => {
			return fileName.endsWith(TEST_FILE_SUFFIX);
		})
		.sort();
};

const collectCommentValues = (comments) => {
	return comments
		.map((comment) => {
			return comment.value.trim();
		})
		.sort();
};

const assertCommentsPreserved = (
	sourceComments,
	formattedComments,
	sourceName,
) => {
	const sourceValues = collectCommentValues(sourceComments);
	const formattedValues = collectCommentValues(formattedComments);
	if (JSON.stringify(sourceValues) !== JSON.stringify(formattedValues)) {
		throw new Error(
			`${sourceName}: formatter lost or altered comments (${JSON.stringify(sourceValues)} -> ${JSON.stringify(formattedValues)})`,
		);
	}
};

const parseSource = (source, sourceName) => {
	const { tokens, errors: lexErrors } = tokenize(source);
	if (lexErrors.length > 0) {
		throw new Error(`${sourceName}: ${lexErrors.length} lex error(s)`);
	}
	const parsed = parse(tokens, source);
	if (parsed.errors.length > 0) {
		throw new Error(`${sourceName}: ${parsed.errors.length} parse error(s)`);
	}
	return parsed;
};

const formatSource = (source, sourceName) => {
	const parsed = parseSource(source, sourceName);
	const formatted = format(parsed.ast, parsed.comments, source);
	const reformattedParsed = parseSource(formatted, sourceName);
	assertCommentsPreserved(
		parsed.comments,
		reformattedParsed.comments,
		sourceName,
	);
	const reformatted = format(
		reformattedParsed.ast,
		reformattedParsed.comments,
		formatted,
	);
	if (reformatted !== formatted) {
		throw new Error(`${sourceName}: formatter is not idempotent`);
	}
	return formatted;
};

export const listFormatterSnapshots = () => {
	return listFormatterTestFileNames().map((fileName) => {
		const snapshotName = fileName.replace(TEST_FILE_SUFFIX, SNAPSHOT_FILE_SUFFIX);
		return {
			sourceName: fileName,
			snapshotName,
			snapshotPath: join(SNAPSHOTS_DIRECTORY, snapshotName),
			content: formatSource(
				readFileSync(join(FORMATTER_DIRECTORY, fileName), UTF8),
				fileName,
			),
		};
	});
};

export const writeFormatterSnapshots = () => {
	for (const { snapshotPath, content } of listFormatterSnapshots()) {
		mkdirSync(dirname(snapshotPath), { recursive: true });
		writeFileSync(snapshotPath, content, UTF8);
	}
};

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	writeFormatterSnapshots();
	console.log("Generated formatter snapshots");
}
