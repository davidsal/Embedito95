import { loadTemplates } from "../../shared/templates.js";
import { profile, renderArtifactInclude } from "../profile.js";

const {
	TEMPLATE,
	SOURCE_TEMPLATE,
	STATE_SOURCE,
	STREAM_SOURCE,
	COMMON_SOURCE,
} = loadTemplates(import.meta, {
	TEMPLATE: "software_serial_hardware.h",
	SOURCE_TEMPLATE: "software_serial_hardware.cpp",
	STATE_SOURCE: "software_serial_hardware_state.inc",
	STREAM_SOURCE: "software_serial_hardware_stream.inc",
	COMMON_SOURCE: "../../shared/serial/serial_common.inc",
});

const countUsablePins = (pins) => {
	const usableIndices = Object.values(pins ?? {})
		.map((pin, index) => {
			return (pin?.modes ?? []).length > 0 ? index : -1;
		})
		.filter((index) => {
			return index >= 0;
		});

	if (usableIndices.length === 0) {
		return 0;
	}

	return Math.max(...usableIndices) + 1;
};

const renderInclude = () => {
	return renderArtifactInclude("software_serial_hardware");
};

const generateSupport = (platform) => {
	const pinCount = countUsablePins(platform?.pins);

	return TEMPLATE.replace(
		"_e95_replace_pinCount",
		`const u8 PIN_COUNT = ${pinCount};`,
	);
};

const generateSource = (platform) => {
	const frequency = platform?.specs?.frequency ?? profile.defaults.frequency;

	return SOURCE_TEMPLATE.replaceAll("_e95_replace_frequency", String(frequency))
		.replace("_e95_replace_software_serial_state", STATE_SOURCE.trimEnd())
		.replace("_e95_replace_software_serial_stream", STREAM_SOURCE.trimEnd())
		.replace("_e95_replace_serialCommon", COMMON_SOURCE.trimEnd());
};

export const definition = {
	name: "stm32-ll",
	dependencies: ["type", "gpio", "string", "time"],
	renderInclude,
	generateSupport,
	generateSource,
};
