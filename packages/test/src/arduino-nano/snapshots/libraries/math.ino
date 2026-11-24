// CORE
#include <core_math.h>
#include <core_system.h>
#include <core_type.h>

i32 testInterpolateRangeIntegers() {
	const i32 atMinimum = core_math::interpolateRange(0, 0, 1023, 0, 255);
	const i32 atMaximum = core_math::interpolateRange(1023, 0, 1023, 0, 255);
	const i32 middle = core_math::interpolateRange(512, 0, 1023, 0, 255);
	const i32 inverted = core_math::interpolateRange(1023, 0, 1023, 255, 0);
	const i32 narrow = core_math::interpolateRange(5, 0, 10, 0, 1);
	return (((atMinimum + atMaximum) + middle) + inverted) + narrow;
}

f32 testInterpolateRangeFloat() {
	const f32 atMinimum = core_math::interpolateRangeFloat(0.0f, 0.0f, 1023.0f, 0.0f, 5.0f);
	const f32 atMaximum = core_math::interpolateRangeFloat(1023.0f, 0.0f, 1023.0f, 0.0f, 5.0f);
	const f32 inverted = core_math::interpolateRangeFloat(1023.0f, 0.0f, 1023.0f, 5.0f, 0.0f);
	return (atMinimum + atMaximum) + inverted;
}

i32 testClampIntegers() {
	const i32 below = core_math::clamp(-10, 0, 100);
	const i32 inside = core_math::clamp(50, 0, 100);
	const i32 above = core_math::clamp(250, 0, 100);
	return (below + inside) + above;
}

f32 testClampFloat() {
	const f32 below = core_math::clampFloat(-1.5f, 0.0f, 1.0f);
	const f32 inside = core_math::clampFloat(0.5f, 0.0f, 1.0f);
	const f32 above = core_math::clampFloat(2.5f, 0.0f, 1.0f);
	return (below + inside) + above;
}

i32 testIntegerMath() {
	const i32 magnitude = core_math::absolute(-42);
	const i32 smallest = core_math::minimum(3, 8);
	const i32 largest = core_math::maximum(3, 8);
	return (magnitude + smallest) + largest;
}

f32 testFloatMath() {
	const f32 raised = core_math::power(2.0f, 10.0f);
	const f32 root = core_math::squareRoot(16.0f);
	const f32 squared = core_math::square(4.0f);
	const f32 magnitude = core_math::absoluteFloat(-3.5f);
	const f32 smallest = core_math::minimumFloat(1.5f, 0.5f);
	const f32 largest = core_math::maximumFloat(1.5f, 0.5f);
	return ((((raised + root) + squared) + magnitude) + smallest) + largest;
}

f32 testLogarithms() {
	const f32 natural = core_math::naturalLog(2.718282f);
	const f32 decimal = core_math::logarithm10(100.0f);
	const f32 raised = core_math::exponential(1.0f);
	return (natural + decimal) + raised;
}

f32 testRemainderAndTruncate() {
	const f32 remainder = core_math::remainderFloat(5.5f, 2.0f);
	const f32 negativeRemainder = core_math::remainderFloat(-5.5f, 2.0f);
	const f32 towardPositive = core_math::truncate(3.9f);
	const f32 towardNegative = core_math::truncate(-3.9f);
	return ((remainder + negativeRemainder) + towardPositive) + towardNegative;
}

f32 testRounding() {
	const f32 down = core_math::roundDown(3.7f);
	const f32 up = core_math::roundUp(3.2f);
	const f32 nearest = core_math::roundNearest(3.5f);
	const f32 nearestNegative = core_math::roundNearest(-3.5f);
	return ((down + up) + nearest) + nearestNegative;
}

i32 testRandom() {
	core_math::seedRandom(12345);
	const i32 first = core_math::randomInteger(0, 100);
	const i32 second = core_math::randomInteger(0, 100);
	return first + second;
}

i64 testBitHelpers() {
	const u32 source = 10;
	const boolean isSet = core_math::readBitValue(source, 1);
	const u32 withHigh = core_math::setBitValue(source, 3);
	const u32 withLow = core_math::clearBitValue(source, 1);
	const u32 conditional = core_math::writeBitValue(source, 2, isSet);
	if (isSet) {
		return (i64)(((withHigh + withLow) + conditional)) + (i64)(1);
	}
	return (withHigh + withLow) + conditional;
}

u32 testByteAndMaskHelpers() {
	const u32 source = 43981;
	const u8 low = core_math::lowByteValue(source);
	const u8 high = core_math::highByteValue(source);
	const u32 firstBit = core_math::bitMask(0);
	const u32 eighthBit = core_math::bitMask(7);
	const u32 highestBit = core_math::bitMask(31);
	const u32 outOfRange = core_math::bitMask(32);
	return ((((i64)(((i16)(low) + (i16)(high))) + (i64)(firstBit)) + (i64)(eighthBit)) + (i64)(highestBit)) + (i64)(outOfRange);
}

f32 testTrigonometry() {
	const f32 sinZero = core_math::sine(0.0f);
	const f32 cosZero = core_math::cosine(0.0f);
	const f32 tanZero = core_math::tangent(0.0f);
	const f32 radians = core_math::toRadians(180.0f);
	const f32 degrees = core_math::toDegrees(radians);
	return (((sinZero + cosZero) + tanZero) + radians) + degrees;
}

f32 testInverseTrigonometry() {
	const f32 fromSine = core_math::arcSine(0.5f);
	const f32 fromCosine = core_math::arcCosine(0.5f);
	const f32 fromTangent = core_math::arcTangent(1.0f);
	const f32 quadrant = core_math::arcTangent2(1.0f, -1.0f);
	const f32 domainEdge = core_math::arcSine(1.0f);
	return (((fromSine + fromCosine) + fromTangent) + quadrant) + domainEdge;
}

f64 testFloat64Helpers() {
	const f64 precise = f64::fromBits(0x400921fbu, 0x54442d11u);
	const f32 singlePrecision = core_math::squareRoot(16.0f);
	const f64 doublePrecision = core_math::squareRoot(precise);
	const f64 squared = core_math::square(precise);
	const f64 clamped = core_math::clampFloat(precise, f64::fromBits(0x00000000u, 0x00000000u), f64::fromBits(0x40080000u, 0x00000000u));
	const f64 remapped = core_math::interpolateRangeFloat(precise, f64::fromBits(0x00000000u, 0x00000000u), f64::fromBits(0x400921fbu, 0x54442d11u), f64::fromBits(0x00000000u, 0x00000000u), f64::fromBits(0x40590000u, 0x00000000u));
	const f64 rounded = core_math::roundNearest(precise);
	const f64 truncated = core_math::truncate(precise);
	const f64 remainder = core_math::remainderFloat(precise, f64::fromBits(0x3fe00000u, 0x00000000u));
	const f64 magnitude = core_math::absoluteFloat(-precise);
	const f64 smallest = core_math::minimumFloat(precise, f64::fromBits(0x40080000u, 0x00000000u));
	const f64 radians = core_math::toRadians(precise);
	const f64 sineValue = core_math::sine(precise);
	const f64 wideNatural = core_math::naturalLog(precise);
	const f64 mixedMinimum = core_math::minimumFloat((f64)(singlePrecision), precise);
	const f64 mixedPower = core_math::power((f64)(singlePrecision), precise);
	const f64 mixedRemapped = core_math::interpolateRangeFloat((f64)(singlePrecision), f64::fromBits(0x00000000u, 0x00000000u), f64::fromBits(0x3ff00000u, 0x00000000u), f64::fromBits(0x00000000u, 0x00000000u), precise);
	return (((((((((((((((f64)(singlePrecision) + doublePrecision) + squared) + clamped) + remapped) + rounded) + truncated) + remainder) + magnitude) + smallest) + radians) + sineValue) + wideNatural) + mixedMinimum) + mixedPower) + mixedRemapped;
}

f64 testFloat64Inference(f64 value) {
	const f64 inferredSquare = core_math::square(value);
	const f64 inferredRoot = core_math::squareRoot(value);
	return inferredSquare + inferredRoot;
}

f32 testMixedWidthNarrowing(f64 value) {
	const f32 remapped = (f32)(core_math::interpolateRangeFloat(value, f64::fromBits(0x00000000u, 0x00000000u), f64::fromBits(0x3ff00000u, 0x00000000u), f64::fromBits(0x00000000u, 0x00000000u), f64::fromBits(0x40590000u, 0x00000000u)));
	return remapped;
}

f64 testWidenedIntegerProduct(u32 count, i16 factor) {
	const i64 product = (i64)(count) * (i64)(factor);
	const f64 squared = core_math::square((f64)(product));
	return squared;
}

i32 testWidenedIntegerNarrowing(u64 wide) {
	const i32 bounded = (i32)(core_math::clamp((i64)(wide), 0, 100));
	return bounded;
}

i64 testLargeUnsignedIntegerMath(u32 value) {
	const i64 clamped = core_math::clamp((i64)(value), 0, 10);
	const i64 wideClamped = core_math::clamp((i64)(value), 0, 4000000000);
	const i64 smallest = core_math::minimum((i64)(value), 2000000000);
	const i64 largest = core_math::maximum((i64)(value), 2000000000);
	const i64 magnitude = core_math::absolute(value);
	const i64 remapped = core_math::interpolateRange((i64)(value), 0, 4000000000, 0, 1000);
	const u32 zero = 0;
	const u32 upper = 4000000000;
	const u32 allUnsigned = core_math::clamp(value, zero, upper);
	const u32 allUnsignedSmallest = core_math::minimum(value, upper);
	const i32 small = core_math::clamp(5, 0, 10);
	return (((((((clamped + wideClamped) + smallest) + largest) + magnitude) + remapped) + (i64)(allUnsigned)) + (i64)(allUnsignedSmallest)) + (i64)(small);
}

i64 testLargeUnsignedWithSignedBounds(u32 wide, i32 low, i32 high) {
	const i64 clamped = core_math::clamp((i64)(wide), low, high);
	const i64 remapped = core_math::interpolateRange((i64)(wide), low, high, 0, 1000);
	return clamped + remapped;
}

u32 testMixedUnsignedIntegerMath(u8 small, u32 wide) {
	const u32 lowFirst = core_math::clamp(small, wide, wide);
	const u32 lowLast = core_math::clamp(wide, wide, small);
	const u32 smallest = core_math::minimum(small, wide);
	return (lowFirst + lowLast) + smallest;
}

void setup() {
	testInterpolateRangeIntegers();
	testInterpolateRangeFloat();
	testClampIntegers();
	testClampFloat();
	testIntegerMath();
	testFloatMath();
	testLogarithms();
	testRounding();
	testRemainderAndTruncate();
	testRandom();
	testBitHelpers();
	testByteAndMaskHelpers();
	testTrigonometry();
	testInverseTrigonometry();
	testFloat64Helpers();
	testFloat64Inference(f64::fromBits(0x400921fbu, 0x54442d11u));
	testMixedWidthNarrowing(f64::fromBits(0x400921fbu, 0x54442d11u));
	testWidenedIntegerProduct(2, 3);
	testWidenedIntegerNarrowing(7);
	testLargeUnsignedIntegerMath(3000000000);
	testLargeUnsignedWithSignedBounds(3000000000, -5, 10);
	testMixedUnsignedIntegerMath(5, 3000000000);
}

void loop() {
}
