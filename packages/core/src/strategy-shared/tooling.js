import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";

const USB_SERIAL_PORT_PATTERNS = {
	darwin: [/^cu\.(usb|usbserial|wchusbserial|SLAB)/],
	linux: [/^ttyUSB/, /^ttyACM/, /^ttyAMA/],
	win32: [/^COM\d+$/],
};
const SERIAL_DEVICE_DIRECTORY = "/dev";

export const detectUsbSerialPorts = () => {
	const patterns = USB_SERIAL_PORT_PATTERNS[process.platform];
	if (!patterns) {
		return [];
	}

	let devices;
	try {
		devices = readdirSync(SERIAL_DEVICE_DIRECTORY);
	} catch {
		return [];
	}

	return devices
		.filter((device) => {
			return patterns.some((pattern) => {
				return pattern.test(device);
			});
		})
		.map((device) => {
			return {
				label: `${SERIAL_DEVICE_DIRECTORY}/${device}`,
				value: `${SERIAL_DEVICE_DIRECTORY}/${device}`,
			};
		});
};

export const runSpawnedProcess = (
	command,
	args,
	{ timeout = 120000, capture = false, verbose = false } = {},
) => {
	return new Promise((resolve, reject) => {
		const stdio = verbose
			? ["inherit", "inherit", "inherit"]
			: capture
				? ["inherit", "pipe", "inherit"]
				: ["inherit", "pipe", "pipe"];

		const child = spawn(command, args, { stdio, detached: true });

		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk) => {
			stderr += chunk;
		});

		const killProcessGroup = () => {
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch {}
		};

		const handleSignal = () => {
			killProcessGroup();
			process.exit(1);
		};

		process.once("SIGINT", handleSignal);
		process.once("SIGTERM", handleSignal);

		const timeoutId = setTimeout(killProcessGroup, timeout);

		const cleanup = () => {
			clearTimeout(timeoutId);
			process.removeListener("SIGINT", handleSignal);
			process.removeListener("SIGTERM", handleSignal);
		};

		child.on("error", (error) => {
			cleanup();
			reject(error);
		});
		child.on("close", (code) => {
			cleanup();
			resolve({ code: code ?? null, stdout, stderr });
		});
	});
};

export const runTool = async (
	command,
	args,
	{ timeout = 120000, capture = false, verbose = false } = {},
) => {
	const { code, stdout, stderr } = await runSpawnedProcess(command, args, {
		timeout,
		capture,
		verbose,
	});

	if (code !== 0) {
		const message = verbose
			? `"${command}" failed with exit code ${code}`
			: `"${command}" failed: ${stderr.trim() || `exit code ${code}`}`;
		throw new Error(message);
	}
	return capture ? stdout : undefined;
};
