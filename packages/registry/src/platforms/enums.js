export const PLATFORM_CATEGORY = {
	BOARD: "board",
	HOST: "host",
};

export const PIN_MODE = {
	INPUT: "INPUT",
	OUTPUT: "OUTPUT",
	INPUT_PULLUP: "INPUT_PULLUP",
	INPUT_PULLDOWN: "INPUT_PULLDOWN",
	PWM: "PWM",
	ADC: "ADC",
};

export const DATA_TYPE = {
	u8: "u8",
	i8: "i8",
	u16: "u16",
	i16: "i16",
	u32: "u32",
	i32: "i32",
	u64: "u64",
	i64: "i64",
	i128: "i128",
	u128: "u128",
	f32: "f32",
	f64: "f64",
	string: "string",
	char: "char",
	boolean: "boolean",
	void: "void",
};

export const FLOAT64_MODE = {
	NATIVE: "native",
	SOFTWARE: "software",
};

export const INT128_MODE = {
	NATIVE: "native",
	SOFTWARE: "software",
};

export const CONSOLE_OUTPUT = {
	STDOUT: "stdout",
};

export const ASYNC_MODE = {
	SCHEDULER: "scheduler",
};

export const RESTRICTION = {
	ADC_ONLY: "adc-only",
	INPUT_ONLY: "input-only",
	DAC_ONLY: "dac-only",
	INTERNAL_FLASH: "internal-flash",
	DEBUG: "debug",
	SLOW_ONLY: "slow-only",
	OSC_ONLY: "osc-only",
};

export const INTERRUPT_TRIGGER = {
	LOW: "LOW",
	CHANGE: "CHANGE",
	RISING: "RISING",
	FALLING: "FALLING",
};

export const STANDARD_BAUD_RATES = [
	300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200,
];

export const DEFAULT_TYPES = [
	DATA_TYPE.u8,
	DATA_TYPE.i8,
	DATA_TYPE.u16,
	DATA_TYPE.i16,
	DATA_TYPE.u32,
	DATA_TYPE.i32,
	DATA_TYPE.u64,
	DATA_TYPE.i64,
	DATA_TYPE.i128,
	DATA_TYPE.u128,
	DATA_TYPE.f32,
	DATA_TYPE.f64,
	DATA_TYPE.string,
	DATA_TYPE.char,
	DATA_TYPE.boolean,
	DATA_TYPE.void,
];
