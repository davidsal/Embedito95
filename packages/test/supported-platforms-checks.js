import {
	comparePlatforms,
	PLATFORM_CATEGORY,
	platforms,
	supportedPlatforms,
} from "embedito95-registry/platforms";
import {
	checkPlatformRequirements,
	ensurePlatformRequirements,
	getPlatformRequirements,
} from "../cli/src/commands/shared/requirements.js";
import { expectEqual } from "./reporting.js";

const UNSUPPORTED_PLATFORM_NAME = "nodemcu32s";
const MACOS_PLATFORM_NAME = "macos-arm64";
const MACOS_DISPLAY_NAME = "macOS - ARM64";
const MISSING_STRATEGY_NAME = "posix";
const MISSING_STRATEGY_REQUIREMENT_LABEL = "Platform toolchain";
const MISSING_STRATEGY_FIX_HINT =
	"Compilation for this platform is not implemented yet";
const EXPECTED_SUPPORTED_PLATFORM_NAMES = [
	"arduino-nano",
	"arduino-uno",
	"stm32-bluepill",
	MACOS_PLATFORM_NAME,
];
const EXPECTED_CATALOG_PLATFORM_NAMES = [
	"arduino-nano",
	"arduino-uno",
	"stm32-bluepill",
	UNSUPPORTED_PLATFORM_NAME,
	MACOS_PLATFORM_NAME,
];
const MIXED_CATEGORY_PLATFORMS = [
	{
		name: "host-platform",
		category: PLATFORM_CATEGORY.HOST,
		order: 1,
	},
	{
		name: "second-board",
		category: PLATFORM_CATEGORY.BOARD,
		order: 20,
	},
	{
		name: "first-board",
		category: PLATFORM_CATEGORY.BOARD,
		order: 10,
	},
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

const checkPlatformOrder = () => {
	return [
		expectEqual(
			"supported platforms keep the menu order with the host target last",
			listPlatformNames(supportedPlatforms).join(","),
			EXPECTED_SUPPORTED_PLATFORM_NAMES.join(","),
		),
		expectEqual(
			"platform catalog keeps the declared metadata order",
			listPlatformNames(platforms).join(","),
			EXPECTED_CATALOG_PLATFORM_NAMES.join(","),
		),
	];
};

const checkHostPlatformIsLast = () => {
	const lastSupportedPlatform =
		supportedPlatforms[supportedPlatforms.length - 1];
	const precedingCategories = supportedPlatforms
		.slice(0, -1)
		.map((platform) => {
			return platform.category;
		});

	return [
		expectEqual(
			"the last supported platform is a host target",
			lastSupportedPlatform?.category,
			PLATFORM_CATEGORY.HOST,
		),
		expectEqual(
			"every platform before the host target is a board",
			precedingCategories.every((category) => {
				return category === PLATFORM_CATEGORY.BOARD;
			}),
			true,
		),
	];
};

const checkMixedCategoryOrdering = () => {
	const sortedPlatforms = [...MIXED_CATEGORY_PLATFORMS].sort(comparePlatforms);

	return [
		expectEqual(
			"platform ordering groups boards before host targets",
			listPlatformNames(sortedPlatforms).join(","),
			"first-board,second-board,host-platform",
		),
	];
};

const findMacosPlatform = () => {
	return supportedPlatforms.find((platform) => {
		return platform.name === MACOS_PLATFORM_NAME;
	});
};

const checkMacosPlatformIsSelectable = () => {
	const macosPlatform = findMacosPlatform();

	return [
		expectEqual(
			"supported platforms expose macos-arm64",
			Boolean(macosPlatform),
			true,
		),
		expectEqual(
			"macos-arm64 display name is macOS - ARM64",
			macosPlatform?.displayName,
			MACOS_DISPLAY_NAME,
		),
	];
};

const checkPlatformWithoutStrategyIsHandled = async () => {
	const platform = {
		name: MACOS_PLATFORM_NAME,
		strategy: MISSING_STRATEGY_NAME,
	};
	const strategyTable = {};
	const requirements = getPlatformRequirements({
		platform,
		strategyTable,
	});
	const ensuredRequirements = await ensurePlatformRequirements({
		platform,
		strategyTable,
		spawnSync: () => {},
	});
	const checkedRequirements = await checkPlatformRequirements({
		platform,
		strategyTable,
	});

	return [
		expectEqual(
			"platform without strategy reports one requirement",
			requirements.length,
			1,
		),
		expectEqual(
			"platform without strategy reports a missing toolchain",
			requirements[0].label,
			MISSING_STRATEGY_REQUIREMENT_LABEL,
		),
		expectEqual(
			"platform without strategy keeps the requirement unsatisfied",
			requirements[0].satisfied,
			false,
		),
		expectEqual(
			"platform without strategy explains the missing compilation",
			requirements[0].fixHint,
			MISSING_STRATEGY_FIX_HINT,
		),
		expectEqual(
			"ensurePlatformRequirements handles a platform without strategy",
			ensuredRequirements[0].satisfied,
			false,
		),
		expectEqual(
			"checkPlatformRequirements handles a platform without strategy",
			checkedRequirements[0].satisfied,
			false,
		),
	];
};

export const runSupportedPlatformsChecks = async () => {
	return [
		...checkNodemcu32sIsHiddenFromSupportedList(),
		...checkAvrAndStm32PlatformsRemainSupported(),
		...checkSupportedListOnlyContainsSupportedPlatforms(),
		...checkPlatformOrder(),
		...checkHostPlatformIsLast(),
		...checkMixedCategoryOrdering(),
		...checkMacosPlatformIsSelectable(),
		...(await checkPlatformWithoutStrategyIsHandled()),
	];
};
