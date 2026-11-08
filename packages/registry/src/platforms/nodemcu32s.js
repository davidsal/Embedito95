import { DATA_TYPE, DEFAULT_TYPES } from "./enums.js";
import {
	adc,
	dac,
	i2c,
	pinModes,
	pwm,
	serial,
	spi,
	systemHeaders,
} from "./nodemcu32s/peripherals.js";
import { pins } from "./nodemcu32s/pins.js";

export const platform = {
	name: "nodemcu32s",
	package: "@embedito95/nodemcu32s",
	version: "0.1.0",
	strategy: "arduino",
	displayName: "NodeMCU-32S",
	supported: false,
	types: [...DEFAULT_TYPES, DATA_TYPE.f64],
	pins,
	pinModes,
	spi,
	i2c,
	serial,
	adc,
	dac,
	pwm,
	voltage: 3.3,
	systemHeaders,
	specs: {
		mcu: "ESP-WROOM-32",
		arrayGrowthFactor: 1.5,
		architecture: "Xtensa",
		progmem: false,
		wordSize: 32,
		frequency: 240000000,
		flash: 4194304,
		sram: 524288,
	},
};
