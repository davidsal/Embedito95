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

import { resolveEnumMember } from "../../shared/serial/common.js";

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

	const cases = entries
		.map((entry) => {
			const object = entry.object ?? "Serial";
			return [
				`\t\tcase Serial::SERIAL_${entry.number}: {`,
				`\t\t\tstatic SerialPort port(::${object});`,
				"\t\t\treturn port;",
				"\t\t}",
			].join("\n");
		})
		.join("\n");
	lines.push(
		"",
		"inline SerialPort getSerial(Serial selector) {",
		"\tswitch (selector) {",
		cases,
		`\t\tdefault:\n\t\t\treturn SerialPort();`,
		"\t}",
		"}",
	);

	return lines.join("\n");
};

const renderInclude = () => {
	return renderArtifactInclude("serial");
};

const generateSupport = (platform) => {
	const serialSupport = buildSerialSupport(platform?.serial);

	return TEMPLATE.replace("_e95_replace_serialSupport", serialSupport);
};

const generateSource = () => {
	return SOURCE_TEMPLATE.replace(
		"_e95_replace_serialCommon",
		COMMON_SOURCE.trimEnd(),
	);
};

export const definition = {
	name: "arduino",
	dependencies: ["time"],
	resolveEnumMember,
	renderInclude,
	generateSupport,
	generateSource,
};
