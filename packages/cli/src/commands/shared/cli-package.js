import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UTF8 } from "embedito95-core";
import { PACKAGE_FILE } from "../../constants.js";
import { CLI_DIRECTORY } from "./paths.js";

const CLI_PACKAGE = JSON.parse(
	readFileSync(join(CLI_DIRECTORY, PACKAGE_FILE), UTF8),
);

export const CLI_VERSION = CLI_PACKAGE.version;
