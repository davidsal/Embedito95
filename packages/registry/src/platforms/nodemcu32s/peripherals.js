import { DIGITAL_MODES } from "./modes.js";

const ADC_RESOLUTION = 12;
const ADC_MAX_VALUE = 4095;
const PWM_FREQUENCY = 1000;
const PWM_RESOLUTION = 16;
const PWM_MAX_VALUE = 65535;
const DAC_RESOLUTION = 8;
const DAC_MAX_VALUE = 255;

export const pinModes = {
	available: DIGITAL_MODES,
};

export const spi = {
	available: [
		{
			name: "SPI_1",
			number: 1,
			object: "SPI",
			mosi: 23,
			miso: 19,
			sck: 18,
			ss: 5,
		},
		{
			name: "SPI_2",
			number: 2,
			object: "HSPI",
			mosi: 13,
			miso: 12,
			sck: 14,
			ss: 15,
		},
	],
};

export const i2c = {
	available: [{ name: "I2C_1", number: 1, sda: 21, scl: 22 }],
};

export const serial = {
	available: [
		{ name: "SERIAL_1", number: 1, object: "Serial", rx: 3, tx: 1 },
		{ name: "SERIAL_2", number: 2, object: "Serial1", rx: 16, tx: 17 },
	],
};

const buildAdcEntry = (pin) => {
	return { pin, resolution: ADC_RESOLUTION, maxValue: ADC_MAX_VALUE };
};

export const adc = {
	available: [
		buildAdcEntry(32),
		buildAdcEntry(33),
		buildAdcEntry(34),
		buildAdcEntry(35),
		buildAdcEntry(36),
		buildAdcEntry(39),
		buildAdcEntry(0),
		buildAdcEntry(2),
		buildAdcEntry(4),
		buildAdcEntry(12),
		buildAdcEntry(13),
		buildAdcEntry(14),
		buildAdcEntry(15),
		buildAdcEntry(25),
		buildAdcEntry(26),
		buildAdcEntry(27),
	],
};

export const dac = {
	available: [25, 26],
	resolution: DAC_RESOLUTION,
	maxValue: DAC_MAX_VALUE,
};

const buildPwmEntry = (pin) => {
	return {
		pin,
		frequency: PWM_FREQUENCY,
		resolution: PWM_RESOLUTION,
		maxValue: PWM_MAX_VALUE,
	};
};

export const pwm = {
	available: [
		buildPwmEntry(0),
		buildPwmEntry(2),
		buildPwmEntry(4),
		buildPwmEntry(5),
		buildPwmEntry(12),
		buildPwmEntry(13),
		buildPwmEntry(14),
		buildPwmEntry(15),
		buildPwmEntry(18),
		buildPwmEntry(19),
		buildPwmEntry(21),
		buildPwmEntry(22),
		buildPwmEntry(23),
		buildPwmEntry(25),
		buildPwmEntry(26),
		buildPwmEntry(27),
		buildPwmEntry(32),
		buildPwmEntry(33),
	],
};

export const systemHeaders = [
	{ path: "esp_sleep.h", whenUsed: ["esp_deep_sleep_start"] },
];
