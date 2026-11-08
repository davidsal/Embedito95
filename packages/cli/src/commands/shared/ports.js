import { select } from "./prompt.js";

export const resolveDefaultPortIndex = (choices, rememberedPort) => {
	if (!rememberedPort) {
		return 0;
	}
	const index = choices.findIndex((choice) => {
		return choice.value === rememberedPort;
	});
	return index >= 0 ? index : 0;
};

export const selectPort = async (message, ports, rememberedPort) => {
	const choices = ports.map((port) => {
		return { name: port.label, value: port.value };
	});
	return select({
		message,
		choices,
		defaultIndex: resolveDefaultPortIndex(choices, rememberedPort),
	});
};
