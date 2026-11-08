export const ARRAY_GROWTH_DIVISOR_MARKER = "_e95_replace_arrayGrowthDivisor";

export const resolveArrayGrowthDivisor = (platform, defaultFactor) => {
	const growthFactor = platform?.specs?.arrayGrowthFactor ?? defaultFactor;
	return Math.round(1 / (growthFactor - 1));
};
