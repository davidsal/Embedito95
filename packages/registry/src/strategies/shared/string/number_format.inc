// Shared number-to-string formatting for String.
// Single source of truth, inlined into each platform's core source.
const u64 _E95_U16_BASE = 65536;
const u64 _E95_U16_MASK = 0xFFFF;
const u16 _E95_FLOAT_BUFFER_DIGITS = 16;
const i16 _E95_FLOAT_MAX_EXPONENT = 300;
const i16 _E95_FLOAT_SCIENCE_EXPONENT_MIN = -4;
const i16 _E95_FLOAT_SCIENCE_EXPONENT_MAX = 12;

void String::assignSigned32(i32 value) {
	char text[12];
	u16 length = 0;
	u32 magnitude;
	if (value < 0) {
		text[length++] = '-';
		magnitude = (u32)(-(value + 1)) + 1;
	} else {
		magnitude = (u32)value;
	}
	char digits[10];
	u16 digitCount = 0;
	do {
		digits[digitCount++] = (char)('0' + magnitude % 10);
		magnitude /= 10;
	} while (magnitude > 0);
	while (digitCount > 0) {
		text[length++] = digits[--digitCount];
	}
	text[length] = '\0';
	assign(text);
}

void String::assignUnsigned32(u32 value) {
	char text[11];
	u16 length = 0;
	char digits[10];
	u16 digitCount = 0;
	do {
		digits[digitCount++] = (char)('0' + value % 10);
		value /= 10;
	} while (value > 0);
	while (digitCount > 0) {
		text[length++] = digits[--digitCount];
	}
	text[length] = '\0';
	assign(text);
}

void String::assignSigned64(i64 value) {
	char text[21];
	u16 length = 0;
	u64 magnitude;
	if (value < 0) {
		text[length++] = '-';
		magnitude = (u64)(-(value + 1)) + 1;
	} else {
		magnitude = (u64)value;
	}
	char digits[20];
	u16 digitCount = 0;
	do {
		digits[digitCount++] = (char)('0' + magnitude % 10);
		magnitude /= 10;
	} while (magnitude > 0);
	while (digitCount > 0) {
		text[length++] = digits[--digitCount];
	}
	text[length] = '\0';
	assign(text);
}

void String::assignUnsigned64(u64 value) {
	char text[21];
	u16 length = 0;
	char digits[20];
	u16 digitCount = 0;
	do {
		digits[digitCount++] = (char)('0' + value % 10);
		value /= 10;
	} while (value > 0);
	while (digitCount > 0) {
		text[length++] = digits[--digitCount];
	}
	text[length] = '\0';
	assign(text);
}

void String::assignU128(u64 lo, u64 hi, boolean negative) {
	char text[41];
	u16 length = 0;
	if (negative) {
		text[length++] = '-';
	}
	char digits[39];
	u16 digitCount = 0;
	do {
		u16 chunks[8];
		chunks[7] = (u16)(hi >> 48);
		chunks[6] = (u16)((hi >> 32) & _E95_U16_MASK);
		chunks[5] = (u16)((hi >> 16) & _E95_U16_MASK);
		chunks[4] = (u16)(hi & _E95_U16_MASK);
		chunks[3] = (u16)(lo >> 48);
		chunks[2] = (u16)((lo >> 32) & _E95_U16_MASK);
		chunks[1] = (u16)((lo >> 16) & _E95_U16_MASK);
		chunks[0] = (u16)(lo & _E95_U16_MASK);
		u32 remainder = 0;
		for (int i = 7; i >= 0; i--) {
			u32 current = (u32)remainder * _E95_U16_BASE + (u32)chunks[i];
			chunks[i] = (u16)(current / 10);
			remainder = current % 10;
		}
		hi =
			((u64)chunks[7] << 48) | ((u64)chunks[6] << 32) |
			((u64)chunks[5] << 16) | (u64)chunks[4];
		lo =
			((u64)chunks[3] << 48) | ((u64)chunks[2] << 32) |
			((u64)chunks[1] << 16) | (u64)chunks[0];
		digits[digitCount++] = (char)('0' + (u16)remainder);
	} while (hi != 0 || lo != 0);
	while (digitCount > 0) {
		text[length++] = digits[--digitCount];
	}
	text[length] = '\0';
	assign(text);
}

void String::assignFloat(f64 value, u16 maxDigits) {
	char text[48];
	u16 length = 0;
	if (value < STRING_FLOAT_ZERO) {
		text[length++] = '-';
		value = -value;
	}
	if (value == STRING_FLOAT_ZERO) {
		text[length++] = '0';
		text[length] = '\0';
		assign(text);
		return;
	}
	if (value != value) {
		assign("NaN");
		return;
	}
	i16 exponent = 0;
	if (value >= STRING_FLOAT_TEN) {
		while (value >= STRING_FLOAT_TEN && exponent < _E95_FLOAT_MAX_EXPONENT) {
			value /= STRING_FLOAT_TEN;
			exponent++;
		}
	} else if (value < STRING_FLOAT_ONE) {
		while (value < STRING_FLOAT_ONE && exponent > -_E95_FLOAT_MAX_EXPONENT) {
			value *= STRING_FLOAT_TEN;
			exponent--;
		}
	}
	char digits[_E95_FLOAT_BUFFER_DIGITS];
	u16 digitCount = 0;
	for (u16 i = 0; i < maxDigits; i++) {
		i32 digit = (i32)value;
		digits[digitCount++] = (char)('0' + digit);
		value = (value - (f64)digit) * STRING_FLOAT_TEN;
	}
	if (value >= STRING_FLOAT_FIVE) {
		i16 i = (i16)digitCount - 1;
		while (i >= 0) {
			digits[i]++;
			if (digits[i] <= '9') {
				break;
			}
			digits[i] = '0';
			i--;
		}
		if (i < 0) {
			digits[0] = '1';
			digitCount = 1;
			exponent++;
		}
	}
	while (digitCount > 0 && digits[digitCount - 1] == '0') {
		digitCount--;
	}
	if (digitCount == 0) {
		text[length++] = '0';
		text[length] = '\0';
		assign(text);
		return;
	}
	if (
		exponent < _E95_FLOAT_SCIENCE_EXPONENT_MIN ||
		exponent > _E95_FLOAT_SCIENCE_EXPONENT_MAX
	) {
		text[length++] = digits[0];
		if (digitCount > 1) {
			text[length++] = '.';
		}
		for (u16 i = 1; i < digitCount; i++) {
			text[length++] = digits[i];
		}
		text[length++] = 'E';
		text[length++] = exponent < 0 ? '-' : '+';
		i16 magnitude = exponent < 0 ? -exponent : exponent;
		char exponentDigits[3];
		u16 exponentCount = 0;
		do {
			exponentDigits[exponentCount++] = (char)('0' + magnitude % 10);
			magnitude /= 10;
		} while (magnitude > 0);
		while (exponentCount > 0) {
			text[length++] = exponentDigits[--exponentCount];
		}
	} else if (exponent >= 0) {
		for (u16 i = 0; i <= (u16)exponent && i < digitCount; i++) {
			text[length++] = digits[i];
		}
		if ((u16)exponent + 1 < digitCount) {
			text[length++] = '.';
			for (u16 i = (u16)exponent + 1; i < digitCount; i++) {
				text[length++] = digits[i];
			}
		}
		for (u16 i = digitCount; i <= (u16)exponent; i++) {
			text[length++] = '0';
		}
	} else {
		text[length++] = '0';
		text[length++] = '.';
		for (i16 i = -1; i > exponent; i--) {
			text[length++] = '0';
		}
		for (u16 i = 0; i < digitCount; i++) {
			text[length++] = digits[i];
		}
	}
	text[length] = '\0';
	assign(text);
}
