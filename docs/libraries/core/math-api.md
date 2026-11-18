# Math API reference

This page lists every function of the `math` core library. Each one is
declared once with a width family (`f32 | f64` or `i32 | i64 | u32`);
the compiler expands that family into one concrete signature per width
before type checking, and both forms are shown here together with the
first line of the function's doc comment.

The promotion rules and the width-selection table live in
[Math](math.md); this page does not repeat them. Do not edit it by hand:
regenerate it with the command in [Regeneration](#regeneration).

## Integer range, clamping and magnitude

### `interpolateRange`

Re-maps an integer from one range to another.

Declared once with its width family:

```e95
interpolateRange(value: i32 | i64 | u32, sourceMinimum: i32 | i64 | u32, sourceMaximum: i32 | i64 | u32, targetMinimum: i32 | i64 | u32, targetMaximum: i32 | i64 | u32): i32 | i64 | u32
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `i32` | `interpolateRange(value: i32, sourceMinimum: i32, sourceMaximum: i32, targetMinimum: i32, targetMaximum: i32): i32` |
| `i64` | `interpolateRange(value: i64, sourceMinimum: i64, sourceMaximum: i64, targetMinimum: i64, targetMaximum: i64): i64` |
| `u32` | `interpolateRange(value: u32, sourceMinimum: u32, sourceMaximum: u32, targetMinimum: u32, targetMaximum: u32): u32` |

### `clamp`

Limits an integer to the inclusive [minimum, maximum] range.

Declared once with its width family:

```e95
clamp(value: i32 | i64 | u32, minimum: i32 | i64 | u32, maximum: i32 | i64 | u32): i32 | i64 | u32
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `i32` | `clamp(value: i32, minimum: i32, maximum: i32): i32` |
| `i64` | `clamp(value: i64, minimum: i64, maximum: i64): i64` |
| `u32` | `clamp(value: u32, minimum: u32, maximum: u32): u32` |

### `absolute`

Returns the absolute value of an integer.

Declared once with its width family:

```e95
absolute(value: i32 | i64 | u32): i32 | i64 | u32
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `i32` | `absolute(value: i32): i32` |
| `i64` | `absolute(value: i64): i64` |
| `u32` | `absolute(value: u32): u32` |

### `minimum`

Returns the smaller of two integers.

Declared once with its width family:

```e95
minimum(left: i32 | i64 | u32, right: i32 | i64 | u32): i32 | i64 | u32
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `i32` | `minimum(left: i32, right: i32): i32` |
| `i64` | `minimum(left: i64, right: i64): i64` |
| `u32` | `minimum(left: u32, right: u32): u32` |

### `maximum`

Returns the larger of two integers.

Declared once with its width family:

```e95
maximum(left: i32 | i64 | u32, right: i32 | i64 | u32): i32 | i64 | u32
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `i32` | `maximum(left: i32, right: i32): i32` |
| `i64` | `maximum(left: i64, right: i64): i64` |
| `u32` | `maximum(left: u32, right: u32): u32` |

## Floating-point and trigonometry

### `interpolateRangeFloat`

Re-maps a floating-point value from one range to another.

Declared once with its width family:

```e95
interpolateRangeFloat(value: f32 | f64, sourceMinimum: f32 | f64, sourceMaximum: f32 | f64, targetMinimum: f32 | f64, targetMaximum: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `interpolateRangeFloat(value: f32, sourceMinimum: f32, sourceMaximum: f32, targetMinimum: f32, targetMaximum: f32): f32` |
| `f64` | `interpolateRangeFloat(value: f64, sourceMinimum: f64, sourceMaximum: f64, targetMinimum: f64, targetMaximum: f64): f64` |

### `clampFloat`

Limits a floating-point value to the inclusive [minimum, maximum] range.

Declared once with its width family:

```e95
clampFloat(value: f32 | f64, minimum: f32 | f64, maximum: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `clampFloat(value: f32, minimum: f32, maximum: f32): f32` |
| `f64` | `clampFloat(value: f64, minimum: f64, maximum: f64): f64` |

### `power`

Raises a base to the given exponent.

Declared once with its width family:

```e95
power(base: f32 | f64, exponent: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `power(base: f32, exponent: f32): f32` |
| `f64` | `power(base: f64, exponent: f64): f64` |

### `squareRoot`

Returns the square root of a value.

Declared once with its width family:

```e95
squareRoot(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `squareRoot(value: f32): f32` |
| `f64` | `squareRoot(value: f64): f64` |

### `square`

Returns a value multiplied by itself.

Declared once with its width family:

```e95
square(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `square(value: f32): f32` |
| `f64` | `square(value: f64): f64` |

### `naturalLog`

Returns the natural logarithm (base e) of a value.

Declared once with its width family:

```e95
naturalLog(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `naturalLog(value: f32): f32` |
| `f64` | `naturalLog(value: f64): f64` |

### `logarithm10`

Returns the base-10 logarithm of a value.

Declared once with its width family:

```e95
logarithm10(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `logarithm10(value: f32): f32` |
| `f64` | `logarithm10(value: f64): f64` |

### `exponential`

Returns e raised to a power.

Declared once with its width family:

```e95
exponential(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `exponential(value: f32): f32` |
| `f64` | `exponential(value: f64): f64` |

### `absoluteFloat`

Returns the absolute value of a floating-point value.

Declared once with its width family:

```e95
absoluteFloat(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `absoluteFloat(value: f32): f32` |
| `f64` | `absoluteFloat(value: f64): f64` |

### `minimumFloat`

Returns the smaller of two floating-point values.

Declared once with its width family:

```e95
minimumFloat(left: f32 | f64, right: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `minimumFloat(left: f32, right: f32): f32` |
| `f64` | `minimumFloat(left: f64, right: f64): f64` |

### `maximumFloat`

Returns the larger of two floating-point values.

Declared once with its width family:

```e95
maximumFloat(left: f32 | f64, right: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `maximumFloat(left: f32, right: f32): f32` |
| `f64` | `maximumFloat(left: f64, right: f64): f64` |

### `roundDown`

Rounds a value down to the nearest whole number.

Declared once with its width family:

```e95
roundDown(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `roundDown(value: f32): f32` |
| `f64` | `roundDown(value: f64): f64` |

### `roundUp`

Rounds a value up to the nearest whole number.

Declared once with its width family:

```e95
roundUp(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `roundUp(value: f32): f32` |
| `f64` | `roundUp(value: f64): f64` |

### `roundNearest`

Rounds a value to the nearest whole number, halfway away from zero.

Declared once with its width family:

```e95
roundNearest(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `roundNearest(value: f32): f32` |
| `f64` | `roundNearest(value: f64): f64` |

### `remainderFloat`

Returns the remainder of dividing a value by a divisor.

Declared once with its width family:

```e95
remainderFloat(value: f32 | f64, divisor: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `remainderFloat(value: f32, divisor: f32): f32` |
| `f64` | `remainderFloat(value: f64, divisor: f64): f64` |

### `truncate`

Discards the fractional part of a value, rounding toward zero.

Declared once with its width family:

```e95
truncate(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `truncate(value: f32): f32` |
| `f64` | `truncate(value: f64): f64` |

### `sine`

Returns the sine of an angle in radians.

Declared once with its width family:

```e95
sine(radians: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `sine(radians: f32): f32` |
| `f64` | `sine(radians: f64): f64` |

### `cosine`

Returns the cosine of an angle in radians.

Declared once with its width family:

```e95
cosine(radians: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `cosine(radians: f32): f32` |
| `f64` | `cosine(radians: f64): f64` |

### `tangent`

Returns the tangent of an angle in radians.

Declared once with its width family:

```e95
tangent(radians: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `tangent(radians: f32): f32` |
| `f64` | `tangent(radians: f64): f64` |

### `arcSine`

Returns the angle in radians whose sine is the given value.

Declared once with its width family:

```e95
arcSine(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `arcSine(value: f32): f32` |
| `f64` | `arcSine(value: f64): f64` |

### `arcCosine`

Returns the angle in radians whose cosine is the given value.

Declared once with its width family:

```e95
arcCosine(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `arcCosine(value: f32): f32` |
| `f64` | `arcCosine(value: f64): f64` |

### `arcTangent`

Returns the angle in radians whose tangent is the given value.

Declared once with its width family:

```e95
arcTangent(value: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `arcTangent(value: f32): f32` |
| `f64` | `arcTangent(value: f64): f64` |

### `arcTangent2`

Returns the angle in radians of the vector (x, y), keeping the quadrant.

Declared once with its width family:

```e95
arcTangent2(y: f32 | f64, x: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `arcTangent2(y: f32, x: f32): f32` |
| `f64` | `arcTangent2(y: f64, x: f64): f64` |

### `toRadians`

Converts an angle from degrees to radians.

Declared once with its width family:

```e95
toRadians(degrees: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `toRadians(degrees: f32): f32` |
| `f64` | `toRadians(degrees: f64): f64` |

### `toDegrees`

Converts an angle from radians to degrees.

Declared once with its width family:

```e95
toDegrees(radians: f32 | f64): f32 | f64
```

Expanded to the concrete overloads the compiler type-checks:

| Width | Signature |
| --- | --- |
| `f32` | `toDegrees(radians: f32): f32` |
| `f64` | `toDegrees(radians: f64): f64` |

## Bit and byte helpers

### `readBitValue`

Reads a single bit of an unsigned value.

Declared once with a fixed signature:

```e95
readBitValue(value: u32, bitIndex: u8): boolean
```

### `writeBitValue`

Writes a single bit of an unsigned value.

Declared once with a fixed signature:

```e95
writeBitValue(value: u32, bitIndex: u8, bitValue: boolean): u32
```

### `setBitValue`

Sets a single bit of an unsigned value.

Declared once with a fixed signature:

```e95
setBitValue(value: u32, bitIndex: u8): u32
```

### `clearBitValue`

Clears a single bit of an unsigned value.

Declared once with a fixed signature:

```e95
clearBitValue(value: u32, bitIndex: u8): u32
```

### `lowByteValue`

Returns the least significant byte of an unsigned value (bits 0-7).

Declared once with a fixed signature:

```e95
lowByteValue(value: u32): u8
```

### `highByteValue`

Returns the second byte of an unsigned value (bits 8-15).

Declared once with a fixed signature:

```e95
highByteValue(value: u32): u8
```

### `bitMask`

Returns an unsigned value with only the requested bit set.

Declared once with a fixed signature:

```e95
bitMask(bitIndex: u8): u32
```

## Pseudo-random numbers

### `randomInteger`

Returns a pseudo-random integer in the [minimum, maximum) interval.

Declared once with a fixed signature:

```e95
randomInteger(minimum: i32, maximum: i32): i32
```

### `seedRandom`

Seeds the pseudo-random number generator.

Declared once with a fixed signature:

```e95
seedRandom(seed: u32): void
```

## Regeneration

This page is written by
`packages/test/src/language/generate-math-api.mjs` from
`packages/registry/src/core/math/main.e95`. From the repository root:

```sh
pnpm run test:snapshot
```

`pnpm run test` compares the page with the generated content and fails
when the declaration and the page drift apart, so the page stays in sync
with the library source. The generator can also be invoked directly:

```sh
node packages/test/src/language/generate-math-api.mjs
```
