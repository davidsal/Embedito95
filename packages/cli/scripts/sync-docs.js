import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { UTF8 } from "embedito95-core";
import { copyDocumentation } from "../src/commands/shared/docs.js";
import { CLI_DIRECTORY } from "../src/commands/shared/paths.js";
import { DOCS_DIRECTORY_NAME, PACKAGE_FILE } from "../src/constants.js";

const REPOSITORY_ROOT = join(CLI_DIRECTORY, "..", "..");
const SOURCE_DIRECTORY = join(REPOSITORY_ROOT, DOCS_DIRECTORY_NAME);
const DESTINATION_DIRECTORY = join(CLI_DIRECTORY, DOCS_DIRECTORY_NAME);
const PACKAGE = JSON.parse(
	readFileSync(join(CLI_DIRECTORY, PACKAGE_FILE), UTF8),
);

rmSync(DESTINATION_DIRECTORY, { recursive: true, force: true });
copyDocumentation(SOURCE_DIRECTORY, DESTINATION_DIRECTORY, PACKAGE.version);
