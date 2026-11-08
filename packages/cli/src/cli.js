#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeErrorLine, writeLine } from "./console.js";
import { PACKAGE_FILE } from "./constants.js";

const MINIMUM_NODE_MAJOR = 22;
const PACKAGE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = JSON.parse(
	readFileSync(join(PACKAGE_DIRECTORY, PACKAGE_FILE), "utf8"),
);

const COMMANDS = [
	"init",
	"install",
	"libraries",
	"build",
	"compile",
	"upload",
	"flash",
	"monitor",
	"doctor",
	"install-vs-code",
];

const USAGE = `Usage: embedito95 <command> [options]

Commands:
  init [--library]   Create a project, or a library inside one
  install [library]  Reinstall libraries, or add one from the registry
  libraries          List core, built-in and installed libraries
  build              Generate C++ from the .e95 sources
  compile            Compile the firmware for the target board
  upload             Upload the compiled firmware
  flash              build + compile + upload
  monitor            Open the serial monitor
  doctor             Check the toolchain
  install-vs-code    Install the editor extension

Options:
  -h, --help     Show this help
  -v, --version  Show the version`;

const COMMANDS_DIRECTORY = join(
	dirname(fileURLToPath(import.meta.url)),
	"commands",
);

const resolveCommandPath = (command) => {
	const filePath = join(COMMANDS_DIRECTORY, `${command}.js`);
	if (existsSync(filePath)) {
		return `./commands/${command}.js`;
	}
	return `./commands/${command}/index.js`;
};

const checkNodeVersion = () => {
	const nodeMajor = Number(process.versions.node.split(".")[0]);

	if (nodeMajor < MINIMUM_NODE_MAJOR) {
		writeErrorLine(
			`embedito95 requires Node.js ${MINIMUM_NODE_MAJOR} or newer (found ${process.version}).`,
		);
		process.exit(1);
	}
};

const main = async () => {
	checkNodeVersion();

	const command =
		process.argv[2] === "--install-vs-code"
			? "install-vs-code"
			: process.argv[2];

	if (command === "-h" || command === "--help") {
		writeLine(USAGE);
		return;
	}

	if (command === "-v" || command === "--version") {
		writeLine(PACKAGE.version);
		return;
	}

	if (!command) {
		writeErrorLine(USAGE);
		process.exit(1);
	}

	if (!COMMANDS.includes(command)) {
		writeErrorLine(`embedito95: command not found "${command}"`);
		process.exit(1);
	}

	try {
		const commandModule = await import(resolveCommandPath(command));
		await commandModule.run();
	} catch (error) {
		writeErrorLine(`Error running ${command}: ${error.message}`);
		process.exit(1);
	}
};

main();
