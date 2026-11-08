import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, COMMON_SOURCE } = loadTemplates(import.meta, {
	TEMPLATE: "i2c.h",
	COMMON_SOURCE: "../../shared/i2c/i2c_common.inc",
});

import { resolveEnumMember } from "../../shared/i2c/common.js";

const buildI2CSupport = (i2c) => {
	const entries = (i2c?.available ?? []).filter((entry) => entry?.name);
	const lines = [];

	const enumMembers = entries
		.map((entry) => `\t${entry.name} = ${entry.number}`)
		.join(",\n");
	lines.push(`typedef enum : u8 {\n${enumMembers}\n} I2C;\n`);

	const cases = entries
		.map((entry) => {
			const busName = entry.name.replace(/^I2C_/, "");
			const wireName = busName === "1" ? "Wire" : `Wire${busName}`;
			return [
				`\t\tcase I2C::${entry.name}: {`,
				`\t\t\tstatic I2CBus bus(${wireName}, ${entry.sda}, ${entry.scl});`,
				"\t\t\treturn bus;",
				"\t\t}",
			].join("\n");
		})
		.join("\n");
	lines.push(
		"",
		"inline I2CBus getI2C(I2C selector) {",
		"\tswitch (selector) {",
		cases,
		`\t\tdefault:\n\t\t\treturn I2CBus();`,
		"\t}",
		"}",
	);

	return lines.join("\n");
};

const renderInclude = () => {
	return renderArtifactInclude("i2c");
};

const generateSupport = (platform) => {
	const support = buildI2CSupport(platform?.i2c);
	return TEMPLATE.replace(
		"_e95_replace_i2cCommon",
		COMMON_SOURCE.trimEnd(),
	).replace("_e95_replace_i2cSupport", support);
};

export const definition = {
	name: "arduino",
	dependencies: ["type"],
	resolveEnumMember,
	renderInclude,
	generateSupport,
};
