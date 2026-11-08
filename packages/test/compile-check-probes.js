// Toolchain availability probes for `test:compile`. Each platform is probed
// independently so a missing toolchain produces an explicit SKIP instead of a
// failure, matching the `stm32-toolchain.js` pattern.
import { spawnSync } from "node:child_process";
import { shared, UTF8 } from "embedito95-core";
import {
	ARDUINO_CLI_COMMAND,
	ARDUINO_CORE_IDENTIFIER,
	COMPILE_PLATFORM_KIND,
	COMPILE_PLATFORM_KIND_BY_PLATFORM,
} from "./constants.js";
import { findFirmwareRoot, findStm32Compiler } from "./stm32-toolchain.js";

const readInstalledArduinoCoreIdentifiers = ({ command }) => {
	const result = spawnSync(command, ["core", "list", "--format", "json"], {
		stdio: "pipe",
		encoding: UTF8,
	});

	if (result.status !== 0) {
		return [];
	}

	try {
		const parsed = JSON.parse(result.stdout);
		const platforms = Array.isArray(parsed.platforms) ? parsed.platforms : [];
		return platforms
			.map((platform) => {
				return platform.id;
			})
			.filter((identifier) => {
				return typeof identifier === "string";
			});
	} catch {
		return [];
	}
};

export const probeArduinoAvailability = ({
	command = ARDUINO_CLI_COMMAND,
} = {}) => {
	const versionResult = spawnSync(command, ["version"], { stdio: "pipe" });

	if (versionResult.status !== 0) {
		return `${command} not found`;
	}

	const installedIdentifiers = readInstalledArduinoCoreIdentifiers({ command });

	if (!installedIdentifiers.includes(ARDUINO_CORE_IDENTIFIER)) {
		return `core ${ARDUINO_CORE_IDENTIFIER} not installed`;
	}

	return null;
};

export const probeStm32Availability = () => {
	if (!findStm32Compiler()) {
		return "arm-none-eabi-g++ not found";
	}

	if (!findFirmwareRoot()) {
		return "CMSIS/LL firmware headers not found";
	}

	if (!shared.findStm32Toolchain()) {
		return "STM32 ARM toolchain not found";
	}

	if (!shared.findStm32FirmwareCache()) {
		return "STM32 CubeF1 firmware cache not found";
	}

	return null;
};

export const resolvePlatformSkip = ({ platformName, probes = {} }) => {
	const kind = COMPILE_PLATFORM_KIND_BY_PLATFORM[platformName];

	if (kind === COMPILE_PLATFORM_KIND.arduino) {
		const probe = probes.arduino ?? probeArduinoAvailability;
		return probe();
	}

	if (kind === COMPILE_PLATFORM_KIND.stm32) {
		const probe = probes.stm32 ?? probeStm32Availability;
		return probe();
	}

	return `unsupported compile platform "${platformName}"`;
};
