import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, SOURCE_TEMPLATE, SLAVE_SOURCE, COMMON_SOURCE } =
	loadTemplates(import.meta, {
		TEMPLATE: "i2c.h",
		SOURCE_TEMPLATE: "i2c.cpp",
		SLAVE_SOURCE: "i2c_slave.inc",
		COMMON_SOURCE: "../../shared/i2c/i2c_common.inc",
	});

import { resolvePinMember } from "../../shared/gpio/common.js";
import { resolveEnumMember } from "../../shared/i2c/common.js";

const listI2CEntries = (i2c) => {
	return (i2c?.available ?? []).filter((entry) => entry?.name);
};

const EVENT_INTERRUPT_SUFFIX = "EV";
const ERROR_INTERRUPT_SUFFIX = "ER";

const listNumericI2CEntries = (i2c) => {
	return (i2c?.available ?? []).filter((entry) => {
		return entry?.number !== undefined && entry?.number !== null;
	});
};

const interruptName = (entry, suffix) => {
	return `I2C${entry.number}_${suffix}_IRQn`;
};

const interruptHandlerName = (entry, suffix) => {
	return `I2C${entry.number}_${suffix}_IRQHandler`;
};

const buildI2CBusDeclarations = (i2c) => {
	const entries = listI2CEntries(i2c);
	const lines = [];

	const enumMembers = entries
		.map((entry) => `\t${entry.name} = ${entry.number}`)
		.join(",\n");
	lines.push(`typedef enum : u8 {\n${enumMembers}\n} I2C;\n`);

	lines.push("", "I2CBus getI2C(I2C selector);");

	return lines.join("\n");
};

const buildGetI2CDefinition = (i2c) => {
	const entries = listI2CEntries(i2c);
	const cases = entries
		.map((entry) => {
			return [
				`\t\tcase I2C::${entry.name}: {`,
				`\t\t\tstatic I2CBus bus(I2C${entry.number}, ${resolvePinMember(entry.sda)}, ${resolvePinMember(entry.scl)});`,
				"\t\t\treturn bus;",
				"\t\t}",
			].join("\n");
		})
		.join("\n");

	return [
		"I2CBus getI2C(I2C selector) {",
		"\tswitch (selector) {",
		cases,
		`\t\tdefault:\n\t\t\treturn I2CBus();`,
		"\t}",
		"}",
	].join("\n");
};

const buildI2CConfigs = (i2c) => {
	return listNumericI2CEntries(i2c)
		.map((entry) => {
			const peripheral = `I2C${entry.number}`;
			return [
				"\t{",
				`\t\t${peripheral},`,
				`\t\tLL_APB1_GRP1_PERIPH_${peripheral},`,
				`\t\t${interruptName(entry, EVENT_INTERRUPT_SUFFIX)},`,
				`\t\t${interruptName(entry, ERROR_INTERRUPT_SUFFIX)},`,
				"\t},",
			].join("\n");
		})
		.join("\n");
};

const buildInterruptHandlers = (i2c) => {
	return listNumericI2CEntries(i2c)
		.map((entry) => {
			const peripheral = `I2C${entry.number}`;
			return [
				`extern "C" void ${interruptHandlerName(entry, EVENT_INTERRUPT_SUFFIX)}(void) {`,
				`\tcore_i2c::i2c_detail::handleEventInterrupt(${peripheral});`,
				"}",
				"",
				`extern "C" void ${interruptHandlerName(entry, ERROR_INTERRUPT_SUFFIX)}(void) {`,
				`\tcore_i2c::i2c_detail::handleErrorInterrupt(${peripheral});`,
				"}",
			].join("\n");
		})
		.join("\n\n");
};

const renderInclude = () => {
	return renderArtifactInclude("i2c");
};

const DEFAULT_APB1_FREQUENCY = 36000000;

const generateSupport = (platform) => {
	const i2cBusDeclarations = buildI2CBusDeclarations(platform?.i2c);
	return TEMPLATE.replace(
		"_e95_replace_i2cCommon",
		COMMON_SOURCE.trimEnd(),
	).replace("_e95_replace_i2cSupport", i2cBusDeclarations);
};

const generateSource = (platform) => {
	const i2cConfigs = buildI2CConfigs(platform?.i2c);
	const getI2CDefinition = buildGetI2CDefinition(platform?.i2c);
	const interruptHandlers = buildInterruptHandlers(platform?.i2c);
	const i2cApb1Clock = platform?.specs?.apb1Frequency ?? DEFAULT_APB1_FREQUENCY;

	return SOURCE_TEMPLATE.replace(
		"_e95_replace_i2cSlave",
		SLAVE_SOURCE.trimEnd(),
	)
		.replace("_e95_replace_i2cConfigs", i2cConfigs)
		.replace("_e95_replace_getI2C", getI2CDefinition)
		.replace("_e95_replace_i2cInterruptHandlers", interruptHandlers)
		.replace("_e95_replace_i2cApb1Clock", i2cApb1Clock);
};

export const definition = {
	name: "stm32-ll",
	dependencies: ["gpio"],
	resolveEnumMember,
	renderInclude,
	generateSupport,
	generateSource,
};
