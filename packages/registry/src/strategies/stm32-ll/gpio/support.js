import { loadTemplates } from "../../shared/templates.js";
import { renderArtifactInclude } from "../profile.js";

const { TEMPLATE, SOURCE_TEMPLATE } = loadTemplates(import.meta, {
	TEMPLATE: "gpio.h",
	SOURCE_TEMPLATE: "gpio.cpp",
});

import {
	buildPinModeMembers,
	resolveEnumMember,
} from "../../shared/gpio/common.js";

const buildGpioPortClocks = (pins) => {
	const ports = new Set();

	for (const pin of Object.values(pins ?? {})) {
		if (pin?.port) {
			ports.add(pin.port);
		}
	}

	return [...ports]
		.map((port) => {
			return `\t{ GPIO${port}, LL_APB2_GRP1_PERIPH_GPIO${port} },`;
		})
		.join("\n");
};

const buildPwmTimers = (pwm) => {
	if (!pwm?.available?.length) {
		return "";
	}

	const timerNames = new Set(pwm.available.map((entry) => entry.timer));
	const lines = [];

	for (const timerName of timerNames) {
		const timerNumber = timerName.replace("TIM", "");
		lines.push(
			`\t{ ${timerNumber}, ${timerName}, LL_APB1_GRP1_PERIPH_${timerName} },`,
		);
	}

	return lines.join("\n");
};

const buildAdcChannelValues = (adc) => {
	const channels = (adc?.available ?? [])
		.map((entry) => entry.channel)
		.filter((channel) => channel !== undefined && channel !== null);

	if (channels.length === 0) {
		return "";
	}

	const maxChannel = Math.max(...channels);

	return Array.from({ length: maxChannel + 1 }, (_, channel) => {
		return `\tLL_ADC_CHANNEL_${channel},`;
	}).join("\n");
};

const buildPinEnum = (pins) => {
	const members = Object.keys(pins ?? {}).map((name, index) => {
		return `\tPIN_${name} = ${index}`;
	});

	const lines = ["typedef enum : u8 {", members.join(",\n"), "} Pin;"];

	if (pins?.LED_BUILTIN) {
		lines.push("", "static constexpr Pin LED_BUILTIN = PIN_LED_BUILTIN;");
	}

	return lines.join("\n");
};

const buildPinsTable = (pins) => {
	return Object.values(pins ?? {})
		.map((pin) => {
			return `\t{ GPIO${pin.port}, LL_GPIO_PIN_${pin.bit} },`;
		})
		.join("\n");
};

const buildPwmTable = (pwm) => {
	if (!pwm?.available?.length) {
		return "";
	}

	const lines = [];

	for (const entry of pwm.available) {
		const timerNumber = entry.timer.replace("TIM", "");
		const channelNumber = entry.channel.replace("CH", "");
		lines.push(`\t{ PIN_${entry.pin}, ${timerNumber}, ${channelNumber} },`);
	}

	return lines.join("\n");
};

const buildAdcTable = (adc) => {
	if (!adc?.available?.length) {
		return "";
	}

	const lines = [];

	for (const entry of adc.available) {
		lines.push(`\t{ PIN_${entry.pin}, ${entry.channel} },`);
	}

	return lines.join("\n");
};

const renderInclude = () => {
	return renderArtifactInclude("gpio");
};

const generateSupport = (platform) => {
	const pins = platform?.pins ?? {};
	const pinEnum = buildPinEnum(pins);
	const pinModeMembers = buildPinModeMembers(platform);

	return TEMPLATE.replace("_e95_replace_pinEnum", pinEnum).replace(
		"_e95_replace_pinModeMembers",
		pinModeMembers,
	);
};

const DEFAULT_TIMER_CLOCK = 72000000;
const DEFAULT_PWM_FREQUENCY = 1000;
const MAX_PWM_PERIOD = 65535;
const DEFAULT_ADC_PERIPHERAL = "ADC1";
const DEFAULT_ADC_CLOCK_ENABLE = "LL_APB2_GRP1_PERIPH_ADC1";
const DEFAULT_ADC_CLOCK_DIVIDER = "LL_RCC_ADC_CLKSRC_PCLK2_DIV_6";
const DEFAULT_ADC_SAMPLING_CYCLES = "LL_ADC_SAMPLINGTIME_71CYCLES_5";

const computePwmTimerConfig = (specs, frequency) => {
	const timerClock = specs?.frequency ?? DEFAULT_TIMER_CLOCK;

	let prescaler = 0;
	let period = Math.floor(timerClock / frequency) - 1;
	while (period > MAX_PWM_PERIOD) {
		prescaler++;
		period = Math.floor(timerClock / ((prescaler + 1) * frequency)) - 1;
	}

	return { prescaler, period };
};

const getTimerFrequency = (pwm, timerName) => {
	const entry = pwm.available.find((entry) => entry.timer === timerName);
	return entry?.frequency ?? DEFAULT_PWM_FREQUENCY;
};

const buildPwmTimerConfigs = (specs, pwm) => {
	if (!pwm?.available?.length) {
		return "";
	}

	const timerNames = new Set(pwm.available.map((entry) => entry.timer));
	const lines = [];

	for (const timerName of timerNames) {
		const { prescaler, period } = computePwmTimerConfig(
			specs,
			getTimerFrequency(pwm, timerName),
		);
		lines.push(`\t{ ${timerName}, ${prescaler}, ${period} },`);
	}

	return lines.join("\n");
};

const generateSource = (platform) => {
	const pwmTable = buildPwmTable(platform?.pwm);
	const adcTable = buildAdcTable(platform?.adc);
	const pwmTimers = buildPwmTimers(platform?.pwm);
	const pwmTimerConfigs = buildPwmTimerConfigs(platform?.specs, platform?.pwm);
	const adcChannelValues = buildAdcChannelValues(platform?.adc);
	const adcChannelCount = (platform?.adc?.available ?? []).length;
	const gpioPortClocks = buildGpioPortClocks(platform?.pins);
	const adcPeripheral = platform?.adc?.peripheral ?? DEFAULT_ADC_PERIPHERAL;
	const adcClockEnable = platform?.adc?.clockEnable ?? DEFAULT_ADC_CLOCK_ENABLE;
	const adcClockDivider =
		platform?.adc?.clockDivider ?? DEFAULT_ADC_CLOCK_DIVIDER;
	const adcSamplingCycles =
		platform?.adc?.samplingCycles ?? DEFAULT_ADC_SAMPLING_CYCLES;

	let result = SOURCE_TEMPLATE;
	result = result.replace(
		"_e95_replace_pinsTable",
		buildPinsTable(platform?.pins),
	);
	result = result.replaceAll("_e95_replace_adcPeripheral", adcPeripheral);
	result = result.replaceAll("_e95_replace_adcClockEnable", adcClockEnable);
	result = result.replaceAll("_e95_replace_adcClockDivider", adcClockDivider);
	result = result.replaceAll(
		"_e95_replace_adcSamplingCycles",
		adcSamplingCycles,
	);
	result = result.replace("_e95_replace_pwmTable", pwmTable);
	result = result.replace("_e95_replace_adcTable", adcTable);
	result = result.replace("_e95_replace_pwmTimers", pwmTimers);
	result = result.replace("_e95_replace_pwmTimerConfigs", pwmTimerConfigs);
	result = result.replace("_e95_replace_adcChannelValues", adcChannelValues);
	result = result.replace("_e95_replace_adcChannelCount", adcChannelCount);
	result = result.replace("_e95_replace_gpioPortClocks", gpioPortClocks);
	return result;
};

export const definition = {
	name: "stm32-ll",
	dependencies: ["type"],
	resolveEnumMember,
	renderInclude,
	generateSupport,
	generateSource,
};
