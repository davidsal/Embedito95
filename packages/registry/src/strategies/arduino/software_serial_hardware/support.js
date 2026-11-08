import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const {
	TEMPLATE,
	SOURCE_TEMPLATE,
	PINS_SOURCE,
	RECEIVE_SOURCE,
	TRANSMIT_SOURCE,
	STREAM_SOURCE,
	COMMON_SOURCE,
} = loadTemplates(import.meta, {
	TEMPLATE: "software_serial_hardware.h",
	SOURCE_TEMPLATE: "software_serial_hardware.cpp",
	PINS_SOURCE: "software_serial_hardware_pins.inc",
	RECEIVE_SOURCE: "software_serial_hardware_receive.inc",
	TRANSMIT_SOURCE: "software_serial_hardware_transmit.inc",
	STREAM_SOURCE: "software_serial_hardware_stream.inc",
	COMMON_SOURCE: "../../shared/serial/serial_common.inc",
});

const renderInclude = () => {
	return renderArtifactInclude("software_serial_hardware");
};

const generateSupport = () => {
	return TEMPLATE;
};

const replaceSourceFragment = (source, marker, fragment) => {
	return source.replace(marker, fragment.trimEnd());
};

const generateSource = () => {
	const source = replaceSourceFragment(
		SOURCE_TEMPLATE,
		"_e95_replace_software_serial_pins",
		PINS_SOURCE,
	);
	const withReceive = replaceSourceFragment(
		source,
		"_e95_replace_software_serial_receive",
		RECEIVE_SOURCE,
	);
	const withTransmit = replaceSourceFragment(
		withReceive,
		"_e95_replace_software_serial_transmit",
		TRANSMIT_SOURCE,
	);
	const withStream = replaceSourceFragment(
		withTransmit,
		"_e95_replace_software_serial_stream",
		STREAM_SOURCE,
	);
	return replaceSourceFragment(
		withStream,
		"_e95_replace_serialCommon",
		COMMON_SOURCE,
	);
};

export const definition = {
	name: "arduino",
	dependencies: ["type", "gpio", "time"],
	renderInclude,
	generateSupport,
	generateSource,
};
