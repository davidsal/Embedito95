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

const FLOAT64_HEX_DIGITS = 8;
const FLOAT64_HIGH_OFFSET = 0;
const FLOAT64_LOW_OFFSET = 4;
const FLOAT64_BYTE_LENGTH = 8;

const toHex32 = (value) => {
	return value.toString(16).padStart(FLOAT64_HEX_DIGITS, "0");
};

export const formatFloat64Literal = (value, software) => {
	if (!software) {
		return formatFloat64Value(value);
	}
	const buffer = new ArrayBuffer(FLOAT64_BYTE_LENGTH);
	const view = new DataView(buffer);
	view.setFloat64(0, value);
	const high = view.getUint32(FLOAT64_HIGH_OFFSET);
	const low = view.getUint32(FLOAT64_LOW_OFFSET);
	return `f64::fromBits(0x${toHex32(high)}u, 0x${toHex32(low)}u)`;
};
