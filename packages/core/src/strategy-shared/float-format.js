const FLOAT32_MAX_SIGNIFICANT_DIGITS = 9;

const formatDecimalString = (text) => {
	if (text.includes("e") || text.includes("E")) {
		return text;
	}
	return text.replace(/\.?0+$/, "");
};

export const formatFloat32Value = (value) => {
	const rounded = Math.fround(value);

	if (Number.isInteger(rounded)) {
		return String(rounded);
	}

	for (let digits = 1; digits <= FLOAT32_MAX_SIGNIFICANT_DIGITS; digits++) {
		const candidate = formatDecimalString(rounded.toPrecision(digits));

		if (Math.fround(parseFloat(candidate)) === rounded) {
			return candidate;
		}
	}

	return String(rounded);
};

export const formatFloat64Value = (value) => {
	if (Number.isInteger(value)) {
		return String(value);
	}
	return formatDecimalString(String(value));
};
