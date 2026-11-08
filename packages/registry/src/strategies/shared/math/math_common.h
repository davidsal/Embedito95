// Shared math declarations, platform-agnostic.
// Inlined into each platform's core_math.h via _e95_replace_common.
//
// The integer variants cover whole-number forms (remap/clamp/min/max/abs); the
// *Float variants cover the fractional forms. `randomInteger` and `seedRandom`
// are declared here but defined per platform (AVR PRNG vs. the C library PRNG),
// so the rest of the surface is identical on every target.

i32 interpolateRange(i32 value, i32 sourceMinimum, i32 sourceMaximum, i32 targetMinimum, i32 targetMaximum);
f32 interpolateRangeFloat(f32 value, f32 sourceMinimum, f32 sourceMaximum, f32 targetMinimum, f32 targetMaximum);

i32 clamp(i32 value, i32 minimum, i32 maximum);
f32 clampFloat(f32 value, f32 minimum, f32 maximum);

f32 power(f32 base, f32 exponent);
f32 squareRoot(f32 value);
f32 square(f32 value);
f32 naturalLog(f32 value);
f32 logarithm10(f32 value);
f32 exponential(f32 value);
i32 absolute(i32 value);
f32 absoluteFloat(f32 value);
i32 minimum(i32 left, i32 right);
f32 minimumFloat(f32 left, f32 right);
i32 maximum(i32 left, i32 right);
f32 maximumFloat(f32 left, f32 right);

f32 roundDown(f32 value);
f32 roundUp(f32 value);
f32 roundNearest(f32 value);
f32 remainderFloat(f32 value, f32 divisor);
f32 truncate(f32 value);

i32 randomInteger(i32 minimum, i32 maximum);
void seedRandom(u32 seed);

boolean readBitValue(u32 value, u8 bitIndex);
u32 writeBitValue(u32 value, u8 bitIndex, boolean bitValue);
u32 setBitValue(u32 value, u8 bitIndex);
u32 clearBitValue(u32 value, u8 bitIndex);
u8 lowByteValue(u32 value);
u8 highByteValue(u32 value);
u32 bitMask(u8 bitIndex);

f32 sine(f32 radians);
f32 cosine(f32 radians);
f32 tangent(f32 radians);
f32 arcSine(f32 value);
f32 arcCosine(f32 value);
f32 arcTangent(f32 value);
f32 arcTangent2(f32 y, f32 x);
f32 toRadians(f32 degrees);
f32 toDegrees(f32 radians);
