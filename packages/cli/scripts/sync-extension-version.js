import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UTF8 } from "embedito95-core";
import { CLI_DIRECTORY } from "../src/commands/shared/paths.js";
import { PACKAGE_FILE } from "../src/constants.js";

const REPOSITORY_ROOT = join(CLI_DIRECTORY, "..", "..");
const PACKAGES_DIRECTORY = join(REPOSITORY_ROOT, "packages");
const EXTENSION_PACKAGES = ["lsp", "lsp-vscode"];

const cliVersion = JSON.parse(
	readFileSync(join(CLI_DIRECTORY, PACKAGE_FILE), UTF8),
).version;

for (const packageDirectory of EXTENSION_PACKAGES) {
	const packagePath = join(PACKAGES_DIRECTORY, packageDirectory, PACKAGE_FILE);
	const packageConfiguration = JSON.parse(readFileSync(packagePath, UTF8));

	if (packageConfiguration.version === cliVersion) {
		continue;
	}

	packageConfiguration.version = cliVersion;
	writeFileSync(
		packagePath,
		`${JSON.stringify(packageConfiguration, null, "\t")}\n`,
		UTF8,
	);
	console.log(`${packageConfiguration.name} → ${cliVersion}`);
}
