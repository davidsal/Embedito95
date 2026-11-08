import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, COMMON_SOURCE } = loadTemplates(import.meta, {
	TEMPLATE: "spi.h",
	COMMON_SOURCE: "../../shared/spi/spi_common.inc",
});

import { resolveEnumMember } from "../../shared/spi/common.js";

const listSpiEntries = (spi) => {
	return (spi?.available ?? []).filter((entry) => entry?.name);
};

const buildSpiSupport = (spi) => {
	const entries = listSpiEntries(spi);
	const lines = [];

	const enumMembers = entries
		.map((entry) => `\t${entry.name} = ${entry.number}`)
		.join(",\n");
	lines.push(`typedef enum : u8 {\n${enumMembers}\n} SPI;\n`);

	const cases = entries
		.map((entry) => {
			const object = entry.object ?? "SPI";
			return [
				`\t\tcase SPI::${entry.name}: {`,
				`\t\t\tstatic SpiBus bus(::${object});`,
				"\t\t\treturn bus;",
				"\t\t}",
			].join("\n");
		})
		.join("\n");
	lines.push(
		"",
		"inline SpiBus getSPI(SPI selector) {",
		"\tswitch (selector) {",
		cases,
		`\t\tdefault:\n\t\t\treturn SpiBus();`,
		"\t}",
		"}",
	);

	return lines.join("\n");
};

const renderInclude = () => {
	return renderArtifactInclude("spi");
};

const generateSupport = (platform) => {
	const spiSupport = buildSpiSupport(platform?.spi);
	return TEMPLATE.replace(
		"_e95_replace_spiCommon",
		COMMON_SOURCE.trimEnd(),
	).replace("_e95_replace_spiSupport", spiSupport);
};

export const definition = {
	name: "arduino",
	dependencies: ["type"],
	resolveEnumMember,
	renderInclude,
	generateSupport,
};
