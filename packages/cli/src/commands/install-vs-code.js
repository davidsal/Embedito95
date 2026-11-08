#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { cyan, red, writeLine, yellow } from "../console.js";

const REPOSITORY = "davidsal/Embedito95";
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases`;
const FALLBACK_VSIX_URL = `https://github.com/${REPOSITORY}/releases/latest/download/embedito95-lsp.vsix`;
const VSIX_FILE_NAME = "embedito95-lsp.vsix";
const USER_AGENT = "embedito95-cli";
const EDITOR_COMMANDS = ["code", "cursor", "codium"];
const WINDOWS_EDITOR_COMMANDS = ["code.cmd", "cursor.cmd", "codium.cmd"];
const MAC_EDITOR_PATHS = [
	"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
	"/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
	"/Applications/VSCodium.app/Contents/Resources/app/bin/codium",
];

const isCommandAvailable = (command) => {
	const result = spawnSync(command, ["--version"], {
		stdio: "ignore",
		shell: process.platform === "win32",
	});

	return result.status === 0;
};

const findEditor = () => {
	const commands =
		process.platform === "win32" ? WINDOWS_EDITOR_COMMANDS : EDITOR_COMMANDS;
	const candidates = [...commands];

	if (process.platform === "darwin") {
		candidates.push(...MAC_EDITOR_PATHS);
		const homeApplications = join(
			homedir(),
			"Applications",
			"Visual Studio Code.app",
			"Contents",
			"Resources",
			"app",
			"bin",
			"code",
		);
		candidates.push(homeApplications);
	}

	for (const candidate of candidates) {
		if (candidate.includes("/") && !existsSync(candidate)) {
			continue;
		}
		if (isCommandAvailable(candidate)) {
			return candidate;
		}
	}

	return null;
};

const findVsixUrl = async () => {
	try {
		const response = await fetch(RELEASES_API, {
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": USER_AGENT,
			},
		});

		if (!response.ok) {
			return FALLBACK_VSIX_URL;
		}

		const releases = await response.json();

		for (const release of releases) {
			for (const asset of release.assets ?? []) {
				if (asset.name?.endsWith(".vsix")) {
					return asset.browser_download_url;
				}
			}
		}
	} catch {
		// Fall back to the stable release asset URL below.
	}

	return FALLBACK_VSIX_URL;
};

const downloadVsix = async (destination) => {
	const url = await findVsixUrl();
	const response = await fetch(url, {
		headers: { "User-Agent": USER_AGENT },
	});

	if (!response.ok) {
		throw new Error(
			`Could not download the extension (HTTP ${response.status})`,
		);
	}

	writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
};

const NOISE_PATTERN = /\[DEP0169\]|trace-deprecation/;
const VERBOSE =
	process.argv.includes("--verbose") || process.env.EMBEDITO95_VERBOSE === "1";

const filterNoise = (text) => {
	return text
		.split("\n")
		.filter((line) => line.trim() && !NOISE_PATTERN.test(line))
		.join("\n");
};

const installExtension = (editor, vsixPath) => {
	const result = spawnSync(
		editor,
		["--install-extension", vsixPath, "--force"],
		{
			encoding: "utf8",
			shell: process.platform === "win32",
		},
	);

	const rawOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
	const output =
		VERBOSE || result.status !== 0 ? rawOutput.trim() : filterNoise(rawOutput);

	if (output) {
		writeLine(output);
	}

	return result.status === 0;
};

export const run = async () => {
	const editor = findEditor();

	if (!editor) {
		writeLine(
			`${red("✖")} Visual Studio Code, Cursor or VSCodium was not found.`,
		);
		writeLine(
			`  Install one of them, or install the extension manually from ${FALLBACK_VSIX_URL}`,
		);
		process.exit(1);
	}

	const directory = mkdtempSync(join(tmpdir(), "embedito95-vsix-"));
	const vsixPath = join(directory, VSIX_FILE_NAME);

	try {
		writeLine(`Installing the Embedito95 extension with ${editor}...`);
		await downloadVsix(vsixPath);

		if (!installExtension(editor, vsixPath)) {
			throw new Error("The editor could not install the extension");
		}

		writeLine(`${cyan("✔")} Embedito95 language support installed.`);
		writeLine(`${yellow("Restart the editor if it was open.")}`);
	} catch (error) {
		writeLine(`${red("✖")} ${error.message}`);
		process.exitCode = 1;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};
