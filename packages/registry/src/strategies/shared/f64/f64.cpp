#include "core_f64.h"

#include <string.h>

namespace {

const uint64_t SIGN_MASK = 0x8000000000000000ULL;
const uint64_t EXPONENT_MASK = 0x7FF0000000000000ULL;
const uint64_t FRACTION_MASK = 0x000FFFFFFFFFFFFFULL;
const uint64_t HIDDEN_BIT = 0x0010000000000000ULL;
const uint64_t MANTISSA_LIMIT = 0x0020000000000000ULL;
const uint64_t QUIET_NAN_BITS = 0x7FF8000000000000ULL;
const uint64_t POSITIVE_INFINITY_BITS = 0x7FF0000000000000ULL;
const uint64_t NEGATIVE_INFINITY_BITS = 0xFFF0000000000000ULL;
const uint64_t MAX_UINT64 = 0xFFFFFFFFFFFFFFFFULL;
const uint64_t MAX_INT64_MAGNITUDE = 0x8000000000000000ULL;
const uint64_t LOW_32_BITS_MASK = 0xFFFFFFFFULL;
const uint64_t FLOAT32_FRACTION_MASK = 0x007FFFFFULL;
const uint64_t FLOAT32_HIDDEN_BIT = 0x00800000ULL;
const uint64_t FLOAT32_OVERFLOW_BIT = 0x01000000ULL;
const uint64_t FLOAT32_INFINITY_BITS = 0x7F800000ULL;
const uint64_t FLOAT32_NAN_BITS = 0x7FC00000ULL;
const int FLOAT64_FRACTION_BITS = 52;
const int FLOAT64_EXPONENT_BIAS = 1023;
const int FLOAT64_MAX_EXPONENT = 2046;
const int FLOAT32_FRACTION_BITS = 23;
const int FLOAT32_EXPONENT_BIAS = 127;
const int FLOAT32_MAX_EXPONENT = 254;
const int EXTRA_BITS = 10;
const int NORMALIZED_TOP_BIT = 62;
const int DOUBLE_BYTE_SIZE = 8;
const int FLOAT_BYTE_SIZE = 4;
const int ULONG_BITS = 32;

struct FloatParts {
	bool negative;
	int exponent;
	uint64_t mantissa;
	bool zero;
	bool infinity;
	bool nan;
};

int highestSetBit(uint64_t value) {
	int bit = -1;
	while (value != 0) {
		value >>= 1;
		bit++;
	}
	return bit;
}

bool isZeroBits(uint64_t bits) {
	return (bits & ~SIGN_MASK) == 0;
}

bool isNanBits(uint64_t bits) {
	return (bits & EXPONENT_MASK) == EXPONENT_MASK &&
	       (bits & FRACTION_MASK) != 0;
}

FloatParts unpackFloat(uint64_t bits) {
	FloatParts parts;
	parts.negative = (bits & SIGN_MASK) != 0;
	parts.exponent = (int)((bits & EXPONENT_MASK) >> FLOAT64_FRACTION_BITS);
	parts.mantissa = bits & FRACTION_MASK;
	parts.infinity = parts.exponent == 0x7FF && parts.mantissa == 0;
	parts.nan = parts.exponent == 0x7FF && parts.mantissa != 0;
	parts.zero = parts.exponent == 0 && parts.mantissa == 0;
	return parts;
}

uint64_t composeBits(bool negative, int exponent, uint64_t fraction) {
	uint64_t sign = negative ? SIGN_MASK : 0;
	return sign | ((uint64_t)exponent << FLOAT64_FRACTION_BITS) |
	       (fraction & FRACTION_MASK);
}

uint64_t shiftRightRound(uint64_t value, int shift) {
	if (shift <= 0) {
		return value;
	}
	if (shift >= 64) {
		return 0;
	}
	uint64_t kept = value >> shift;
	uint64_t guard = (value >> (shift - 1)) & 1;
	uint64_t stickyMask = (1ULL << (shift - 1)) - 1;
	bool sticky = (value & stickyMask) != 0;
	if (guard != 0 && (sticky || (kept & 1) != 0)) {
		kept++;
	}
	return kept;
}

void shiftRightWithSticky(uint64_t &mantissa, int shift) {
	if (shift <= 0) {
		return;
	}
	if (shift >= 64) {
		mantissa = mantissa != 0 ? 1 : 0;
		return;
	}
	uint64_t mask = (1ULL << shift) - 1;
	bool lost = (mantissa & mask) != 0;
	mantissa >>= shift;
	if (lost) {
		mantissa |= 1;
	}
}

uint64_t shiftRight128To64(uint64_t high, uint64_t low, int shift) {
	if (shift <= 0) {
		return low;
	}
	if (shift < 64) {
		return (low >> shift) | (high << (64 - shift));
	}
	if (shift < 128) {
		return high >> (shift - 64);
	}
	return 0;
}

bool bitAt128(uint64_t high, uint64_t low, int index) {
	if (index < 0) {
		return false;
	}
	if (index < 64) {
		return ((low >> index) & 1) != 0;
	}
	if (index < 128) {
		return ((high >> (index - 64)) & 1) != 0;
	}
	return false;
}

bool anyBitsBelow128(uint64_t high, uint64_t low, int count) {
	if (count <= 0) {
		return false;
	}
	if (count >= 128) {
		return (high | low) != 0;
	}
	if (count < 64) {
		uint64_t mask = (1ULL << count) - 1;
		return (low & mask) != 0;
	}
	if (count == 64) {
		return low != 0;
	}
	int highBits = count - 64;
	uint64_t mask = (1ULL << highBits) - 1;
	return low != 0 || (high & mask) != 0;
}

uint64_t shiftRight128WithSticky(uint64_t high, uint64_t low, int shift) {
	uint64_t result = shiftRight128To64(high, low, shift);
	bool lost = anyBitsBelow128(high, low, shift);
	return lost ? (result | 1) : result;
}

uint64_t composeNormalized(bool negative, int exponent, uint64_t mantissa) {
	if (mantissa == 0) {
		return negative ? SIGN_MASK : 0;
	}
	if (mantissa >= MANTISSA_LIMIT) {
		mantissa >>= 1;
		exponent++;
	}
	if (exponent > FLOAT64_MAX_EXPONENT) {
		return negative ? NEGATIVE_INFINITY_BITS : POSITIVE_INFINITY_BITS;
	}
	if (exponent >= 1) {
		return composeBits(negative, exponent, mantissa);
	}
	int shift = 1 - exponent;
	uint64_t fraction = shiftRightRound(mantissa, shift);
	if (fraction >= HIDDEN_BIT) {
		return composeBits(negative, 1, 0);
	}
	return composeBits(negative, 0, fraction);
}

uint64_t finalizeMantissa(uint64_t mantissa, int exponent, bool negative) {
	if (mantissa == 0) {
		return 0;
	}
	int top = highestSetBit(mantissa);
	int shift = top - NORMALIZED_TOP_BIT;
	if (shift > 0) {
		shiftRightWithSticky(mantissa, shift);
		exponent += shift;
	} else if (shift < 0) {
		mantissa <<= -shift;
		exponent += shift;
	}
	uint64_t kept = mantissa >> EXTRA_BITS;
	uint64_t guard = (mantissa >> (EXTRA_BITS - 1)) & 1;
	uint64_t roundBit = (mantissa >> (EXTRA_BITS - 2)) & 1;
	uint64_t stickyMask = (1ULL << (EXTRA_BITS - 2)) - 1;
	bool sticky = (mantissa & stickyMask) != 0;
	if (guard != 0 && (roundBit != 0 || sticky || (kept & 1) != 0)) {
		kept++;
	}
	return composeNormalized(negative, exponent, kept);
}

void multiplyWide(
	uint64_t left,
	uint64_t right,
	uint64_t &high,
	uint64_t &low
) {
	uint64_t leftLow = left & LOW_32_BITS_MASK;
	uint64_t leftHigh = left >> ULONG_BITS;
	uint64_t rightLow = right & LOW_32_BITS_MASK;
	uint64_t rightHigh = right >> ULONG_BITS;
	uint64_t lowProduct = leftLow * rightLow;
	uint64_t middle = leftHigh * rightLow + (lowProduct >> ULONG_BITS);
	uint64_t middleLow = middle & LOW_32_BITS_MASK;
	uint64_t middleHigh = middle >> ULONG_BITS;
	middleLow += leftLow * rightHigh;
	high = leftHigh * rightHigh + middleHigh + (middleLow >> ULONG_BITS);
	low = (middleLow << ULONG_BITS) | (lowProduct & LOW_32_BITS_MASK);
}

uint64_t unsignedIntegerToBits(uint64_t value) {
	if (value == 0) {
		return 0;
	}
	int top = highestSetBit(value);
	int exponent = top + FLOAT64_EXPONENT_BIAS;
	uint64_t mantissa;
	if (top <= FLOAT64_FRACTION_BITS) {
		mantissa = value << (FLOAT64_FRACTION_BITS - top);
	} else {
		mantissa = shiftRightRound(value, top - FLOAT64_FRACTION_BITS);
	}
	if (mantissa >= MANTISSA_LIMIT) {
		mantissa >>= 1;
		exponent++;
	}
	return composeBits(false, exponent, mantissa);
}

uint64_t signedIntegerToBits(long long value) {
	if (value < 0) {
		uint64_t magnitude = (uint64_t)(-(value + 1)) + 1;
		return SIGN_MASK | unsignedIntegerToBits(magnitude);
	}
	return unsignedIntegerToBits((uint64_t)value);
}

uint64_t floatToBits(float value) {
	uint32_t raw = 0;
	memcpy(&raw, &value, FLOAT_BYTE_SIZE);
	bool negative = (raw & 0x80000000UL) != 0;
	uint32_t exponent = (raw >> FLOAT32_FRACTION_BITS) & 0xFF;
	uint32_t fraction = raw & (uint32_t)FLOAT32_FRACTION_MASK;
	if (exponent == 0xFF) {
		uint64_t sign = negative ? SIGN_MASK : 0;
		uint64_t payload = (uint64_t)fraction << (FLOAT64_FRACTION_BITS - FLOAT32_FRACTION_BITS);
		return sign | EXPONENT_MASK | payload;
	}
	if (exponent == 0) {
		if (fraction == 0) {
			return negative ? SIGN_MASK : 0;
		}
		int top = highestSetBit(fraction);
		int resultExponent = top +
				     (FLOAT64_EXPONENT_BIAS - FLOAT32_EXPONENT_BIAS -
				      FLOAT32_FRACTION_BITS + 1);
		uint64_t mantissa =
			(uint64_t)fraction << (FLOAT64_FRACTION_BITS - top);
		return composeBits(negative, resultExponent, mantissa);
	}
	int resultExponent = (int)exponent - FLOAT32_EXPONENT_BIAS +
			     FLOAT64_EXPONENT_BIAS;
	uint64_t mantissa = (uint64_t)fraction
			    << (FLOAT64_FRACTION_BITS - FLOAT32_FRACTION_BITS);
	return composeBits(negative, resultExponent, mantissa);
}

uint64_t doubleToBits(double value) {
	if (sizeof(double) == DOUBLE_BYTE_SIZE) {
		uint64_t bits = 0;
		memcpy(&bits, &value, DOUBLE_BYTE_SIZE);
		return bits;
	}
	return floatToBits((float)value);
}

uint32_t float32BitsFromFloat64(uint64_t bits) {
	uint32_t sign = (bits & SIGN_MASK) != 0 ? 0x80000000UL : 0;
	int exponent = (int)((bits & EXPONENT_MASK) >> FLOAT64_FRACTION_BITS);
	uint64_t fraction = bits & FRACTION_MASK;
	if (exponent == 0x7FF) {
		if (fraction != 0) {
			return sign | (uint32_t)FLOAT32_NAN_BITS;
		}
		return sign | (uint32_t)FLOAT32_INFINITY_BITS;
	}
	if (exponent == 0 && fraction == 0) {
		return sign;
	}
	if (exponent >= FLOAT64_EXPONENT_BIAS + FLOAT32_EXPONENT_BIAS + 1) {
		return sign | (uint32_t)FLOAT32_INFINITY_BITS;
	}
	if (exponent > FLOAT64_EXPONENT_BIAS - FLOAT32_EXPONENT_BIAS) {
		int floatExponent = exponent - 896;
		uint64_t mantissa = fraction | HIDDEN_BIT;
		uint64_t rounded = shiftRightRound(
			mantissa,
			FLOAT64_FRACTION_BITS - FLOAT32_FRACTION_BITS
		);
		if (rounded >= FLOAT32_OVERFLOW_BIT) {
			rounded >>= 1;
			floatExponent++;
		}
		if (floatExponent >= 0xFF) {
			return sign | (uint32_t)FLOAT32_INFINITY_BITS;
		}
		return sign | ((uint32_t)floatExponent << FLOAT32_FRACTION_BITS) |
		       ((uint32_t)rounded & (uint32_t)FLOAT32_FRACTION_MASK);
	}
	uint64_t mantissa = exponent == 0 ? fraction : (fraction | HIDDEN_BIT);
	int shift = 926 - exponent;
	uint64_t units = shiftRightRound(mantissa, shift);
	if (units >= FLOAT32_HIDDEN_BIT) {
		return sign | ((uint32_t)1 << FLOAT32_FRACTION_BITS);
	}
	return sign | (uint32_t)units;
}

long long toSignedInteger(uint64_t bits) {
	bool negative = (bits & SIGN_MASK) != 0;
	int exponent = (int)((bits & EXPONENT_MASK) >> FLOAT64_FRACTION_BITS);
	if (exponent == 0x7FF) {
		return negative ? (-0x7FFFFFFFFFFFFFFFLL - 1) : 0x7FFFFFFFFFFFFFFFLL;
	}
	if (exponent == 0 || exponent < FLOAT64_EXPONENT_BIAS) {
		return 0;
	}
	uint64_t mantissa = (bits & FRACTION_MASK) | HIDDEN_BIT;
	int shift = 1075 - exponent;
	uint64_t magnitude;
	if (shift <= 0) {
		int left = -shift;
		if (left >= 64) {
			return negative ? (-0x7FFFFFFFFFFFFFFFLL - 1) : 0x7FFFFFFFFFFFFFFFLL;
		}
		magnitude = mantissa << left;
	} else if (shift >= 64) {
		magnitude = 0;
	} else {
		magnitude = mantissa >> shift;
	}
	if (negative) {
		if (magnitude > MAX_INT64_MAGNITUDE) {
			return -0x7FFFFFFFFFFFFFFFLL - 1;
		}
		return (long long)(0 - magnitude);
	}
	if (magnitude > 0x7FFFFFFFFFFFFFFFULL) {
		return 0x7FFFFFFFFFFFFFFFLL;
	}
	return (long long)magnitude;
}

unsigned long long toUnsignedInteger(uint64_t bits) {
	bool negative = (bits & SIGN_MASK) != 0;
	int exponent = (int)((bits & EXPONENT_MASK) >> FLOAT64_FRACTION_BITS);
	if (exponent == 0x7FF) {
		return negative ? 0 : MAX_UINT64;
	}
	if (negative || exponent == 0 || exponent < FLOAT64_EXPONENT_BIAS) {
		return 0;
	}
	uint64_t mantissa = (bits & FRACTION_MASK) | HIDDEN_BIT;
	int shift = 1075 - exponent;
	if (shift <= 0) {
		int left = -shift;
		if (left >= 64) {
			return MAX_UINT64;
		}
		return (unsigned long long)(mantissa << left);
	}
	if (shift >= 64) {
		return 0;
	}
	return (unsigned long long)(mantissa >> shift);
}

int compareBits(uint64_t left, uint64_t right) {
	if (isNanBits(left) || isNanBits(right)) {
		return 2;
	}
	if (isZeroBits(left) && isZeroBits(right)) {
		return 0;
	}
	bool leftNegative = (left & SIGN_MASK) != 0;
	bool rightNegative = (right & SIGN_MASK) != 0;
	if (leftNegative != rightNegative) {
		return leftNegative ? -1 : 1;
	}
	uint64_t leftMagnitude = left & ~SIGN_MASK;
	uint64_t rightMagnitude = right & ~SIGN_MASK;
	if (leftMagnitude == rightMagnitude) {
		return 0;
	}
	bool leftGreater = leftMagnitude > rightMagnitude;
	if (leftNegative) {
		leftGreater = !leftGreater;
	}
	return leftGreater ? 1 : -1;
}

uint64_t addBits(uint64_t left, uint64_t right, bool subtract) {
	FloatParts leftParts = unpackFloat(left);
	FloatParts rightParts = unpackFloat(right);
	if (leftParts.nan || rightParts.nan) {
		return QUIET_NAN_BITS;
	}
	if (leftParts.infinity || rightParts.infinity) {
		if (leftParts.infinity && rightParts.infinity &&
		    leftParts.negative != rightParts.negative) {
			return QUIET_NAN_BITS;
		}
		if (leftParts.infinity) {
			return left;
		}
		return right;
	}
	if (leftParts.zero && rightParts.zero) {
		bool negative = leftParts.negative && rightParts.negative;
		return negative ? SIGN_MASK : 0;
	}
	if (leftParts.zero) {
		return subtract ? (right ^ SIGN_MASK) : right;
	}
	if (rightParts.zero) {
		return left;
	}
	int leftExponent = leftParts.exponent == 0 ? 1 : leftParts.exponent;
	int rightExponent = rightParts.exponent == 0 ? 1 : rightParts.exponent;
	uint64_t leftMantissa = leftParts.exponent == 0
					? leftParts.mantissa
					: (leftParts.mantissa | HIDDEN_BIT);
	uint64_t rightMantissa = rightParts.exponent == 0
					 ? rightParts.mantissa
					 : (rightParts.mantissa | HIDDEN_BIT);
	leftMantissa <<= EXTRA_BITS;
	rightMantissa <<= EXTRA_BITS;
	int exponent = leftExponent > rightExponent ? leftExponent : rightExponent;
	shiftRightWithSticky(leftMantissa, exponent - leftExponent);
	shiftRightWithSticky(rightMantissa, exponent - rightExponent);
	bool rightNegative = subtract ? !rightParts.negative : rightParts.negative;
	uint64_t mantissa;
	bool negative;
	if (leftParts.negative == rightNegative) {
		mantissa = leftMantissa + rightMantissa;
		negative = leftParts.negative;
	} else if (leftMantissa >= rightMantissa) {
		mantissa = leftMantissa - rightMantissa;
		negative = leftParts.negative;
	} else {
		mantissa = rightMantissa - leftMantissa;
		negative = rightNegative;
	}
	if (mantissa == 0) {
		return 0;
	}
	return finalizeMantissa(mantissa, exponent, negative);
}

uint64_t multiplyBits(uint64_t left, uint64_t right) {
	FloatParts leftParts = unpackFloat(left);
	FloatParts rightParts = unpackFloat(right);
	bool negative = leftParts.negative != rightParts.negative;
	if (leftParts.nan || rightParts.nan) {
		return QUIET_NAN_BITS;
	}
	if (leftParts.infinity || rightParts.infinity) {
		if (leftParts.zero || rightParts.zero) {
			return QUIET_NAN_BITS;
		}
		return negative ? NEGATIVE_INFINITY_BITS : POSITIVE_INFINITY_BITS;
	}
	if (leftParts.zero || rightParts.zero) {
		return negative ? SIGN_MASK : 0;
	}
	int leftExponent = leftParts.exponent == 0 ? 1 : leftParts.exponent;
	int rightExponent = rightParts.exponent == 0 ? 1 : rightParts.exponent;
	uint64_t leftMantissa = leftParts.exponent == 0
					? leftParts.mantissa
					: (leftParts.mantissa | HIDDEN_BIT);
	uint64_t rightMantissa = rightParts.exponent == 0
					 ? rightParts.mantissa
					 : (rightParts.mantissa | HIDDEN_BIT);
	uint64_t high;
	uint64_t low;
	multiplyWide(leftMantissa, rightMantissa, high, low);
	if (high == 0 && low == 0) {
		return negative ? SIGN_MASK : 0;
	}
	int top = high != 0 ? 64 + highestSetBit(high) : highestSetBit(low);
	int shift = top - NORMALIZED_TOP_BIT;
	uint64_t mantissa;
	if (shift > 0) {
		mantissa = shiftRight128WithSticky(high, low, shift);
	} else {
		mantissa = low << (-shift);
	}
	int exponent = leftExponent + rightExponent + top - 1127;
	return finalizeMantissa(mantissa, exponent, negative);
}

uint64_t divideBits(uint64_t left, uint64_t right) {
	FloatParts leftParts = unpackFloat(left);
	FloatParts rightParts = unpackFloat(right);
	bool negative = leftParts.negative != rightParts.negative;
	if (leftParts.nan || rightParts.nan) {
		return QUIET_NAN_BITS;
	}
	if (leftParts.infinity && rightParts.infinity) {
		return QUIET_NAN_BITS;
	}
	if (leftParts.infinity) {
		return negative ? NEGATIVE_INFINITY_BITS : POSITIVE_INFINITY_BITS;
	}
	if (rightParts.infinity) {
		return negative ? SIGN_MASK : 0;
	}
	if (rightParts.zero) {
		if (leftParts.zero) {
			return QUIET_NAN_BITS;
		}
		return negative ? NEGATIVE_INFINITY_BITS : POSITIVE_INFINITY_BITS;
	}
	if (leftParts.zero) {
		return negative ? SIGN_MASK : 0;
	}
	int leftExponent = leftParts.exponent == 0 ? 1 : leftParts.exponent;
	int rightExponent = rightParts.exponent == 0 ? 1 : rightParts.exponent;
	uint64_t leftMantissa = leftParts.exponent == 0
					? leftParts.mantissa
					: (leftParts.mantissa | HIDDEN_BIT);
	uint64_t rightMantissa = rightParts.exponent == 0
					 ? rightParts.mantissa
					 : (rightParts.mantissa | HIDDEN_BIT);
	uint64_t numeratorHigh = leftMantissa >> 2;
	uint64_t numeratorLow = leftMantissa << 62;
	uint64_t quotient = 0;
	uint64_t remainder = 0;
	for (int index = 114; index >= 0; index--) {
		remainder = (remainder << 1) |
			    (bitAt128(numeratorHigh, numeratorLow, index) ? 1 : 0);
		if (remainder >= rightMantissa) {
			remainder -= rightMantissa;
			if (index < 64) {
				quotient |= 1ULL << index;
			}
		}
	}
	if (remainder != 0) {
		quotient |= 1;
	}
	int exponent = leftExponent - rightExponent + FLOAT64_EXPONENT_BIAS;
	return finalizeMantissa(quotient, exponent, negative);
}

} // namespace

_e95_f64::_e95_f64() : bits(0) {}

_e95_f64::_e95_f64(signed char value) : bits(signedIntegerToBits(value)) {}

_e95_f64::_e95_f64(unsigned char value) : bits(unsignedIntegerToBits(value)) {}

_e95_f64::_e95_f64(short value) : bits(signedIntegerToBits(value)) {}

_e95_f64::_e95_f64(unsigned short value) : bits(unsignedIntegerToBits(value)) {}

_e95_f64::_e95_f64(int value) : bits(signedIntegerToBits(value)) {}

_e95_f64::_e95_f64(unsigned int value) : bits(unsignedIntegerToBits(value)) {}

_e95_f64::_e95_f64(long value) : bits(signedIntegerToBits(value)) {}

_e95_f64::_e95_f64(unsigned long value) : bits(unsignedIntegerToBits(value)) {}

_e95_f64::_e95_f64(long long value) : bits(signedIntegerToBits(value)) {}

_e95_f64::_e95_f64(unsigned long long value)
	: bits(unsignedIntegerToBits(value)) {}

_e95_f64::_e95_f64(float value) : bits(floatToBits(value)) {}

_e95_f64::_e95_f64(double value) : bits(doubleToBits(value)) {}

_e95_f64 _e95_f64::fromBits(uint32_t high, uint32_t low) {
	_e95_f64 result;
	result.bits = ((uint64_t)high << 32) | (uint64_t)low;
	return result;
}

_e95_f64::operator bool() const {
	return (bits & ~SIGN_MASK) != 0;
}

_e95_f64::operator char() const {
	return (char)toSignedInteger(bits);
}

_e95_f64::operator signed char() const {
	return (signed char)toSignedInteger(bits);
}

_e95_f64::operator unsigned char() const {
	return (unsigned char)toUnsignedInteger(bits);
}

_e95_f64::operator short() const {
	return (short)toSignedInteger(bits);
}

_e95_f64::operator unsigned short() const {
	return (unsigned short)toUnsignedInteger(bits);
}

_e95_f64::operator int() const {
	return (int)toSignedInteger(bits);
}

_e95_f64::operator unsigned int() const {
	return (unsigned int)toUnsignedInteger(bits);
}

_e95_f64::operator long() const {
	return (long)toSignedInteger(bits);
}

_e95_f64::operator unsigned long() const {
	return (unsigned long)toUnsignedInteger(bits);
}

_e95_f64::operator long long() const {
	return (long long)toSignedInteger(bits);
}

_e95_f64::operator unsigned long long() const {
	return (unsigned long long)toUnsignedInteger(bits);
}

_e95_f64::operator float() const {
	uint32_t raw = float32BitsFromFloat64(bits);
	float result = 0;
	memcpy(&result, &raw, FLOAT_BYTE_SIZE);
	return result;
}

_e95_f64 _e95_f64::operator-() const {
	_e95_f64 result;
	result.bits = bits ^ SIGN_MASK;
	return result;
}

_e95_f64 _e95_f64::operator+(const _e95_f64 &other) const {
	_e95_f64 result;
	result.bits = addBits(bits, other.bits, false);
	return result;
}

_e95_f64 _e95_f64::operator-(const _e95_f64 &other) const {
	_e95_f64 result;
	result.bits = addBits(bits, other.bits, true);
	return result;
}

_e95_f64 _e95_f64::operator*(const _e95_f64 &other) const {
	_e95_f64 result;
	result.bits = multiplyBits(bits, other.bits);
	return result;
}

_e95_f64 _e95_f64::operator/(const _e95_f64 &other) const {
	_e95_f64 result;
	result.bits = divideBits(bits, other.bits);
	return result;
}

_e95_f64 &_e95_f64::operator+=(const _e95_f64 &other) {
	bits = addBits(bits, other.bits, false);
	return *this;
}

_e95_f64 &_e95_f64::operator-=(const _e95_f64 &other) {
	bits = addBits(bits, other.bits, true);
	return *this;
}

_e95_f64 &_e95_f64::operator*=(const _e95_f64 &other) {
	bits = multiplyBits(bits, other.bits);
	return *this;
}

_e95_f64 &_e95_f64::operator/=(const _e95_f64 &other) {
	bits = divideBits(bits, other.bits);
	return *this;
}

bool _e95_f64::operator==(const _e95_f64 &other) const {
	return compareBits(bits, other.bits) == 0;
}

bool _e95_f64::operator!=(const _e95_f64 &other) const {
	int comparison = compareBits(bits, other.bits);
	return comparison == 2 || comparison != 0;
}

bool _e95_f64::operator<(const _e95_f64 &other) const {
	return compareBits(bits, other.bits) == -1;
}

bool _e95_f64::operator>(const _e95_f64 &other) const {
	return compareBits(bits, other.bits) == 1;
}

bool _e95_f64::operator<=(const _e95_f64 &other) const {
	int comparison = compareBits(bits, other.bits);
	return comparison == -1 || comparison == 0;
}

bool _e95_f64::operator>=(const _e95_f64 &other) const {
	int comparison = compareBits(bits, other.bits);
	return comparison == 1 || comparison == 0;
}
