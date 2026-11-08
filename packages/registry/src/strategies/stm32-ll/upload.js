import {
	ARTIFACTS_DIRECTORY_NAME,
	CUBEPROG_NOT_FOUND_MESSAGE,
} from "./constants.js";

const stripAnsiEscapeCodes = (text) => {
	let strippedText = "";
	let skippingEscape = false;
	for (const character of text) {
		if (character === "\x1b") {
			skippingEscape = true;
		} else if (skippingEscape) {
			if (character === "m") {
				skippingEscape = false;
			}
		} else {
			strippedText += character;
		}
	}
	return strippedText;
};

export const detectPorts = async ({ shared }) => {
	const { spawnSync } = await import("node:child_process");

	const cubeProgrammer = shared.findStm32CubeProg({ spawnSync });

	if (!cubeProgrammer) {
		return [];
	}

	const result = spawnSync(cubeProgrammer, ["-l"], {
		stdio: "pipe",
		timeout: 10000,
	});

	if (result.status !== 0 || !result.stdout) {
		return [];
	}

	const lines = result.stdout.toString().split("\n");
	const probes = [];
	let reading = false;
	let probeIndex = 0;

	for (const line of lines) {
		const cleaned = stripAnsiEscapeCodes(line).trim();

		const probeMatch = cleaned.match(/^ST-Link Probe (\d+)/);
		if (probeMatch) {
			reading = true;
			probeIndex = parseInt(probeMatch[1], 10);
		}

		if (reading) {
			const serialNumberMatch = cleaned.match(/^ST-LINK SN\s*:\s*(\S+)/);
			if (serialNumberMatch) {
				probes.push({
					label: `ST-Link #${probeIndex} (${serialNumberMatch[1]})`,
					value: "SWD",
				});
				reading = false;
			}

			if (cleaned.startsWith("=====") && !cleaned.includes("STLink")) {
				reading = false;
			}
		}
	}

	return probes;
};

export const upload = async ({
	outputDir,
	projectName,
	shared,
	verbose = false,
}) => {
	const { existsSync } = await import("node:fs");
	const { join } = await import("node:path");
	const { spawnSync } = await import("node:child_process");

	const binaryPath = join(
		outputDir,
		ARTIFACTS_DIRECTORY_NAME,
		`${projectName}.bin`,
	);
	if (!existsSync(binaryPath)) {
		throw new Error("Binary not found. Run 'compile' first.");
	}

	const cubeProgrammer = shared.findStm32CubeProg({ spawnSync });

	if (!cubeProgrammer) {
		throw new Error(CUBEPROG_NOT_FOUND_MESSAGE);
	}

	await shared.runTool(
		cubeProgrammer,
		["-c", "port=SWD", "mode=UR", "-w", binaryPath, "0x08000000", "-rst"],
		{ timeout: 30000, verbose },
	);
};
