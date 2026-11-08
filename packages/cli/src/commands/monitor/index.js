import { existsSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE, shared } from "embedito95-core";
import { green, red, writeErrorLine, writeLine } from "../../console.js";
import {
	BAUD_RATE_MESSAGE,
	BAUD_RATE_PATTERN,
	DEFAULT_BAUD_RATE,
	OTHER_BAUD_RATE,
	OTHER_BAUD_RATE_LABEL,
	SELECT_PORT_MESSAGE,
} from "../../constants.js";
import { getCurrentWorkingDirectory } from "../shared/paths.js";
import { selectPort } from "../shared/ports.js";
import { input, select } from "../shared/prompt.js";
import { loadProjectState, saveProjectState } from "../shared/state.js";
import { openSerialMonitor } from "./serial.js";

const CURRENT_WORKING_DIRECTORY = getCurrentWorkingDirectory();
const CONFIGURATION_PATH = join(CURRENT_WORKING_DIRECTORY, CONFIG_FILE);

const selectBaudRate = async (rememberedBaud) => {
	const remembered = rememberedBaud ? String(rememberedBaud) : null;
	const choices = [];

	if (remembered && remembered !== DEFAULT_BAUD_RATE) {
		choices.push({ name: remembered, value: remembered });
	}
	choices.push({ name: DEFAULT_BAUD_RATE, value: DEFAULT_BAUD_RATE });
	choices.push({ name: OTHER_BAUD_RATE_LABEL, value: OTHER_BAUD_RATE });

	const selected = await select({
		message: BAUD_RATE_MESSAGE,
		choices,
		defaultIndex: 0,
	});

	if (selected !== OTHER_BAUD_RATE) {
		return selected;
	}

	const custom = (await input({ message: BAUD_RATE_MESSAGE })).trim();
	if (!BAUD_RATE_PATTERN.test(custom)) {
		writeErrorLine(`${red("✖")} Invalid baud rate "${custom}"`);
		process.exit(1);
	}
	return custom;
};

export const run = async () => {
	const hasProject = existsSync(CONFIGURATION_PATH);
	const rememberedState = hasProject
		? loadProjectState(CURRENT_WORKING_DIRECTORY)
		: {};

	const ports = shared.detectUsbSerialPorts();

	if (ports.length === 0) {
		writeErrorLine(`${red("✖")} No serial devices detected`);
		process.exit(1);
	}

	const port = await selectPort(
		SELECT_PORT_MESSAGE,
		ports,
		rememberedState.port,
	);
	const baudRate = await selectBaudRate(rememberedState.baudRate);

	if (hasProject) {
		saveProjectState(CURRENT_WORKING_DIRECTORY, { port, baudRate });
	}

	try {
		await openSerialMonitor({ port, baudRate });
	} catch (error) {
		writeErrorLine(`${red("✖")} ${error.message}`);
		process.exit(1);
	}

	writeLine(`${green("✔")} Disconnected`);
};
