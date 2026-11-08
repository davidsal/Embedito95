#include "core_int128.h"

const u32 U32_BIT_COUNT = 32;
const u32 U64_BIT_COUNT = 64;
const u32 U128_BIT_COUNT = 128;
const u64 U64_ALL_BITS = ~0ULL;
const u64 U64_LOW_WORD_MASK = 0xFFFFFFFFu;
const u64 U64_SIGN_BIT = 0x8000000000000000ULL;

static u64 _e95_add64(u64 a, u64 b, u64& carry) {
	u64 sum = a + b;
	carry = sum < a ? 1 : 0;
	return sum;
}

static u64 _e95_sub64(u64 a, u64 b, u64& borrow) {
	u64 difference = a - b;
	borrow = a < b ? 1 : 0;
	return difference;
}

static void _e95_mul64(
	u64 a,
	u64 b,
	u64& high,
	u64& low
) {
	u64 aHigh = a >> U32_BIT_COUNT;
	u64 aLow = a & U64_LOW_WORD_MASK;
	u64 bHigh = b >> U32_BIT_COUNT;
	u64 bLow = b & U64_LOW_WORD_MASK;
	u64 lowLow = aLow * bLow;
	u64 middle = (lowLow >> U32_BIT_COUNT) + (aLow * bHigh);
	u64 highLow = (middle & U64_LOW_WORD_MASK) + (aHigh * bLow);
	high =
		(middle >> U32_BIT_COUNT) + (highLow >> U32_BIT_COUNT) + (aHigh * bHigh);
	low = (highLow << U32_BIT_COUNT) | (lowLow & U64_LOW_WORD_MASK);
}

static u128 _e95_negateU128(u128 value) {
	return ~value + u128(1);
}

static u128 _e95_shiftLeft(u128 value, u32 shift) {
	if (shift == 0) {
		return value;
	}
	if (shift >= U128_BIT_COUNT) {
		return u128(0, 0);
	}
	if (shift >= U64_BIT_COUNT) {
		return u128(value.lo << (shift - U64_BIT_COUNT), 0);
	}
	return u128(
		(value.hi << shift) | (value.lo >> (U64_BIT_COUNT - shift)),
		value.lo << shift
	);
}

static u128 _e95_shiftRight(u128 value, u32 shift) {
	if (shift == 0) {
		return value;
	}
	if (shift >= U128_BIT_COUNT) {
		return u128(0, 0);
	}
	if (shift >= U64_BIT_COUNT) {
		return u128(0, value.hi >> (shift - U64_BIT_COUNT));
	}
	return u128(
		value.hi >> shift,
		(value.lo >> shift) | (value.hi << (U64_BIT_COUNT - shift))
	);
}

static void _e95_divmod128(
	u128 dividend,
	u128 divisor,
	u128& quotient,
	u128& remainder
) {
	quotient = u128(0, 0);
	remainder = u128(0, 0);

	for (i8 bit = U128_BIT_COUNT - 1; bit >= 0; bit--) {
		remainder = _e95_shiftLeft(remainder, 1);
		remainder.lo |= _e95_shiftRight(dividend, bit).lo & 1;
		if (divisor <= remainder) {
			remainder = remainder - divisor;
			if (bit >= U64_BIT_COUNT) {
				quotient.hi |= 1ULL << (bit - U64_BIT_COUNT);
			} else {
				quotient.lo |= 1ULL << bit;
			}
		}
	}
}

static boolean _e95_isNegative(i128 a) {
	return (a.value.hi >> (U64_BIT_COUNT - 1)) != 0;
}

const double TWO_64 = 18446744073709551616.0;

static double _e95_u128ToDouble(u128 value) {
	return (double)value.hi * TWO_64 + (double)value.lo;
}

static double _e95_i128ToDouble(i128 value) {
	if (_e95_isNegative(value)) {
		u128 magnitude = _e95_negateU128(value.value);
		return -((double)magnitude.hi * TWO_64 + (double)magnitude.lo);
	}
	return (double)value.value.hi * TWO_64 + (double)value.value.lo;
}

u128::operator f32() const {
	return (f32)_e95_u128ToDouble(*this);
}

u128::operator double() const {
	return _e95_u128ToDouble(*this);
}

i128::operator f32() const {
	return (f32)_e95_i128ToDouble(*this);
}

i128::operator double() const {
	return _e95_i128ToDouble(*this);
}

u128 operator+(u128 a, u128 b) {
	u64 carry = 0;
	u64 low = _e95_add64(a.lo, b.lo, carry);
	u64 high = a.hi + b.hi + carry;
	return u128(high, low);
}

u128 operator-(u128 a, u128 b) {
	u64 borrow = 0;
	u64 low = _e95_sub64(a.lo, b.lo, borrow);
	u64 high = a.hi - b.hi - borrow;
	return u128(high, low);
}

u128 operator*(u128 a, u128 b) {
	u64 high0, low0, high1, low1, high2, low2;
	_e95_mul64(a.lo, b.lo, high0, low0);
	_e95_mul64(a.lo, b.hi, high1, low1);
	_e95_mul64(a.hi, b.lo, high2, low2);
	return u128(high0 + low1 + low2, low0);
}

u128 operator<<(u128 value, u128 shift) {
	return _e95_shiftLeft(value, (u32)shift.lo);
}

u128 operator>>(u128 value, u128 shift) {
	return _e95_shiftRight(value, (u32)shift.lo);
}

boolean operator==(u128 a, u128 b) {
	return a.lo == b.lo && a.hi == b.hi;
}

boolean operator!=(u128 a, u128 b) {
	return a.lo != b.lo || a.hi != b.hi;
}

boolean operator<(u128 a, u128 b) {
	return a.hi < b.hi || (a.hi == b.hi && a.lo < b.lo);
}

boolean operator>(u128 a, u128 b) {
	return b < a;
}

boolean operator<=(u128 a, u128 b) {
	return !(b < a);
}

boolean operator>=(u128 a, u128 b) {
	return !(a < b);
}

u128 operator&(u128 a, u128 b) {
	return u128(a.hi & b.hi, a.lo & b.lo);
}

u128 operator|(u128 a, u128 b) {
	return u128(a.hi | b.hi, a.lo | b.lo);
}

u128 operator^(u128 a, u128 b) {
	return u128(a.hi ^ b.hi, a.lo ^ b.lo);
}

u128 operator~(u128 a) {
	return u128(~a.hi, ~a.lo);
}

u128 operator/(u128 a, u128 b) {
	u128 quotient;
	u128 remainder;
	_e95_divmod128(a, b, quotient, remainder);
	return quotient;
}

u128 operator%(u128 a, u128 b) {
	u128 quotient;
	u128 remainder;
	_e95_divmod128(a, b, quotient, remainder);
	return remainder;
}

u128& operator+=(u128& a, u128 b) {
	a = a + b;
	return a;
}

u128& operator-=(u128& a, u128 b) {
	a = a - b;
	return a;
}

u128& operator*=(u128& a, u128 b) {
	a = a * b;
	return a;
}

u128& operator/=(u128& a, u128 b) {
	a = a / b;
	return a;
}

u128& operator%=(u128& a, u128 b) {
	a = a % b;
	return a;
}

u128& operator<<=(u128& a, u128 shift) {
	a = a << shift;
	return a;
}

u128& operator>>=(u128& a, u128 shift) {
	a = a >> shift;
	return a;
}

u128& operator&=(u128& a, u128 b) {
	a = a & b;
	return a;
}

u128& operator|=(u128& a, u128 b) {
	a = a | b;
	return a;
}

u128& operator^=(u128& a, u128 b) {
	a = a ^ b;
	return a;
}

i128 operator+(i128 a, i128 b) {
	return i128(a.value + b.value);
}

i128 operator-(i128 a, i128 b) {
	return i128(a.value - b.value);
}

i128 operator*(i128 a, i128 b) {
	return i128(a.value * b.value);
}

i128 operator-(i128 a) {
	return i128(_e95_negateU128(a.value));
}

i128 operator+(i128 a) {
	return a;
}

boolean operator==(i128 a, i128 b) {
	return a.value == b.value;
}

boolean operator!=(i128 a, i128 b) {
	return a.value != b.value;
}

boolean operator<(i128 a, i128 b) {
	boolean negativeA = _e95_isNegative(a);
	boolean negativeB = _e95_isNegative(b);
	if (negativeA != negativeB) {
		return negativeA;
	}
	if (negativeA) {
		return b.value < a.value;
	}
	return a.value < b.value;
}

boolean operator>(i128 a, i128 b) {
	return b < a;
}

boolean operator<=(i128 a, i128 b) {
	return !(b < a);
}

boolean operator>=(i128 a, i128 b) {
	return !(a < b);
}

i128 operator/(i128 a, i128 b) {
	boolean negativeA = _e95_isNegative(a);
	boolean negativeB = _e95_isNegative(b);
	u128 magnitudeA = negativeA ? _e95_negateU128(a.value) : a.value;
	u128 magnitudeB = negativeB ? _e95_negateU128(b.value) : b.value;
	u128 quotient;
	u128 remainder;
	_e95_divmod128(magnitudeA, magnitudeB, quotient, remainder);
	if (negativeA != negativeB) {
		return i128(_e95_negateU128(quotient));
	}
	return i128(quotient);
}

i128 operator%(i128 a, i128 b) {
	boolean negativeA = _e95_isNegative(a);
	u128 magnitudeA = negativeA ? _e95_negateU128(a.value) : a.value;
	u128 magnitudeB = _e95_isNegative(b) ? _e95_negateU128(b.value) : b.value;
	u128 quotient;
	u128 remainder;
	_e95_divmod128(magnitudeA, magnitudeB, quotient, remainder);
	if (negativeA) {
		return i128(_e95_negateU128(remainder));
	}
	return i128(remainder);
}

i128 operator<<(i128 a, i128 shift) {
	return i128(_e95_shiftLeft(a.value, (u32)shift.value.lo));
}

i128 operator>>(i128 a, i128 shift) {
	u32 shiftAmount = (u32)shift.value.lo;
	boolean negative = _e95_isNegative(a);
	u128 shifted = _e95_shiftRight(a.value, shiftAmount);
	if (negative && shiftAmount < U128_BIT_COUNT) {
		u128 signBits = _e95_shiftLeft(
			u128(U64_ALL_BITS, U64_ALL_BITS),
			U128_BIT_COUNT - shiftAmount
		);
		shifted = shifted | signBits;
	} else if (negative) {
		shifted = u128(U64_ALL_BITS, U64_ALL_BITS);
	}
	return i128(shifted);
}

i128 operator&(i128 a, i128 b) {
	return i128(a.value & b.value);
}

i128 operator|(i128 a, i128 b) {
	return i128(a.value | b.value);
}

i128 operator^(i128 a, i128 b) {
	return i128(a.value ^ b.value);
}

i128 operator~(i128 a) {
	return i128(~a.value);
}

i128& operator+=(i128& a, i128 b) {
	a = a + b;
	return a;
}

i128& operator-=(i128& a, i128 b) {
	a = a - b;
	return a;
}

i128& operator*=(i128& a, i128 b) {
	a = a * b;
	return a;
}

i128& operator/=(i128& a, i128 b) {
	a = a / b;
	return a;
}

i128& operator%=(i128& a, i128 b) {
	a = a % b;
	return a;
}

i128& operator<<=(i128& a, i128 shift) {
	a = a << shift;
	return a;
}

i128& operator>>=(i128& a, i128 shift) {
	a = a >> shift;
	return a;
}

i128& operator&=(i128& a, i128 b) {
	a = a & b;
	return a;
}

i128& operator|=(i128& a, i128 b) {
	a = a | b;
	return a;
}

i128& operator^=(i128& a, i128 b) {
	a = a ^ b;
	return a;
}

namespace core_string {

String::String(u128 value) : storage_(Ref<StrStorage>::emplace()) {
	assignU128(value.lo, value.hi, false);
}

String::String(i128 value) : storage_(Ref<StrStorage>::emplace()) {
	u128 raw = value.value;
	if (raw.hi & U64_SIGN_BIT) {
		u128 magnitude = _e95_negateU128(raw);
		assignU128(magnitude.lo, magnitude.hi, true);
	} else {
		assignU128(raw.lo, raw.hi, false);
	}
}

} // namespace core_string
