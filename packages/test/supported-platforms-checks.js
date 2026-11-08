import { platforms, supportedPlatforms } from "embedito95-registry/platforms";
import { expectEqual } from "./reporting.js";

const UNSUPPORTED_PLATFORM_NAME = "nodemcu32s";
const EXPECTED_SUPPORTED_PLATFORM_NAMES = [
	"arduino-nano",
	"arduino-uno",
	"stm32-bluepill",
];

const listPlatformNames = (platformList) => {
	return platformList.map((platform) => {
		return platform.name;
	});
};

const checkNodemcu32sIsHiddenFromSupportedList = () => {
	const supportedPlatformNames = listPlatformNames(supportedPlatforms);
	const catalogPlatformNames = listPlatformNames(platforms);

	return [
		expectEqual(
			"supported platforms exclude nodemcu32s",
			supportedPlatformNames.includes(UNSUPPORTED_PLATFORM_NAME),
			false,
		),
		expectEqual(
			"platform catalog keeps nodemcu32s data",
			catalogPlatformNames.includes(UNSUPPORTED_PLATFORM_NAME),
			true,
		),
	];
};

const checkAvrAndStm32PlatformsRemainSupported = () => {
	const supportedPlatformNames = listPlatformNames(supportedPlatforms);

	return EXPECTED_SUPPORTED_PLATFORM_NAMES.map((platformName) => {
		return expectEqual(
			`supported platforms keep ${platformName}`,
			supportedPlatformNames.includes(platformName),
			true,
		);
	});
};

const checkSupportedListOnlyContainsSupportedPlatforms = () => {
	const unsupportedPlatforms = supportedPlatforms.filter((platform) => {
		return platform.supported === false;
	});

	return [
		expectEqual(
			"supported platforms contain no platform marked as unsupported",
			unsupportedPlatforms.length,
			0,
		),
	];
};

export const runSupportedPlatformsChecks = () => {
	return [
		...checkNodemcu32sIsHiddenFromSupportedList(),
		...checkAvrAndStm32PlatformsRemainSupported(),
		...checkSupportedListOnlyContainsSupportedPlatforms(),
	];
};
