import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLATFORMS_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const INDEX_FILE_NAME = "index.js";
const SHARED_FILE_NAME = "enums.js";

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

	return platformList;
})();

const isPlatformSupported = (platform) => {
	return platform.supported !== false;
};

export const supportedPlatforms = platforms.filter(isPlatformSupported);
