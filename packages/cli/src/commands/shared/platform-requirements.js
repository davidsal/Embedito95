export const matchesPlatformCapabilities = (requirements, platform) => {
	if (!requirements || !platform) {
		return false;
	}

	return Object.entries(requirements).every(([name, expected]) => {
		return platform[name] === expected;
	});
};

export const meetsPlatformRequirements = (configuration, platform) => {
	const platformRequirements = configuration?.requires?.platform;

	if (!platformRequirements) {
		return true;
	}

	return matchesPlatformCapabilities(platformRequirements, platform);
};
