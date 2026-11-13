import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PLATFORM_CATEGORY } from "./enums.js";

export { PLATFORM_CATEGORY };

const PLATFORMS_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const INDEX_FILE_NAME = "index.js";
const SHARED_FILE_NAME = "enums.js";
const CATEGORY_ORDER = {
	[PLATFORM_CATEGORY.BOARD]: 0,
	[PLATFORM_CATEGORY.HOST]: 1,
};
const DEFAULT_PLATFORM_CATEGORY = PLATFORM_CATEGORY.BOARD;
const DEFAULT_PLATFORM_ORDER = 0;

const getCategoryOrder = (platform) => {
	const category = platform.category ?? DEFAULT_PLATFORM_CATEGORY;
	return CATEGORY_ORDER[category] ?? CATEGORY_ORDER[DEFAULT_PLATFORM_CATEGORY];
};

const getPlatformOrder = (platform) => {
	return platform.order ?? DEFAULT_PLATFORM_ORDER;
};

export const comparePlatforms = (left, right) => {
	const categoryDifference = getCategoryOrder(left) - getCategoryOrder(right);
	if (categoryDifference !== 0) {
		return categoryDifference;
	}

	const orderDifference = getPlatformOrder(left) - getPlatformOrder(right);
	if (orderDifference !== 0) {
		return orderDifference;
	}

	return left.name.localeCompare(right.name);
};

const sortPlatforms = (platformList) => {
	return [...platformList].sort(comparePlatforms);
};

export const platforms = await (async () => {
	const platformList = [];

	for (const fileName of readdirSync(PLATFORMS_DIRECTORY).sort()) {
		if (
			!fileName.endsWith(".js") ||
			fileName === INDEX_FILE_NAME ||
			fileName === SHARED_FILE_NAME
		) {
			continue;
		}

		const module = await import(
			pathToFileURL(join(PLATFORMS_DIRECTORY, fileName)).href
		);

		if (module.platform) {
			platformList.push(module.platform);
		}
	}

	return sortPlatforms(platformList);
})();

const isPlatformSupported = (platform) => {
	return platform.supported !== false;
};

export const supportedPlatforms = platforms.filter(isPlatformSupported);
