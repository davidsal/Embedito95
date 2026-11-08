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
	const f32 natural = core_math::naturalLog(2.7182817);
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
}

void loop() {
}
