#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLI_VERSION } from "./commands/shared/cli-package.js";
import { getCurrentWorkingDirectory } from "./commands/shared/paths.js";
import {
	consumeForceFlag,
	delegateToProjectVersion,
	resolveVersionAction,
	VERSION_ACTION,
} from "./commands/shared/version.js";
import { writeErrorLine, writeLine } from "./console.js";

const MINIMUM_NODE_MAJOR = 22;

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

const applyVersionPolicy = ({ commandArguments, force }) => {
	const action = resolveVersionAction({
		workingDirectory: getCurrentWorkingDirectory(),
		runningVersion: CLI_VERSION,
		force,
	});

	if (action.type !== VERSION_ACTION.delegate) {
		return;
	}

	process.exit(
		delegateToProjectVersion({
			projectVersion: action.projectVersion,
			commandArguments,
		}),
	);
};

const rebuildProcessArguments = (commandArguments) => {
	return [process.argv[0], process.argv[1], ...commandArguments];
};

const main = async () => {
	checkNodeVersion();

	const consumedArguments = consumeForceFlag(process.argv.slice(2));
	process.argv = rebuildProcessArguments(consumedArguments.commandArguments);

	const command =
		process.argv[2] === "--install-vs-code"
			? "install-vs-code"
			: process.argv[2];

	if (command === "-h" || command === "--help") {
		writeLine(USAGE);
		return;
	}

	if (command === "-v" || command === "--version") {
		writeLine(CLI_VERSION);
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

	applyVersionPolicy({
		commandArguments: consumedArguments.commandArguments,
		force: consumedArguments.force,
	});

	try {
		const commandModule = await import(resolveCommandPath(command));
		await commandModule.run();
	} catch (error) {
		writeErrorLine(`Error running ${command}: ${error.message}`);
		process.exit(1);
	}
};

main();
