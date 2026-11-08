import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { UTF8 } from "embedito95-core";
import { DOCS_VERSION_FILE, EXCLUDED_DOC_FILES } from "../../constants.js";

const shouldCopyDocumentationFile = (sourcePath) => {
	return !EXCLUDED_DOC_FILES.has(basename(sourcePath));
};

export const copyDocumentation = (
	sourceDirectory,
	destinationDirectory,
	version,
) => {
	if (!existsSync(sourceDirectory)) {
		return false;
	}

	mkdirSync(destinationDirectory, { recursive: true });
	cpSync(sourceDirectory, destinationDirectory, {
		recursive: true,
		filter: shouldCopyDocumentationFile,
	});
	writeFileSync(
		join(destinationDirectory, DOCS_VERSION_FILE),
		`${version}\n`,
		UTF8,
	);

	return true;
};
