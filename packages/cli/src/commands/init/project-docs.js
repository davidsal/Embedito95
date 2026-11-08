import { existsSync } from "node:fs";
import { join } from "node:path";
import { DOCS_DIRECTORY_NAME } from "../../constants.js";
import { copyDocumentation } from "../shared/docs.js";
import { CLI_DIRECTORY } from "../shared/paths.js";

const PACKAGED_DOCS_DIRECTORY = join(CLI_DIRECTORY, DOCS_DIRECTORY_NAME);
const REPOSITORY_DOCS_DIRECTORY = join(
	CLI_DIRECTORY,
	"..",
	"..",
	DOCS_DIRECTORY_NAME,
);

const resolveDocsDirectory = () => {
	if (existsSync(PACKAGED_DOCS_DIRECTORY)) {
		return PACKAGED_DOCS_DIRECTORY;
	}
	return REPOSITORY_DOCS_DIRECTORY;
};

export const copyProjectDocumentation = (projectPath, version) => {
	return copyDocumentation(
		resolveDocsDirectory(),
		join(projectPath, DOCS_DIRECTORY_NAME),
		version,
	);
};
