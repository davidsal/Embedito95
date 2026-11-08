import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, SOURCE_TEMPLATE, COMMON_SOURCE } = loadTemplates(
	import.meta,
	{
		TEMPLATE: "spi.h",
		SOURCE_TEMPLATE: "spi.cpp",
		COMMON_SOURCE: "../../shared/spi/spi_common.inc",
	},
);

import { resolvePinMember } from "../../shared/gpio/common.js";
import { resolveEnumMember } from "../../shared/spi/common.js";

const DEFAULT_SPI_BUS = "APB2";

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

	lines.push("", "SpiBus getSPI(SPI selector);");

	return lines.join("\n");
};

const buildGetSpiDefinition = (spi) => {
	const entries = listSpiEntries(spi);
	const cases = entries
		.map((entry) => {
			return [
				`\t\tcase SPI::${entry.name}: {`,
				`\t\t\tstatic SpiBus bus(SPI${entry.number}, ${resolvePinMember(entry.sck)}, ${resolvePinMember(entry.mosi)}, ${resolvePinMember(entry.miso)});`,
				"\t\t\treturn bus;",
				"\t\t}",
			].join("\n");
		})
		.join("\n");

	return [
		"SpiBus getSPI(SPI selector) {",
		"\tswitch (selector) {",
		cases,
		`\t\tdefault:\n\t\t\treturn SpiBus();`,
		"\t}",
		"}",
	].join("\n");
};

const buildSpiClocks = (spi) => {
	const lines = [];

	for (const entry of spi?.available ?? []) {
		if (entry?.number === undefined || entry?.number === null) {
			continue;
		}
		const bus = entry.bus ?? DEFAULT_SPI_BUS;
		lines.push(
			`\tif (spi == SPI${entry.number}) { LL_${bus}_GRP1_EnableClock(LL_${bus}_GRP1_PERIPH_SPI${entry.number}); } else`,
		);
	}
	lines.push("\t{ }");

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

const generateSource = (platform) => {
	const spiClocks = buildSpiClocks(platform?.spi);
	const getSpiDefinition = buildGetSpiDefinition(platform?.spi);

	let result = SOURCE_TEMPLATE;
	result = result.replace("_e95_replace_spiClocks", spiClocks);
	result = result.replace("_e95_replace_getSPI", getSpiDefinition);
	return result;
};

export const definition = {
	name: "stm32-ll",
	dependencies: ["gpio"],
	resolveEnumMember,
	renderInclude,
	generateSupport,
	generateSource,
};
