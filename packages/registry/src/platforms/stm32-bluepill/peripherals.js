import { INTERRUPT_TRIGGER, STANDARD_BAUD_RATES } from "../enums.js";
import { DIGITAL_MODES } from "./modes.js";
import { pins } from "./pins.js";

const EXTENDED_BAUD_RATES = [230400, 460800, 921600, 1000000, 2000000];

const SERIAL_BAUD_RATES = [
	...STANDARD_BAUD_RATES.filter((rate) => rate >= 1200),
	...EXTENDED_BAUD_RATES,
];

export const pinModes = {
	available: DIGITAL_MODES,
};

export const spi = {
	available: [
		{
			name: "SPI_1",
			number: 1,
			bus: "APB2",
			mosi: "A7",
			miso: "A6",
			sck: "A5",
			ss: "A4",
		},
		{
			name: "SPI_2",
			number: 2,
			bus: "APB1",
			mosi: "B15",
			miso: "B14",
			sck: "B13",
			ss: "B12",
		},
	],
};

export const i2c = {
	available: [
		{ name: "I2C_1", number: 1, sda: "B7", scl: "B6" },
		{ name: "I2C_2", number: 2, sda: "B11", scl: "B10" },
	],
};

export const serial = {
	available: [
		{
			name: "SERIAL_1",
			number: 1,
			bus: "APB2",
			rx: "A10",
			tx: "A9",
			clock: 72000000,
			baudRates: SERIAL_BAUD_RATES,
		},
		{
			name: "SERIAL_2",
			number: 2,
			bus: "APB1",
			rx: "A3",
			tx: "A2",
			clock: 72000000,
			baudRates: SERIAL_BAUD_RATES,
		},
		{
			name: "SERIAL_3",
			number: 3,
			bus: "APB1",
			rx: "B11",
			tx: "B10",
			clock: 72000000,
			baudRates: SERIAL_BAUD_RATES,
		},
	],
};

// TIM1 is clocked from APB2; TIM2..TIM4 from APB1. Both timer kernels run at
// 72 MHz on the Blue Pill clock tree (PCLK1 is 36 MHz and the APB1 timer clock
// doubles it).
export const timers = {
	available: [
		{
			name: "TIMER_1",
			number: 1,
			resolution: 16,
			bus: "APB2",
			clock: 72000000,
		},
		{
			name: "TIMER_2",
			number: 2,
			resolution: 16,
			bus: "APB1",
			clock: 72000000,
		},
		{
			name: "TIMER_3",
			number: 3,
			resolution: 16,
			bus: "APB1",
			clock: 72000000,
		},
		{
			name: "TIMER_4",
			number: 4,
			resolution: 16,
			bus: "APB1",
			clock: 72000000,
		},
	],
};

export const adc = {
	peripheral: "ADC1",
	clockEnable: "LL_APB2_GRP1_PERIPH_ADC1",
	clockDivider: "LL_RCC_ADC_CLKSRC_PCLK2_DIV_6",
	samplingCycles: "LL_ADC_SAMPLINGTIME_71CYCLES_5",
	available: [
		{ pin: "A0", channel: 0, resolution: 12, maxValue: 4095 },
		{ pin: "A1", channel: 1, resolution: 12, maxValue: 4095 },
		{ pin: "A2", channel: 2, resolution: 12, maxValue: 4095 },
		{ pin: "A3", channel: 3, resolution: 12, maxValue: 4095 },
		{ pin: "A4", channel: 4, resolution: 12, maxValue: 4095 },
		{ pin: "A5", channel: 5, resolution: 12, maxValue: 4095 },
		{ pin: "A6", channel: 6, resolution: 12, maxValue: 4095 },
		{ pin: "A7", channel: 7, resolution: 12, maxValue: 4095 },
		{ pin: "B0", channel: 8, resolution: 12, maxValue: 4095 },
		{ pin: "B1", channel: 9, resolution: 12, maxValue: 4095 },
	],
};

// EXTI0..EXTI15 are selected by the pin *number*, not by the port: PA0, PB0 and
// PC0 all feed EXTI0 through AFIO_EXTICR. Only one pin per line can be attached
// at a time and the last attach wins; the backend does not detect the conflict.
// Every port pin with a digital mode exposes the line equal to its bit. Aliases
// such as LED_BUILTIN declare their own port/bit, so they are resolved by that
// mapping instead of the pin label.
const INTERRUPT_TRIGGERS = [
	INTERRUPT_TRIGGER.LOW,
	INTERRUPT_TRIGGER.CHANGE,
	INTERRUPT_TRIGGER.RISING,
	INTERRUPT_TRIGGER.FALLING,
];

const buildInterruptEntry = (pinName, pin) => {
	return {
		name: `EXTI_${pinName}`,
		pin: pinName,
		line: pin.bit,
		triggers: INTERRUPT_TRIGGERS,
	};
};

const hasInterruptLine = (pin) => {
	return pin.port !== undefined && pin.modes.length > 0;
};

const buildInterruptEntries = (pinTable) => {
	return Object.entries(pinTable)
		.filter(([, pin]) => {
			return hasInterruptLine(pin);
		})
		.map(([pinName, pin]) => {
			return buildInterruptEntry(pinName, pin);
		});
};

export const interrupts = {
	available: buildInterruptEntries(pins),
};

const PWM_FREQUENCY = 1000;
const PWM_RESOLUTION = 16;
const PWM_MAX_VALUE = 65535;

const buildPwmEntry = ({ pin, timer, channel }) => {
	return {
		pin,
		timer,
		channel,
		frequency: PWM_FREQUENCY,
		resolution: PWM_RESOLUTION,
		maxValue: PWM_MAX_VALUE,
	};
};

export const pwm = {
	available: [
		buildPwmEntry({ pin: "A0", timer: "TIM2", channel: "CH1" }),
		buildPwmEntry({ pin: "A1", timer: "TIM2", channel: "CH2" }),
		buildPwmEntry({ pin: "A2", timer: "TIM2", channel: "CH3" }),
		buildPwmEntry({ pin: "A3", timer: "TIM2", channel: "CH4" }),
		buildPwmEntry({ pin: "A6", timer: "TIM3", channel: "CH1" }),
		buildPwmEntry({ pin: "A7", timer: "TIM3", channel: "CH2" }),
		buildPwmEntry({ pin: "B0", timer: "TIM3", channel: "CH3" }),
		buildPwmEntry({ pin: "B1", timer: "TIM3", channel: "CH4" }),
		buildPwmEntry({ pin: "B6", timer: "TIM4", channel: "CH1" }),
		buildPwmEntry({ pin: "B7", timer: "TIM4", channel: "CH2" }),
		buildPwmEntry({ pin: "B8", timer: "TIM4", channel: "CH3" }),
		buildPwmEntry({ pin: "B9", timer: "TIM4", channel: "CH4" }),
	],
};
