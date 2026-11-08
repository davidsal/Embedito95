export const prepare = async ({ log, shared }) => {
	const installedCache = shared.findStm32FirmwareCache();

	if (installedCache) {
		return installedCache;
	}

	return shared.downloadStm32FirmwareCache({ log });
};
