// Shared math declarations, platform-agnostic.
// Inlined into each platform's core_math.h via _e95_replace_common.
//
// The integer variants cover whole-number forms (remap/clamp/min/max/abs); the
// floating-point variants are declared twice, once per width: the f32 form
// keeps the single-precision cost, the f64 form keeps double precision and
// never narrows its inputs. The integer family is declared per width too: the
// i32 form keeps the cheap word-sized path, the u32 form handles all-unsigned
// calls, and the i64 form keeps the full magnitude of a mixed value above the
// i32 range instead of wrapping it negative. The pseudo-random surface stays
// i32/u32, and the bit helpers stay u32/u8.
// `randomInteger` and `seedRandom` are declared here but defined per platform
// (AVR PRNG vs. the C library PRNG), so the rest of the surface is identical on
// every target.

// `int` converts to both `i32` and `i64` through standard conversions, so a
// plain i64 overload would make an i32-fitting call ambiguous. Each i64 entry
// point is therefore a template enabled only when at least one argument does
// not fit i32: an i32-fitting call always resolves to the plain i32 function
// with no cast at the call site, and a wide call selects the i64 body.
template <typename Type>
struct IsUnsigned32 {
	static const bool value = false;
};

template <>
struct IsUnsigned32<u32> {
	static const bool value = true;
};

template <typename Type>
struct FitsInInt32 {
	static const bool value = sizeof(Type) <= 4 && !IsUnsigned32<Type>::value;
};

template <typename... Types>
struct AllFitInInt32 {
	static const bool value = true;
};

template <typename First, typename... Rest>
struct AllFitInInt32<First, Rest...> {
	static const bool value =
		FitsInInt32<First>::value && AllFitInInt32<Rest...>::value;
};

template <bool Condition, typename Type = void>
struct EnableWhen {};

template <typename Type>
struct EnableWhen<true, Type> {
	typedef Type type;
};

i64 interpolateRangeInteger64(i64 value, i64 sourceMinimum, i64 sourceMaximum, i64 targetMinimum, i64 targetMaximum);
i64 clampInteger64(i64 value, i64 minimum, i64 maximum);
i64 absoluteInteger64(i64 value);
i64 minimumInteger64(i64 left, i64 right);
i64 maximumInteger64(i64 left, i64 right);

i32 interpolateRange(i32 value, i32 sourceMinimum, i32 sourceMaximum, i32 targetMinimum, i32 targetMaximum);
u32 interpolateRange(u32 value, u32 sourceMinimum, u32 sourceMaximum, u32 targetMinimum, u32 targetMaximum);

template <typename Value, typename SourceMinimum, typename SourceMaximum, typename TargetMinimum, typename TargetMaximum>
typename EnableWhen<!AllFitInInt32<Value, SourceMinimum, SourceMaximum, TargetMinimum, TargetMaximum>::value, i64>::type
interpolateRange(Value value, SourceMinimum sourceMinimum, SourceMaximum sourceMaximum, TargetMinimum targetMinimum, TargetMaximum targetMaximum) {
	return interpolateRangeInteger64(
		(i64)value,
		(i64)sourceMinimum,
		(i64)sourceMaximum,
		(i64)targetMinimum,
		(i64)targetMaximum);
}

f32 interpolateRangeFloat(f32 value, f32 sourceMinimum, f32 sourceMaximum, f32 targetMinimum, f32 targetMaximum);
f64 interpolateRangeFloat(f64 value, f64 sourceMinimum, f64 sourceMaximum, f64 targetMinimum, f64 targetMaximum);

i32 clamp(i32 value, i32 minimum, i32 maximum);
u32 clamp(u32 value, u32 minimum, u32 maximum);

template <typename Value, typename Minimum, typename Maximum>
typename EnableWhen<!AllFitInInt32<Value, Minimum, Maximum>::value, i64>::type
clamp(Value value, Minimum minimum, Maximum maximum) {
	return clampInteger64((i64)value, (i64)minimum, (i64)maximum);
}

f32 clampFloat(f32 value, f32 minimum, f32 maximum);
f64 clampFloat(f64 value, f64 minimum, f64 maximum);

f32 power(f32 base, f32 exponent);
f64 power(f64 base, f64 exponent);
f32 squareRoot(f32 value);
f64 squareRoot(f64 value);
f32 square(f32 value);
f64 square(f64 value);
f32 naturalLog(f32 value);
f64 naturalLog(f64 value);
f32 logarithm10(f32 value);
f64 logarithm10(f64 value);
f32 exponential(f32 value);
f64 exponential(f64 value);
i32 absolute(i32 value);
u32 absolute(u32 value);

template <typename Value>
typename EnableWhen<!AllFitInInt32<Value>::value, i64>::type
absolute(Value value) {
	return absoluteInteger64((i64)value);
}

f32 absoluteFloat(f32 value);
f64 absoluteFloat(f64 value);
i32 minimum(i32 left, i32 right);
u32 minimum(u32 left, u32 right);

template <typename Left, typename Right>
typename EnableWhen<!AllFitInInt32<Left, Right>::value, i64>::type
minimum(Left left, Right right) {
	return minimumInteger64((i64)left, (i64)right);
}

f32 minimumFloat(f32 left, f32 right);
f64 minimumFloat(f64 left, f64 right);
i32 maximum(i32 left, i32 right);
u32 maximum(u32 left, u32 right);

template <typename Left, typename Right>
typename EnableWhen<!AllFitInInt32<Left, Right>::value, i64>::type
maximum(Left left, Right right) {
	return maximumInteger64((i64)left, (i64)right);
}

f32 maximumFloat(f32 left, f32 right);
f64 maximumFloat(f64 left, f64 right);

f32 roundDown(f32 value);
f64 roundDown(f64 value);
f32 roundUp(f32 value);
f64 roundUp(f64 value);
f32 roundNearest(f32 value);
f64 roundNearest(f64 value);
f32 remainderFloat(f32 value, f32 divisor);
f64 remainderFloat(f64 value, f64 divisor);
f32 truncate(f32 value);
f64 truncate(f64 value);

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
f64 sine(f64 radians);
f32 cosine(f32 radians);
f64 cosine(f64 radians);
f32 tangent(f32 radians);
f64 tangent(f64 radians);
f32 arcSine(f32 value);
f64 arcSine(f64 value);
f32 arcCosine(f32 value);
f64 arcCosine(f64 value);
f32 arcTangent(f32 value);
f64 arcTangent(f64 value);
f32 arcTangent2(f32 y, f32 x);
f64 arcTangent2(f64 y, f64 x);
f32 toRadians(f32 degrees);
f64 toRadians(f64 degrees);
f32 toDegrees(f32 radians);
f64 toDegrees(f64 radians);
