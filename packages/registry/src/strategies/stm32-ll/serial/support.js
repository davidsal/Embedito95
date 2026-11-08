import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, SOURCE_TEMPLATE, COMMON_SOURCE } = loadTemplates(
	import.meta,
	{
		TEMPLATE: "serial.h",
		SOURCE_TEMPLATE: "serial.cpp",
		COMMON_SOURCE: "../../shared/serial/serial_common.inc",
	},
);

import { resolvePinMember } from "../../shared/gpio/common.js";
import { resolveEnumMember } from "../../shared/serial/common.js";

const DEFAULT_SERIAL_BUS = "APB1";

const listSerialEntries = (serial) => {
	return (serial?.available ?? []).filter(
		(entry) => entry?.number !== undefined && entry?.number !== null,
	);
};

const buildSerialSupport = (serial) => {
	const entries = listSerialEntries(serial);
	const lines = [];

	const enumMembers = entries
		.map((entry) => `\tSERIAL_${entry.number} = ${entry.number}`)
		.join(",\n");
	lines.push(`typedef enum : u8 {\n${enumMembers}\n} Serial;\n`);

	lines.push("", "SerialPort getSerial(Serial selector);");

	return lines.join("\n");
};

const buildGetSerialDefinition = (serial) => {
	const entries = listSerialEntries(serial);
	const cases = entries
		.map((entry) => {
			return [
				`\t\tcase Serial::SERIAL_${entry.number}: {`,
				`\t\t\tstatic SerialPort port(USART${entry.number});`,
				"\t\t\treturn port;",
				"\t\t}",
			].join("\n");
		})
		.join("\n");

	return [
		"SerialPort getSerial(Serial selector) {",
		"\tswitch (selector) {",
		cases,
		`\t\tdefault:\n\t\t\treturn SerialPort();`,
		"\t}",
		"}",
	].join("\n");
};

const buildSerialConfigs = (platform) => {
	const { serial } = platform ?? {};
	const lines = [];

	for (const entry of serial?.available ?? []) {
		if (entry?.number === undefined || entry?.number === null) {
			continue;
		}
		lines.push(
			`\t{ USART${entry.number}, ${resolvePinMember(entry.tx)}, ${resolvePinMember(entry.rx)}, ${entry.clock} },`,
		);
	}

	return lines.join("\n");
};

const buildSerialClocks = (serial) => {
	const lines = [];

	for (const entry of serial?.available ?? []) {
		if (entry?.number === undefined || entry?.number === null) {
			continue;
		}
		const bus = entry.bus ?? DEFAULT_SERIAL_BUS;
		lines.push(
			`\tif (serial == USART${entry.number}) { LL_${bus}_GRP1_EnableClock(LL_${bus}_GRP1_PERIPH_USART${entry.number}); } else`,
		);
	}
	lines.push("\t{ }");

	return lines.join("\n");
};

const renderInclude = () => {
	return renderArtifactInclude("serial");
};

const generateSupport = (platform) => {
	const serialSupport = buildSerialSupport(platform?.serial);

	return TEMPLATE.replace("_e95_replace_serialSupport", serialSupport);
};

const generateSource = (platform) => {
	const serialConfigs = buildSerialConfigs(platform);
	const serialClocks = buildSerialClocks(platform?.serial);
	const getSerialDefinition = buildGetSerialDefinition(platform?.serial);

	let result = SOURCE_TEMPLATE.replace(
		"_e95_replace_serialCommon",
		COMMON_SOURCE.trimEnd(),
	);
	result = result.replace("_e95_replace_serialConfigs", serialConfigs);
	result = result.replace("_e95_replace_serialClocks", serialClocks);
	result = result.replace("_e95_replace_getSerial", getSerialDefinition);
	return result;
};

export const definition = {
	name: "stm32-ll",
	dependencies: ["gpio", "time"],
	resolveEnumMember,
	renderInclude,
	generateSupport,
	generateSource,
};
