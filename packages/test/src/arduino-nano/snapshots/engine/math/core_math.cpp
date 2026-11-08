#include "core_math.h"

namespace core_math {

// Shared math implementation, platform-agnostic.
// Inlined into each platform's core_math.cpp via _e95_replace_common.
//
// All functions avoid the Arduino macros (min/max/abs/round) by using the
// industrial names, so no macro expands inside these definitions.

static const f32 PI_RADIANS = 3.14159265358979323846f;
static const f32 HALF_TURN_DEGREES = 180.0f;
static const f32 ROUNDING_OFFSET = 0.5f;
static const u32 BIT_MASK = 1UL;
static const u32 LOW_BYTE_MASK = 0xFFUL;
static const u8 HIGH_BYTE_SHIFT = 8;
static const u8 BIT_WIDTH = 32;

i32 interpolateRange(i32 value, i32 sourceMinimum, i32 sourceMaximum, i32 targetMinimum, i32 targetMaximum) {
	const i64 sourceSpan = (i64)(sourceMaximum) - (i64)(sourceMinimum);
	const i64 targetSpan = (i64)(targetMaximum) - (i64)(targetMinimum);
	const i64 offset = (i64)(value) - (i64)(sourceMinimum);
	return (i32)((offset * targetSpan) / sourceSpan + (i64)(targetMinimum));
}

f32 interpolateRangeFloat(f32 value, f32 sourceMinimum, f32 sourceMaximum, f32 targetMinimum, f32 targetMaximum) {
	return (value - sourceMinimum) * (targetMaximum - targetMinimum) / (sourceMaximum - sourceMinimum) + targetMinimum;
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

f32 clampFloat(f32 value, f32 minimum, f32 maximum) {
	if (value < minimum) {
		return minimum;
	}
	if (value > maximum) {
		return maximum;
	}
	return value;
}

f32 power(f32 base, f32 exponent) {
	return (f32)::pow(base, exponent);
}

f32 squareRoot(f32 value) {
	return (f32)::sqrt(value);
}

f32 square(f32 value) {
	return value * value;
}

f32 naturalLog(f32 value) {
	return (f32)::log(value);
}

f32 logarithm10(f32 value) {
	return (f32)::log10(value);
}

f32 exponential(f32 value) {
	return (f32)::exp(value);
}

i32 absolute(i32 value) {
	return value < 0 ? -value : value;
}

f32 absoluteFloat(f32 value) {
	return (f32)::fabs(value);
}

i32 minimum(i32 left, i32 right) {
	return left < right ? left : right;
}

f32 minimumFloat(f32 left, f32 right) {
	return left < right ? left : right;
}

i32 maximum(i32 left, i32 right) {
	return left > right ? left : right;
}

f32 maximumFloat(f32 left, f32 right) {
	return left > right ? left : right;
}

f32 roundDown(f32 value) {
	return (f32)::floor(value);
}

f32 roundUp(f32 value) {
	return (f32)::ceil(value);
}

f32 roundNearest(f32 value) {
	if (value >= 0.0f) {
		return (f32)::floor(value + ROUNDING_OFFSET);
	}
	return (f32)::ceil(value - ROUNDING_OFFSET);
}

f32 remainderFloat(f32 value, f32 divisor) {
	return (f32)::fmod(value, divisor);
}

f32 truncate(f32 value) {
	return (f32)::trunc(value);
}

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

f32 cosine(f32 radians) {
	return (f32)::cos(radians);
}

f32 tangent(f32 radians) {
	return (f32)::tan(radians);
}

f32 arcSine(f32 value) {
	return (f32)::asin(value);
}

f32 arcCosine(f32 value) {
	return (f32)::acos(value);
}

f32 arcTangent(f32 value) {
	return (f32)::atan(value);
}

f32 arcTangent2(f32 y, f32 x) {
	return (f32)::atan2(y, x);
}

f32 toRadians(f32 degrees) {
	return degrees * PI_RADIANS / HALF_TURN_DEGREES;
}

f32 toDegrees(f32 radians) {
	return radians * HALF_TURN_DEGREES / PI_RADIANS;
}


i32 randomInteger(i32 minimum, i32 maximum) {
	if (maximum <= minimum) {
		return minimum;
	}
	return minimum + (i32)::random((long)(maximum - minimum));
}

void seedRandom(u32 seed) {
	::randomSeed((unsigned long)seed);
}

} // namespace core_math
