import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CLI_DIRECTORY } from "../src/commands/shared/paths.js";

const REPOSITORY_ROOT = join(CLI_DIRECTORY, "..", "..");
const VSCODE_DIRECTORY = join(REPOSITORY_ROOT, "packages", "lsp-vscode");
const ASSETS_DIRECTORY = join(CLI_DIRECTORY, "assets");
const VSIX_FILE_NAME = "embedito95-lsp.vsix";
const VSIX_PATH = join(ASSETS_DIRECTORY, VSIX_FILE_NAME);

const run = (command, args, cwd) => {
	const result = spawnSync(command, args, { cwd, stdio: "inherit" });

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
};

run(
	process.execPath,
	[join(CLI_DIRECTORY, "scripts", "sync-extension-version.js")],
	REPOSITORY_ROOT,
);
run(process.execPath, [join(VSCODE_DIRECTORY, "build.mjs")], REPOSITORY_ROOT);

mkdirSync(ASSETS_DIRECTORY, { recursive: true });
run(
	"pnpm",
	[
		"exec",
		"vsce",
		"package",
		"--no-dependencies",
		"--allow-missing-repository",
		"--out",
		VSIX_PATH,
	],
	VSCODE_DIRECTORY,
);

console.log(`Bundled extension → ${VSIX_PATH}`);
