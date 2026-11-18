#include "core_math.h"

namespace core_math {

// Shared math implementation, platform-agnostic.
// Inlined into each platform's core_math.cpp via _e95_replace_common.
//
// Every floating-point function is defined twice: the f32 overload keeps the
// single-precision cost of the original implementation, and the f64 overload
// keeps double precision end to end (no operand is narrowed to f32). The
// target's f64 kind picks the f64 body, through the generated `e95_config.h`:
//
//   * `E95_FLOAT64_SOFTWARE == 0` (native `double`): plain C library calls in
//     double precision.
//   * `E95_FLOAT64_SOFTWARE == 1` (portable `_e95_f64`, e.g. AVR whose
//     `double` is 32 bits wide): the algebraic and rounding forms are computed
//     on the binary64 value itself, so they keep full f64 precision. The
//     transcendentals (power, logarithms, exponential, trigonometry and their
//     inverses) have no software engine here; they delegate to the f32 form and
//     widen the result, so on those targets an f64 transcendental result carries
//     f32 precision. That limit is intentional and documented.
//
// All functions avoid the Arduino macros (min/max/abs/round) by using the
// industrial names, so no macro expands inside these definitions.

#if defined(__has_include)
#if __has_include("e95_config.h")
#include "e95_config.h"
#endif
#endif

#ifndef E95_FLOAT64_SOFTWARE
#define E95_FLOAT64_SOFTWARE 0
#endif

static const f32 PI_RADIANS = 3.14159265358979323846f;
static const f32 HALF_TURN_DEGREES = 180.0f;
static const f32 ROUNDING_OFFSET = 0.5f;
static const u32 BIT_MASK = 1UL;
static const u32 LOW_BYTE_MASK = 0xFFUL;
static const u8 HIGH_BYTE_SHIFT = 8;
static const u8 BIT_WIDTH = 32;

#if E95_FLOAT64_SOFTWARE
// Binary64 layout and the constants the exact forms need. The values are built
// from their raw bits because on these targets the compiler `double` is only 32
// bits wide, so a decimal literal would collapse to f32 before reaching the
// `_e95_f64` constructor.
static const u64 FLOAT64_SIGN_MASK = 0x8000000000000000ULL;
static const u64 FLOAT64_EXPONENT_MASK = 0x7FF0000000000000ULL;
static const u64 FLOAT64_FRACTION_MASK = 0x000FFFFFFFFFFFFFULL;
static const u64 FLOAT64_HIDDEN_BIT = 0x0010000000000000ULL;
static const u64 FLOAT64_QUIET_NAN_BITS = 0x7FF8000000000000ULL;
static const u64 FLOAT64_POSITIVE_INFINITY_BITS = 0x7FF0000000000000ULL;
static const u64 LOW_WORD_MASK = 0xFFFFFFFFULL;
static const int FLOAT64_FRACTION_BITS = 52;
static const int FLOAT64_EXPONENT_BIAS = 1023;
static const int FLOAT64_EXPONENT_MAX = 0x7FF;
static const int FLOAT64_SUBNORMAL_EXPONENT_OFFSET = 1074;
static const int FLOAT64_SQUARE_ROOT_ITERATIONS = 3;

static const f64 PI_RADIANS_FLOAT64 =
	_e95_f64::fromBits(0x400921FBUL, 0x54442D18UL);
static const f64 HALF_TURN_DEGREES_FLOAT64 =
	_e95_f64::fromBits(0x40668000UL, 0x00000000UL);
static const f64 HALF_FLOAT64 = _e95_f64::fromBits(0x3FE00000UL, 0x00000000UL);
static const f64 ONE_FLOAT64 = _e95_f64::fromBits(0x3FF00000UL, 0x00000000UL);

static u32 highWord(u64 bits) {
	return (u32)(bits >> 32);
}

static u32 lowWord(u64 bits) {
	return (u32)(bits & LOW_WORD_MASK);
}

static f64 float64FromBits(u64 bits) {
	return _e95_f64::fromBits(highWord(bits), lowWord(bits));
}

static int float64Exponent(u64 bits) {
	return (int)((bits & FLOAT64_EXPONENT_MASK) >> FLOAT64_FRACTION_BITS);
}

static boolean float64IsFinite(u64 bits) {
	return float64Exponent(bits) != FLOAT64_EXPONENT_MAX;
}

static boolean float64IsZero(u64 bits) {
	return (bits & ~FLOAT64_SIGN_MASK) == 0;
}

static boolean float64IsNegative(u64 bits) {
	return (bits & FLOAT64_SIGN_MASK) != 0;
}

// Discards the fractional bits by masking them out of the binary64 pattern, so
// the result is exact for every magnitude instead of round-tripping through a
// narrow integer.
static f64 truncateFloat64(f64 value) {
	const u64 bits = value.bits;
	const int exponent = float64Exponent(bits);
	if (exponent == FLOAT64_EXPONENT_MAX) {
		return value;
	}
	const int unbiasedExponent = exponent - FLOAT64_EXPONENT_BIAS;
	if (unbiasedExponent < 0) {
		return float64FromBits(bits & FLOAT64_SIGN_MASK);
	}
	if (unbiasedExponent >= FLOAT64_FRACTION_BITS) {
		return value;
	}
	const u64 fractionalMask =
		(FLOAT64_HIDDEN_BIT >> unbiasedExponent) - 1;
	return float64FromBits(bits & ~fractionalMask);
}

static f64 roundDownFloat64(f64 value) {
	if (!float64IsFinite(value.bits)) {
		return value;
	}
	const f64 truncated = truncateFloat64(value);
	if (truncated == value) {
		return truncated;
	}
	if (float64IsNegative(value.bits)) {
		return truncated - ONE_FLOAT64;
	}
	return truncated;
}

static f64 roundUpFloat64(f64 value) {
	if (!float64IsFinite(value.bits)) {
		return value;
	}
	const f64 truncated = truncateFloat64(value);
	if (truncated == value) {
		return truncated;
	}
	if (float64IsNegative(value.bits)) {
		return truncated;
	}
	return truncated + ONE_FLOAT64;
}

static f64 roundNearestFloat64(f64 value) {
	if (!float64IsFinite(value.bits)) {
		return value;
	}
	const f64 truncated = truncateFloat64(value);
	const f64 fraction = value - truncated;
	if (fraction >= HALF_FLOAT64) {
		return truncated + ONE_FLOAT64;
	}
	if (fraction <= -HALF_FLOAT64) {
		return truncated - ONE_FLOAT64;
	}
	return truncated;
}

static f64 remainderFloat64(f64 value, f64 divisor) {
	return value - truncateFloat64(value / divisor) * divisor;
}

// Power of two as a binary64 value; used to bring the square-root seed back to
// the input magnitude.
static f64 float64PowerOfTwo(int exponent) {
	const int biasedExponent = exponent + FLOAT64_EXPONENT_BIAS;
	if (biasedExponent <= 0) {
		return float64FromBits(0);
	}
	if (biasedExponent >= FLOAT64_EXPONENT_MAX) {
		return float64FromBits(FLOAT64_POSITIVE_INFINITY_BITS);
	}
	return float64FromBits((u64)(biasedExponent) << FLOAT64_FRACTION_BITS);
}

// Halves an exponent rounding toward negative infinity, so the scale keeps the
// magnitude when the exponent is odd (e.g. -3 -> -2).
static int halfExponent(int exponent) {
	if (exponent >= 0) {
		return exponent / 2;
	}
	return -((-exponent + 1) / 2);
}

static int highestSetBit(u64 value) {
	int index = 0;
	while (value > 1) {
		value >>= 1;
		index++;
	}
	return index;
}

// Newton iteration in binary64. The seed is an f32 square root of the mantissa
// scaled by the halved exponent, so it already sits next to the result; each
// iteration doubles the correct bits and three steps reach the f64 mantissa
// without passing the result through f32.
static f64 squareRootFloat64(f64 value) {
	const u64 bits = value.bits;
	if (float64IsNegative(bits)) {
		return float64FromBits(FLOAT64_QUIET_NAN_BITS);
	}
	const int exponent = float64Exponent(bits);
	if (exponent == FLOAT64_EXPONENT_MAX || float64IsZero(bits)) {
		return value;
	}
	int unbiasedExponent = exponent - FLOAT64_EXPONENT_BIAS;
	u64 mantissaBits = bits & FLOAT64_FRACTION_MASK;
	if (exponent == 0) {
		// Subnormal: normalize the mantissa so the halved exponent stays right.
		const int topBit = highestSetBit(mantissaBits);
		unbiasedExponent = topBit - FLOAT64_SUBNORMAL_EXPONENT_OFFSET;
		mantissaBits = (mantissaBits << (FLOAT64_FRACTION_BITS - topBit)) &
			       FLOAT64_FRACTION_MASK;
	}
	const boolean oddExponent = (unbiasedExponent % 2) != 0;
	u64 normalizedBits = mantissaBits |
			     ((u64)(FLOAT64_EXPONENT_BIAS)
			      << FLOAT64_FRACTION_BITS);
	if (oddExponent) {
		normalizedBits += FLOAT64_HIDDEN_BIT;
	}
	// Iterate on the normalized value in [1, 4), so the arithmetic never touches
	// a subnormal or an extreme exponent; the exponent scale is applied once at
	// the end.
	const f64 normalized = float64FromBits(normalizedBits);
	f64 result = (f64)::sqrt((f32)normalized);
	for (int iteration = 0; iteration < FLOAT64_SQUARE_ROOT_ITERATIONS;
	     iteration++) {
		result = (result + normalized / result) * HALF_FLOAT64;
	}
	return result * float64PowerOfTwo(halfExponent(unbiasedExponent));
}
#else
static const f64 PI_RADIANS_FLOAT64 = 3.14159265358979323846;
static const f64 HALF_TURN_DEGREES_FLOAT64 = 180.0;
static const f64 ROUNDING_OFFSET_FLOAT64 = 0.5;
#endif

// The algebraic forms have the same body for both widths, so one template keeps
// a single implementation here and the width is the template argument.
template <typename FloatType>
static FloatType interpolateRangeValue(FloatType value, FloatType sourceMinimum, FloatType sourceMaximum, FloatType targetMinimum, FloatType targetMaximum) {
	return (value - sourceMinimum) * (targetMaximum - targetMinimum) / (sourceMaximum - sourceMinimum) + targetMinimum;
}

template <typename FloatType>
static FloatType clampValue(FloatType value, FloatType minimum, FloatType maximum) {
	if (value < minimum) {
		return minimum;
	}
	if (value > maximum) {
		return maximum;
	}
	return value;
}

template <typename FloatType>
static FloatType minimumValue(FloatType left, FloatType right) {
	return left < right ? left : right;
}

template <typename FloatType>
static FloatType maximumValue(FloatType left, FloatType right) {
	return left > right ? left : right;
}

template <typename FloatType>
static FloatType squareValue(FloatType value) {
	return value * value;
}

i32 interpolateRange(i32 value, i32 sourceMinimum, i32 sourceMaximum, i32 targetMinimum, i32 targetMaximum) {
	const i64 sourceSpan = (i64)(sourceMaximum) - (i64)(sourceMinimum);
	const i64 targetSpan = (i64)(targetMaximum) - (i64)(targetMinimum);
	const i64 offset = (i64)(value) - (i64)(sourceMinimum);
	return (i32)((offset * targetSpan) / sourceSpan + (i64)(targetMinimum));
}

// The u32 form keeps the public type unsigned but does the ratio in 64 bits, so
// the intermediate product of a large source span does not wrap.
u32 interpolateRange(u32 value, u32 sourceMinimum, u32 sourceMaximum, u32 targetMinimum, u32 targetMaximum) {
	const i64 sourceSpan = (i64)(sourceMaximum) - (i64)(sourceMinimum);
	const i64 targetSpan = (i64)(targetMaximum) - (i64)(targetMinimum);
	const i64 offset = (i64)(value) - (i64)(sourceMinimum);
	return (u32)((offset * targetSpan) / sourceSpan + (i64)(targetMinimum));
}

// The i64 form stays in 64 bits end to end: a u32 value above the i32 range
// keeps its magnitude instead of wrapping negative on the way in. The only
// inexact case is an intermediate product that overflows i64, which is outside
// the i32/u32 ranges this overload exists for.
i64 interpolateRangeInteger64(i64 value, i64 sourceMinimum, i64 sourceMaximum, i64 targetMinimum, i64 targetMaximum) {
	const i64 sourceSpan = sourceMaximum - sourceMinimum;
	const i64 targetSpan = targetMaximum - targetMinimum;
	const i64 offset = value - sourceMinimum;
	return (offset * targetSpan) / sourceSpan + targetMinimum;
}

f32 interpolateRangeFloat(f32 value, f32 sourceMinimum, f32 sourceMaximum, f32 targetMinimum, f32 targetMaximum) {
	return interpolateRangeValue(value, sourceMinimum, sourceMaximum, targetMinimum, targetMaximum);
}

f64 interpolateRangeFloat(f64 value, f64 sourceMinimum, f64 sourceMaximum, f64 targetMinimum, f64 targetMaximum) {
	return interpolateRangeValue(value, sourceMinimum, sourceMaximum, targetMinimum, targetMaximum);
}

i32 clamp(i32 value, i32 minimum, i32 maximum) {
	if (value < minimum) {
		return minimum;
	}
	if (value > maximum) {
		return maximum;
	}
	return value;
}

u32 clamp(u32 value, u32 minimum, u32 maximum) {
	return clampValue(value, minimum, maximum);
}

i64 clampInteger64(i64 value, i64 minimum, i64 maximum) {
	return clampValue(value, minimum, maximum);
}

f32 clampFloat(f32 value, f32 minimum, f32 maximum) {
	return clampValue(value, minimum, maximum);
}

f64 clampFloat(f64 value, f64 minimum, f64 maximum) {
	return clampValue(value, minimum, maximum);
}

f32 power(f32 base, f32 exponent) {
	return (f32)::pow(base, exponent);
}

#if E95_FLOAT64_SOFTWARE
// Transcendentals without a software engine: f32 result widened to f64.
f64 power(f64 base, f64 exponent) {
	return (f64)(f32)::pow((f32)base, (f32)exponent);
}
#else
f64 power(f64 base, f64 exponent) {
	return ::pow(base, exponent);
}
#endif

f32 squareRoot(f32 value) {
	return (f32)::sqrt(value);
}

#if E95_FLOAT64_SOFTWARE
f64 squareRoot(f64 value) {
	return squareRootFloat64(value);
}
#else
f64 squareRoot(f64 value) {
	return ::sqrt(value);
}
#endif

f32 square(f32 value) {
	return squareValue(value);
}

f64 square(f64 value) {
	return squareValue(value);
}

f32 naturalLog(f32 value) {
	return (f32)::log(value);
}

#if E95_FLOAT64_SOFTWARE
f64 naturalLog(f64 value) {
	return (f64)(f32)::log((f32)value);
}
#else
f64 naturalLog(f64 value) {
	return ::log(value);
}
#endif

f32 logarithm10(f32 value) {
	return (f32)::log10(value);
}

#if E95_FLOAT64_SOFTWARE
f64 logarithm10(f64 value) {
	return (f64)(f32)::log10((f32)value);
}
#else
f64 logarithm10(f64 value) {
	return ::log10(value);
}
#endif

f32 exponential(f32 value) {
	return (f32)::exp(value);
}

#if E95_FLOAT64_SOFTWARE
f64 exponential(f64 value) {
	return (f64)(f32)::exp((f32)value);
}
#else
f64 exponential(f64 value) {
	return ::exp(value);
}
#endif

// The most negative i32 has no representable positive counterpart, so this
// form keeps its historical behavior (two's-complement wraparound on the
// targets we support) rather than changing the word-sized path.
i32 absolute(i32 value) {
	return value < 0 ? -value : value;
}

// An unsigned value is already its own magnitude.
u32 absolute(u32 value) {
	return value;
}

// Negating through u64 keeps the operation well defined for every input,
// including the most negative i64, whose magnitude is not representable.
i64 absoluteInteger64(i64 value) {
	return value < 0 ? (i64)(0ULL - (u64)(value)) : value;
}

f32 absoluteFloat(f32 value) {
	return (f32)::fabs(value);
}

#if E95_FLOAT64_SOFTWARE
f64 absoluteFloat(f64 value) {
	return float64FromBits(value.bits & ~FLOAT64_SIGN_MASK);
}
#else
f64 absoluteFloat(f64 value) {
	return ::fabs(value);
}
#endif

i32 minimum(i32 left, i32 right) {
	return left < right ? left : right;
}

u32 minimum(u32 left, u32 right) {
	return minimumValue(left, right);
}

i64 minimumInteger64(i64 left, i64 right) {
	return minimumValue(left, right);
}

f32 minimumFloat(f32 left, f32 right) {
	return minimumValue(left, right);
}

f64 minimumFloat(f64 left, f64 right) {
	return minimumValue(left, right);
}

i32 maximum(i32 left, i32 right) {
	return left > right ? left : right;
}

u32 maximum(u32 left, u32 right) {
	return maximumValue(left, right);
}

i64 maximumInteger64(i64 left, i64 right) {
	return maximumValue(left, right);
}

f32 maximumFloat(f32 left, f32 right) {
	return maximumValue(left, right);
}

f64 maximumFloat(f64 left, f64 right) {
	return maximumValue(left, right);
}

f32 roundDown(f32 value) {
	return (f32)::floor(value);
}

#if E95_FLOAT64_SOFTWARE
f64 roundDown(f64 value) {
	return roundDownFloat64(value);
}
#else
f64 roundDown(f64 value) {
	return ::floor(value);
}
#endif

f32 roundUp(f32 value) {
	return (f32)::ceil(value);
}

#if E95_FLOAT64_SOFTWARE
f64 roundUp(f64 value) {
	return roundUpFloat64(value);
}
#else
f64 roundUp(f64 value) {
	return ::ceil(value);
}
#endif

f32 roundNearest(f32 value) {
	if (value >= 0.0f) {
		return (f32)::floor(value + ROUNDING_OFFSET);
	}
	return (f32)::ceil(value - ROUNDING_OFFSET);
}

#if E95_FLOAT64_SOFTWARE
f64 roundNearest(f64 value) {
	return roundNearestFloat64(value);
}
#else
f64 roundNearest(f64 value) {
	if (value >= 0.0) {
		return ::floor(value + ROUNDING_OFFSET_FLOAT64);
	}
	return ::ceil(value - ROUNDING_OFFSET_FLOAT64);
}
#endif

f32 remainderFloat(f32 value, f32 divisor) {
	return (f32)::fmod(value, divisor);
}

#if E95_FLOAT64_SOFTWARE
f64 remainderFloat(f64 value, f64 divisor) {
	return remainderFloat64(value, divisor);
}
#else
f64 remainderFloat(f64 value, f64 divisor) {
	return ::fmod(value, divisor);
}
#endif

f32 truncate(f32 value) {
	return (f32)::trunc(value);
}

#if E95_FLOAT64_SOFTWARE
f64 truncate(f64 value) {
	return truncateFloat64(value);
}
#else
f64 truncate(f64 value) {
	return ::trunc(value);
}
#endif

boolean readBitValue(u32 value, u8 bitIndex) {
	return ((value >> bitIndex) & BIT_MASK) != 0;
}

u32 writeBitValue(u32 value, u8 bitIndex, boolean bitValue) {
	if (bitValue) {
		return value | (BIT_MASK << bitIndex);
	}
	return value & ~(BIT_MASK << bitIndex);
}

u32 setBitValue(u32 value, u8 bitIndex) {
	return value | (BIT_MASK << bitIndex);
}

u32 clearBitValue(u32 value, u8 bitIndex) {
	return value & ~(BIT_MASK << bitIndex);
}

u8 lowByteValue(u32 value) {
	return (u8)(value & LOW_BYTE_MASK);
}

u8 highByteValue(u32 value) {
	return (u8)((value >> HIGH_BYTE_SHIFT) & LOW_BYTE_MASK);
}

u32 bitMask(u8 bitIndex) {
	if (bitIndex >= BIT_WIDTH) {
		return 0;
	}
	return BIT_MASK << bitIndex;
}

f32 sine(f32 radians) {
	return (f32)::sin(radians);
}

#if E95_FLOAT64_SOFTWARE
f64 sine(f64 radians) {
	return (f64)(f32)::sin((f32)radians);
}
#else
f64 sine(f64 radians) {
	return ::sin(radians);
}
#endif

f32 cosine(f32 radians) {
	return (f32)::cos(radians);
}

#if E95_FLOAT64_SOFTWARE
f64 cosine(f64 radians) {
	return (f64)(f32)::cos((f32)radians);
}
#else
f64 cosine(f64 radians) {
	return ::cos(radians);
}
#endif

f32 tangent(f32 radians) {
	return (f32)::tan(radians);
}

#if E95_FLOAT64_SOFTWARE
f64 tangent(f64 radians) {
	return (f64)(f32)::tan((f32)radians);
}
#else
f64 tangent(f64 radians) {
	return ::tan(radians);
}
#endif

f32 arcSine(f32 value) {
	return (f32)::asin(value);
}

#if E95_FLOAT64_SOFTWARE
f64 arcSine(f64 value) {
	return (f64)(f32)::asin((f32)value);
}
#else
f64 arcSine(f64 value) {
	return ::asin(value);
}
#endif

f32 arcCosine(f32 value) {
	return (f32)::acos(value);
}

#if E95_FLOAT64_SOFTWARE
f64 arcCosine(f64 value) {
	return (f64)(f32)::acos((f32)value);
}
#else
f64 arcCosine(f64 value) {
	return ::acos(value);
}
#endif

f32 arcTangent(f32 value) {
	return (f32)::atan(value);
}

#if E95_FLOAT64_SOFTWARE
f64 arcTangent(f64 value) {
	return (f64)(f32)::atan((f32)value);
}
#else
f64 arcTangent(f64 value) {
	return ::atan(value);
}
#endif

f32 arcTangent2(f32 y, f32 x) {
	return (f32)::atan2(y, x);
}

#if E95_FLOAT64_SOFTWARE
f64 arcTangent2(f64 y, f64 x) {
	return (f64)(f32)::atan2((f32)y, (f32)x);
}
#else
f64 arcTangent2(f64 y, f64 x) {
	return ::atan2(y, x);
}
#endif

f32 toRadians(f32 degrees) {
	return degrees * PI_RADIANS / HALF_TURN_DEGREES;
}

f64 toRadians(f64 degrees) {
	return degrees * PI_RADIANS_FLOAT64 / HALF_TURN_DEGREES_FLOAT64;
}

f32 toDegrees(f32 radians) {
	return radians * HALF_TURN_DEGREES / PI_RADIANS;
}

f64 toDegrees(f64 radians) {
	return radians * HALF_TURN_DEGREES_FLOAT64 / PI_RADIANS_FLOAT64;
}


i32 randomInteger(i32 minimum, i32 maximum) {
	if (maximum <= minimum) {
		return minimum;
	}
	return minimum + (i32)(::rand() % (maximum - minimum));
}

void seedRandom(u32 seed) {
	::srand(seed);
}

} // namespace core_math
