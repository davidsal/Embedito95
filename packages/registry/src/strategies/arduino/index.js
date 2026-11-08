import { spawnSync } from "node:child_process";
import {
	CORE_LIBRARIES_DIRECTORY_NAME,
	LIBRARIES_DIRECTORY_NAME,
	MODULES_DIRECTORY_NAME,
} from "../shared/directories.js";
import { profile } from "./profile.js";

const FWRAPV_BUILD_PROPERTY = "build.extra_flags=-fwrapv";
const ARDUINO_CLI_COMMAND = "arduino-cli";
const ARDUINO_CLI_REQUIREMENT_LABEL = "arduino-cli installed";
const BOARD_PACKAGE_LABEL_PREFIX = "Board package";
const BOARD_PACKAGE_SEGMENTS = 2;

const FQBN_BY_PLATFORM = {
	"arduino-nano": {
		compile: "arduino:avr:nano",
		upload: [
			{ name: "New (115200 baud)", value: "arduino:avr:nano" },
			{ name: "Old (57600 baud)", value: "arduino:avr:nano:cpu=atmega328old" },
		],
	},
	"arduino-uno": {
		compile: "arduino:avr:uno",
		upload: [{ name: "Default", value: "arduino:avr:uno" }],
	},
	nodemcu32s: {
		compile: "esp32:esp32:nodemcu-32s",
		upload: [{ name: "Default", value: "esp32:esp32:nodemcu-32s" }],
	},
};

const detectPorts = async ({ shared }) => {
	return shared.detectUsbSerialPorts();
};

const isArduinoCliInstalled = () => {
	const result = spawnSync(ARDUINO_CLI_COMMAND, ["version"], {
		stdio: "pipe",
	});
	return result.status === 0;
};

const readInstalledBoardPackages = ({ output }) => {
	try {
		const parsed = JSON.parse(output);
		const platforms = parsed.platforms;

		if (!Array.isArray(platforms)) {
			return [];
		}

		return platforms
			.map((platform) => platform.id)
			.filter((identifier) => typeof identifier === "string");
	} catch {
		return [];
	}
};

const listInstalledBoardPackages = () => {
	const result = spawnSync(
		ARDUINO_CLI_COMMAND,
		["core", "list", "--format", "json"],
		{ stdio: "pipe", encoding: "utf8" },
	);

	if (result.status !== 0) {
		return [];
	}

	return readInstalledBoardPackages({ output: result.stdout });
};

const getCompileFqbn = ({ platform }) => {
	const fqbn = FQBN_BY_PLATFORM[platform.name]?.compile;

	if (!fqbn) {
		throw new Error(`No compile FQBN for platform "${platform.name}"`);
	}

	return fqbn;
};

const doctorRequirements = ({ platform }) => {
	const fqbn = getCompileFqbn({ platform });
	const boardPackage = fqbn
		.split(":")
		.slice(0, BOARD_PACKAGE_SEGMENTS)
		.join(":");
	const arduinoCliInstalled = isArduinoCliInstalled();
	const installedPackages = arduinoCliInstalled
		? listInstalledBoardPackages()
		: [];

	return [
		{ label: ARDUINO_CLI_REQUIREMENT_LABEL, satisfied: arduinoCliInstalled },
		{
			label: `${BOARD_PACKAGE_LABEL_PREFIX} ${boardPackage} installed`,
			satisfied: installedPackages.includes(boardPackage),
			fixHint: `Run: ${ARDUINO_CLI_COMMAND} core install ${boardPackage}`,
		},
	];
};

const renderProjectInclude = ({ headerFileName }) => {
	return `#include <${headerFileName}>`;
};

const renderModuleInclude = ({ headerFileName }) => {
	return `#include <${headerFileName}>`;
};

const renderDependencyInclude = ({ headerFileName }) => {
	return `#include <${headerFileName}>`;
};

const generate = ({
	ast,
	sourceLines,
	platform,
	shared,
	libraryModules = {},
	libraryFunctions = {},
	libraryEnumInfo = {},
	libraryObjectTypes = {},
	libraryObjectInfo = null,
	additionalParts,
	additionalUserObjectMethods,
	libraryParts,
	moduleParts,
	libraryNamespaces,
}) => {
	const { renderStringLiteral, flashStrings } =
		shared.resolvePlatformRenderOptions(platform);
	return shared.generateCode({
		ast,
		sourceLines,
		platform,
		libraryModules,
		libraryFunctions,
		libraryEnumInfo,
		libraryObjectTypes,
		libraryObjectInfo,
		mainGenerator: shared.resolveMainEntryGenerator(profile.mainEntry),
		renderStringLiteral,
		flashStrings,
		additionalParts,
		additionalUserObjectMethods,
		libraryParts,
		moduleParts,
		libraryNamespaces,
	});
};

const parseArduinoSize = (output) => {
	const json = JSON.parse(output);
	const sections = json.builder_result?.executable_sections_size ?? [];
	const flash = sections.find((section) => section.name === "text");
	const ram = sections.find((section) => section.name === "data");

	if (!flash || !ram) {
		return null;
	}

	return {
		flashUsed: String(flash.size),
		flashPct: ((flash.size / flash.max_size) * 100).toFixed(1),
		flashMax: String(flash.max_size),
		ramUsed: String(ram.size),
		ramPct: ((ram.size / ram.max_size) * 100).toFixed(1),
		ramMax: String(ram.max_size),
	};
};

const compile = async ({
	outputDir,
	projectName: _projectName,
	platform,
	shared,
}) => {
	const { join } = await import("node:path");
	const { existsSync } = await import("node:fs");
	const fqbn = getCompileFqbn({ platform });
	const librariesDirectory = join(outputDir, LIBRARIES_DIRECTORY_NAME);
	const coreLibrariesDirectory = join(outputDir, CORE_LIBRARIES_DIRECTORY_NAME);
	const modulesDirectory = join(outputDir, MODULES_DIRECTORY_NAME);
	const libraryArguments = [
		"--libraries",
		coreLibrariesDirectory,
		"--libraries",
		librariesDirectory,
	];
	if (existsSync(modulesDirectory)) {
		libraryArguments.push("--libraries", modulesDirectory);
	}
	const output = await shared.runTool(
		"arduino-cli",
		[
			"compile",
			"--fqbn",
			fqbn,
			...libraryArguments,
			"--build-property",
			FWRAPV_BUILD_PROPERTY,
			"--json",
			outputDir,
		],
		{ capture: true },
	);
	const sizes = parseArduinoSize(output);
	console.log(
		`\x1b[32m✔\x1b[39m Compiled   Flash: ${sizes?.flashUsed ?? "?"} / ${sizes?.flashMax ?? "?"} (${sizes?.flashPct ?? "?"}%) | RAM: ${sizes?.ramUsed ?? "?"} / ${sizes?.ramMax ?? "?"} (${sizes?.ramPct ?? "?"}%)`,
	);
};

const upload = async ({
	outputDir,
	projectName: _projectName,
	platform,
	port,
	shared,
	verbose = false,
	select: selectFunction,
	rememberedBootloader = null,
}) => {
	const bootloaderOptions = FQBN_BY_PLATFORM[platform.name]?.upload;
	const bootloaderDefaultIndex = bootloaderOptions
		? Math.max(
				0,
				bootloaderOptions.findIndex(
					(option) => option.value === rememberedBootloader,
				),
			)
		: 0;
	const fqbn = bootloaderOptions
		? selectFunction
			? await selectFunction({
					message: "Bootloader",
					choices: bootloaderOptions,
					defaultIndex: bootloaderDefaultIndex,
				})
			: bootloaderOptions[0].value
		: null;
	if (!fqbn) {
		throw new Error(`No upload FQBN for platform "${platform.name}"`);
	}
	const uploadArguments = ["upload", "--fqbn", fqbn];
	if (port) {
		uploadArguments.push("--port", port);
	}
	uploadArguments.push(outputDir);
	await shared.runTool("arduino-cli", uploadArguments, { verbose });
	return { bootloader: fqbn };
};

export const strategy = {
	name: "arduino",
	package: "@embedito95/arduino-strategy",
	version: "0.1.0",
	...profile,
	generate,
	renderProjectInclude,
	renderModuleInclude,
	renderDependencyInclude,
	compile,
	upload,
	detectPorts,
	doctorRequirements,
};
