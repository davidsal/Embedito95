// Copies the repository license files into a package before it is packed.
// npm only includes files inside the package directory, so published packages
// need their own copy of LICENSE and LICENSE-EXCEPTION.md; otherwise scanners
// and SBOMs report plain AGPL-3.0-only and miss the runtime exception.
//
// The copies are gitignored and overwritten on every pack, so they never drift.
//
// Usage, from a package directory:
//   node ../../scripts/license-files.mjs
import { copyFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LICENSE_FILES = ["LICENSE", "LICENSE-EXCEPTION.md"];
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const packageDirectory = process.cwd();

for (const fileName of LICENSE_FILES) {
	const source = join(repositoryRoot, fileName);
	const target = join(packageDirectory, fileName);

	if (resolve(source) === resolve(target)) {
		continue;
	}

	if (!existsSync(source)) {
		throw new Error(`Missing license file in repository root: ${fileName}`);
	}

	copyFileSync(source, target);
}
