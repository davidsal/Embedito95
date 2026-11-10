import {
	DEFAULT_TYPES,
	FLOAT64_MODE,
	INTERRUPT_TRIGGER,
	PIN_MODE,
	STANDARD_BAUD_RATES,
} from "./enums.js";

export const platform = {
	name: "arduino-uno",
	package: "@embedito95/arduino-uno",
	version: "0.1.0",
	strategy: "arduino",
	displayName: "Arduino Uno",
	types: DEFAULT_TYPES,
	float64: FLOAT64_MODE.SOFTWARE,
	pins: {
		0: {
			name: "RX",
			port: "D",
			bit: 0,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		1: {
			name: "TX",
			port: "D",
			bit: 1,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		2: {
			port: "D",
			bit: 2,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		3: {
			port: "D",
			bit: 3,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		4: {
			port: "D",
			bit: 4,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		5: {
			port: "D",
			bit: 5,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		6: {
			port: "D",
			bit: 6,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		7: {
			port: "D",
			bit: 7,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		8: {
			port: "B",
			bit: 0,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		9: {
			port: "B",
			bit: 1,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		10: {
			port: "B",
			bit: 2,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		11: {
			port: "B",
			bit: 3,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		12: {
			port: "B",
			bit: 4,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		13: {
			port: "B",
			bit: 5,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		LED_BUILTIN: {
			name: "D13",
			value: 13,
			port: "B",
			bit: 5,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		A0: {
			port: "C",
			bit: 0,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		A1: {
			port: "C",
			bit: 1,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		A2: {
			port: "C",
			bit: 2,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		A3: {
			port: "C",
			bit: 3,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		A4: {
			port: "C",
			bit: 4,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
		A5: {
			port: "C",
			bit: 5,
			modes: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
		},
	},
	pinModes: {
		available: [PIN_MODE.INPUT, PIN_MODE.OUTPUT, PIN_MODE.INPUT_PULLUP],
	},
	spi: {
		available: [
			{
				name: "SPI_1",
				number: 1,
				object: "SPI",
				mosi: 11,
				miso: 12,
				sck: 13,
				ss: 10,
			},
		],
	},
	i2c: {
		available: [{ name: "I2C_1", number: 1, sda: "A4", scl: "A5" }],
	},
	serial: {
		available: [
			{
				name: "SERIAL_1",
				number: 1,
				object: "Serial",
				rx: 0,
				tx: 1,
				baudRates: STANDARD_BAUD_RATES,
			},
		],
	},
	timers: {
		available: [
			{ name: "TIMER_0", number: 0, resolution: 8, reservedByMillis: true },
			{ name: "TIMER_1", number: 1, resolution: 16 },
			{ name: "TIMER_2", number: 2, resolution: 8 },
		],
	},
	interrupts: {
		available: [
			{
				name: "INTERRUPT_0",
				pin: 2,
				triggers: [
					INTERRUPT_TRIGGER.LOW,
					INTERRUPT_TRIGGER.CHANGE,
					INTERRUPT_TRIGGER.RISING,
					INTERRUPT_TRIGGER.FALLING,
				],
			},
			{
				name: "INTERRUPT_1",
				pin: 3,
				triggers: [
					INTERRUPT_TRIGGER.LOW,
					INTERRUPT_TRIGGER.CHANGE,
					INTERRUPT_TRIGGER.RISING,
					INTERRUPT_TRIGGER.FALLING,
				],
			},
		],
	},
	adc: {
		available: [
			{ pin: "A0", resolution: 10, maxValue: 1023 },
			{ pin: "A1", resolution: 10, maxValue: 1023 },
			{ pin: "A2", resolution: 10, maxValue: 1023 },
			{ pin: "A3", resolution: 10, maxValue: 1023 },
			{ pin: "A4", resolution: 10, maxValue: 1023 },
			{ pin: "A5", resolution: 10, maxValue: 1023 },
		],
	},
	pwm: {
		available: [
			{ pin: 3, frequency: 490, resolution: 8, maxValue: 255 },
			{ pin: 5, frequency: 980, resolution: 8, maxValue: 255 },
			{ pin: 6, frequency: 980, resolution: 8, maxValue: 255 },
			{ pin: 9, frequency: 490, resolution: 8, maxValue: 255 },
			{ pin: 10, frequency: 490, resolution: 8, maxValue: 255 },
			{ pin: 11, frequency: 490, resolution: 8, maxValue: 255 },
		],
	},
	voltage: 5,
	specs: {
		mcu: "ATmega328P",
		arrayGrowthFactor: 1.25,
		architecture: "AVR",
		progmem: true,
		wordSize: 16,
		frequency: 16000000,
		flash: 32768,
		sram: 2048,
		eeprom: 1024,
	},
};
