import { spawnSync } from "node:child_process";
import { platform } from "node:os";
import {
	IOSSIOSPEED_IOCTL,
	PLACEHOLDER_BAUD_RATE,
	PYTHON_COMMAND,
	STTY_COMMAND,
	STTY_FLAGS,
	TCFLSH_LINUX,
	TCFLSH_MACOS,
	TCIFLUSH_LINUX,
	TCIFLUSH_MACOS,
} from "../../constants.js";

const sttyFlag = () => {
	return platform() === "linux" ? "-F" : "-f";
};

const flushIoctl = () => {
	return platform() === "linux" ? TCFLSH_LINUX : TCFLSH_MACOS;
};

const flushQueue = () => {
	return platform() === "linux" ? TCIFLUSH_LINUX : TCIFLUSH_MACOS;
};

const FLUSH_INPUT_SOURCE = [
	"import fcntl, struct, sys",
	`fcntl.ioctl(0, ${flushIoctl()}, struct.pack('i', ${flushQueue()}))`,
].join("\n");

const IOSSIOSPEED_SOURCE = [
	"import fcntl, struct, sys",
	"speed = int(sys.argv[1])",
	`fcntl.ioctl(0, ${IOSSIOSPEED_IOCTL}, struct.pack('I', speed))`,
].join("\n");

export const configurePort = (port) => {
	const result = spawnSync(
		STTY_COMMAND,
		[sttyFlag(), port, PLACEHOLDER_BAUD_RATE, ...STTY_FLAGS],
		{ stdio: "pipe" },
	);
	if (result.status !== 0) {
		throw new Error(
			`Could not configure ${port}: ${
				(result.stderr?.toString() ?? "").trim() || `${STTY_COMMAND} failed`
			}`,
		);
	}
};

export const setBaudRate = (fileDescriptor, port, baudRate) => {
	const result = spawnSync(STTY_COMMAND, [sttyFlag(), port, String(baudRate)], {
		stdio: "pipe",
	});

	if (result.status === 0) {
		return;
	}

	if (platform() !== "darwin") {
		throw new Error(
			`Could not set baud rate ${baudRate} on ${port}: ${
				(result.stderr?.toString() ?? "").trim() || `${STTY_COMMAND} failed`
			}`,
		);
	}

	const iospeed = spawnSync(
		PYTHON_COMMAND,
		["-c", IOSSIOSPEED_SOURCE, String(baudRate)],
		{ stdio: [fileDescriptor, "ignore", "pipe"] },
	);

	if (iospeed.status !== 0) {
		throw new Error(
			`Could not set baud rate ${baudRate} on ${port}: stty does not support it and IOSSIOSPEED failed`,
		);
	}
};

export const flushInputBuffer = (fileDescriptor) => {
	spawnSync(PYTHON_COMMAND, ["-c", FLUSH_INPUT_SOURCE], {
		stdio: [fileDescriptor, "ignore", "ignore"],
	});
};
