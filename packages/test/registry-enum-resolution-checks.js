import { resolveEnumMemberFromPrefixes } from "../registry/src/strategies/shared/enum-member-resolution.js";
import { resolveEnumMember as resolveGpioEnumMember } from "../registry/src/strategies/shared/gpio/common.js";
import { resolveEnumMember as resolveI2cEnumMember } from "../registry/src/strategies/shared/i2c/common.js";
import { resolveEnumMember as resolveSerialEnumMember } from "../registry/src/strategies/shared/serial/common.js";
import { resolveEnumMember as resolveSpiEnumMember } from "../registry/src/strategies/shared/spi/common.js";
import { expectEqual } from "./reporting.js";

const SAMPLE_PREFIX_BY_MODULE = { Sample: "core_sample::" };

const checkGenericResolver = () => {
	return [
		expectEqual(
			"generic resolver prefixes a known module",
			resolveEnumMemberFromPrefixes(
				SAMPLE_PREFIX_BY_MODULE,
				"Sample",
				"MEMBER",
			),
			"core_sample::MEMBER",
		),
		expectEqual(
			"generic resolver returns null for an unknown module",
			resolveEnumMemberFromPrefixes(SAMPLE_PREFIX_BY_MODULE, "Other", "MEMBER"),
			null,
		),
	];
};

const checkGpioResolver = () => {
	return [
		expectEqual(
			"gpio Pin members carry the PIN_ prefix",
			resolveGpioEnumMember("Pin", "LED_BUILTIN"),
			"core_gpio::Pin::PIN_LED_BUILTIN",
		),
		expectEqual(
			"gpio PinMode members stay in the core_gpio namespace",
			resolveGpioEnumMember("PinMode", "OUTPUT"),
			"core_gpio::OUTPUT",
		),
		expectEqual(
			"gpio DigitalLevel members stay in the core_gpio namespace",
			resolveGpioEnumMember("DigitalLevel", "HIGH"),
			"core_gpio::HIGH",
		),
		expectEqual(
			"gpio BitOrder members stay in the core_gpio namespace",
			resolveGpioEnumMember("BitOrder", "MSB_FIRST"),
			"core_gpio::MSB_FIRST",
		),
		expectEqual(
			"gpio VoltageReference members stay in the core_gpio namespace",
			resolveGpioEnumMember("VoltageReference", "INTERNAL"),
			"core_gpio::INTERNAL",
		),
		expectEqual(
			"gpio resolver returns null for an unrelated module",
			resolveGpioEnumMember("Serial", "SERIAL_1"),
			null,
		),
	];
};

const checkLibraryResolvers = () => {
	return [
		expectEqual(
			"i2c resolver maps its I2C member",
			resolveI2cEnumMember("I2C", "1"),
			"core_i2c::I2C::I2C_1",
		),
		expectEqual(
			"i2c resolver ignores other modules",
			resolveI2cEnumMember("SPI", "1"),
			null,
		),
		expectEqual(
			"serial resolver maps its Serial member",
			resolveSerialEnumMember("Serial", "1"),
			"core_serial::Serial::SERIAL_1",
		),
		expectEqual(
			"serial resolver ignores other modules",
			resolveSerialEnumMember("I2C", "1"),
			null,
		),
		expectEqual(
			"spi resolver maps its SPI member",
			resolveSpiEnumMember("SPI", "1"),
			"core_spi::SPI::SPI_1",
		),
		expectEqual(
			"spi resolver ignores other modules",
			resolveSpiEnumMember("Serial", "1"),
			null,
		),
	];
};

export const runRegistryEnumResolutionChecks = () => {
	return [
		...checkGenericResolver(),
		...checkGpioResolver(),
		...checkLibraryResolvers(),
	];
};
