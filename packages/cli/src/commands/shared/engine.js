import { loadProjectEngine } from "embedito95-core";
import { strategies } from "embedito95-registry/strategies";
import { writeErrorLine } from "../../console.js";
import { getCurrentWorkingDirectory } from "./paths.js";

const EXIT_FAILURE_CODE = 1;

const buildUnsupportedPlatformMessage = (platformName) => {
	return `Platform "${platformName}" is not supported by this CLI. Update "platform" in config.json to a supported board`;
};

const exitIfPlatformUnsupported = (platform) => {
	if (platform.supported === false) {
		writeErrorLine(buildUnsupportedPlatformMessage(platform.name));
		process.exit(EXIT_FAILURE_CODE);
	}
};

export const loadEngineModules = async (capability, errorMessage) => {
	try {
		const platform = await loadProjectEngine(getCurrentWorkingDirectory());
		exitIfPlatformUnsupported(platform);
		const strategy = strategies[platform.strategy];

		if (!strategy?.[capability]) {
			throw new Error(
				`Strategy "${platform.strategy}" does not provide "${capability}"`,
			);
		}

		return { strategy, platform };
	} catch {
		writeErrorLine(errorMessage);
		process.exit(1);
	}
};
