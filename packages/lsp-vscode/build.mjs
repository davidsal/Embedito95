import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const LSP_BUILD_COMMAND = "pnpm run build";
const NODE_PLATFORM = "node";
const COMMON_JS_FORMAT = "cjs";
const VSCODE_EXTERNAL_MODULE = "vscode";
const PACKAGES_DIRECTORY_NAME = "packages";
const LSP_DIRECTORY_NAME = "lsp";
const DISTRIBUTION_DIRECTORY_NAME = "dist";
const SERVER_DIRECTORY_NAME = "server";
const SOURCE_DIRECTORY_NAME = "src";
const SERVER_BUNDLE_FILE_NAME = "server.cjs";
const EXTENSION_CLIENT_FILE_NAME = "extension.js";
const EXTENSION_CLIENT_BUNDLE_FILE_NAME = "extension.cjs";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));

const repositoryRoot = join(currentDirectory, "..", "..");
const lspPackageDirectory = join(
	repositoryRoot,
	PACKAGES_DIRECTORY_NAME,
	LSP_DIRECTORY_NAME,
);
const serverBundlePath = join(
	lspPackageDirectory,
	DISTRIBUTION_DIRECTORY_NAME,
	SERVER_BUNDLE_FILE_NAME,
);
const extensionServerDirectory = join(currentDirectory, SERVER_DIRECTORY_NAME);
const extensionDistributionDirectory = join(
	currentDirectory,
	DISTRIBUTION_DIRECTORY_NAME,
);

console.log("Building LSP server...");
execSync(LSP_BUILD_COMMAND, { cwd: lspPackageDirectory, stdio: "inherit" });

if (!existsSync(extensionServerDirectory)) {
	mkdirSync(extensionServerDirectory, { recursive: true });
}

console.log("Copying server bundle...");
cpSync(serverBundlePath, join(extensionServerDirectory, SERVER_BUNDLE_FILE_NAME));

if (!existsSync(extensionDistributionDirectory)) {
	mkdirSync(extensionDistributionDirectory, { recursive: true });
}

console.log("Bundling extension client...");
esbuild.buildSync({
	entryPoints: [
		join(currentDirectory, SOURCE_DIRECTORY_NAME, EXTENSION_CLIENT_FILE_NAME),
	],
	outfile: join(
		extensionDistributionDirectory,
		EXTENSION_CLIENT_BUNDLE_FILE_NAME,
	),
	bundle: true,
	platform: NODE_PLATFORM,
	format: COMMON_JS_FORMAT,
	external: [VSCODE_EXTERNAL_MODULE],
});

console.log("Done");
