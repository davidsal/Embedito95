# Math

Numeric helpers for ranges, rounding, trigonometry, random values and bits.

```e95
import { clamp, squareRoot, sine } from '@embedito95/math'
```

## Numeric width

Every function that takes a floating-point value is declared once per width. The
range/clamp/absolute/minimum/maximum family is declared once per integer width
(`i32`, `i64`, `u32`). The library source writes these width families once (for
example `(value: f32 | f64): f32 | f64` or `(value: i32 | i64 | u32): i32 | i64 |
u32`) and the compiler expands them to the concrete overloads before type
checking, so the overload set is exactly the same as spelling each width out.
The overload is chosen from the argument types, and the result keeps the width
it selected:

- **`f32` is the default and the cheap path.** A literal with at most seven
  significant digits is `f32`, so `squareRoot(16.0)` calls the `f32` overload and
  nothing is computed in double precision. On AVR this is the same code and cost
  it always had.
- **`f64` is opt-in.** A wider literal (for example `3.14159265358979`) or a
  variable declared `f64` selects the `f64` overload, and the result is `f64`
  end to end. `const squared = square(value)` infers the type from the selected
  overload, so `f64` in gives `f64` out without an explicit annotation.
- **Integers pick the float width from the range of their type.** An integer
  argument uses `f32` when the whole range of its type is exactly representable
  (`i8`/`i16`/`u8`/`u16`) and `f64` otherwise (`i32`/`i64`/`u32`/`u64`), so
  `square(count * factor)` with a `u32 * i16` product resolves to `f64`.
  Literals do not pay for this: the checker gives them the minimum type that
  holds the value (`5` → `i8`, `65535` → `u16`, `65536` → `i32`), so
  `clampFloat(5, 0.0, 1.0)` stays `f32` while `clampFloat(65536, 0.0, 1.0)`
  resolves to `f64`.
- **The float family never narrows to win a call.** Float overloads are also
  selected by width, not by summing per-argument conversion costs: the selected
  overload is the narrowest uniform width that accepts every argument without
  losing range. One `f64` argument is enough to select the `f64` overload, no
  matter how many `f32` arguments accompany it; every `f32` argument (variable
  or literal typed `f32`) is widened with an explicit `(f64)` cast, because a
  bare C++ argument would make the call ambiguous between the `f32` and `f64`
  overloads. This is why `interpolateRangeFloat(value64, 0.0, 1.0, 0.0, 100.0)`
  resolves to `f64` instead of narrowing `value64` to `f32` because the literals
  were cheaper. A call stays `f32` when every argument is `f32` or an integer
  whose whole type range is exact in `f32` (`u16`/`i16` or narrower).
  Narrowing is only explicit user intent: declaring the destination `f32`
  (`const result: f32 = interpolateRangeFloat(value64, …)`) still casts the
  `f64` result and emits a non-blocking warning.
- **Integer arguments follow the binary-operator promotion.** The integer family
  uses the same width the compiler already gives to `a + b`: signed and unsigned
  operands are promoted pairwise to a common width, then widened to the target
  word size. The overload whose width equals that promoted width is selected:
  - all-unsigned arguments keep their width: `clamp(u32, u32, u32)` resolves to
    the `u32` overload when the promoted width is 32 bits, so an all-unsigned
    call stays cheap. Integer literals are signed (`i32`), so `clamp(u8, 0, 10)`
    still promotes to `i32`;
  - a signed argument next to an unsigned one widens to signed: `u8` + signed
    promotes to `i16`, `u16` + signed to `i32`, `u32` + signed to `i64`. The
    selected overload is the declared width that holds that promotion, so a
    promoted `i16` selects the `i32` overload (there is no `i16` signature);
  - the word minimum applies once, after the fold and per target, so on AVR
    (16-bit `int`) a small signed call can select `i32` when the promotion needs
    it, and the result never depends on argument order.
  The canonical case is `clamp(u32, i32, i32)` → `i64`: the unsigned value and
  its signed bounds promote to 64 bits and nothing wraps negative. `clamp(5, 0,
  10)` still emits `int32_t`.
- **Narrowing is explicit and visible.** Passing an `f64` value where an `f32`
  parameter is selected, or a `u64` where any integer parameter is selected,
  emits a cast in the generated C++ and a non-blocking warning; it never becomes
  a build error.
- **`u64` is not overloaded.** No integer width holds a full `u64`, so it always
  falls back to `i64`, with an explicit cast and a non-blocking warning instead
  of silently losing range. The bit helpers (`u32`/`u8`/`boolean`) and
  `randomInteger`/`seedRandom` (`i32`/`u32`) keep their single fixed signature.

| Argument types | Promoted width | Selected overload | Cost |
| --- | --- | --- | --- |
| all-unsigned typed arguments (`u8`, `u16`, `u32`) | widest unsigned argument, at least the target word (`u32` on 16/32-bit, `i64` on 64-bit) | `u32` on 16/32-bit, `i64` on 64-bit | Word-sized for unsigned values; no 64-bit arithmetic on AVR. |
| `i8`, `i16`, `u8`, `u16`, `i32`, in-range integer literal | `i32` on 16/32-bit, `i64` on 64-bit | `i32` on 16/32-bit, `i64` on 64-bit | Word-sized; no `i64` arithmetic. |
| `u8` + signed | `i16` on 16-bit, `i32` on 32-bit, `i64` on 64-bit | `i32` on 16/32-bit, `i64` on 64-bit (there is no `i16` signature) | Word-sized until the promoted width needs 64 bits. |
| `u16` + signed | `i32` on 16/32-bit, `i64` on 64-bit | `i32` on 16/32-bit, `i64` on 64-bit | Word-sized until the promoted width needs 64 bits. |
| `u32` + signed, or any integer whose full range exceeds `i32` | `i64` | `i64` | 64-bit arithmetic; software on AVR, accepted for correctness. |
| `f32` literal with at most 7 significant digits (`0.0`, `3.5`) | `f32` | `f32` | Single precision. |
| `f64` literal with more than 7 significant digits (`3.14159265358979`) | `f64` | `f64` | Double precision (software binary64 on AVR). |
| integer literal whose minimum type is `u8`/`i8`/`u16`/`i16` (`5`, `65535`) | `f32` | `f32` | Single precision; the literal's type range is exact in `f32`. |
| integer literal whose minimum type is `i32` (`65536`, `100000`) | `f64` | `f64` | Double precision; the literal's type range already exceeds the exact integers of `f32`. |
| `f32` + `f64` (any argument is `f64`) | `f64` | `f64` | One `f64` wins the whole call; every `f32` value argument is cast to `(f64)`. |
| integer by type range: `i8`/`i16`/`u8`/`u16` next to a float | the float width of the other arguments, at least `f32` | `f32` unless an `f64` argument is present | The integer type range is exact in `f32`, so it does not force `f64`. |
| integer by type range: `i32`/`i64`/`u32`/`u64` next to a float | `f64` | `f64` | The integer type range exceeds the exact integers of `f32`; it widens with a cast. |
| `u64` | `i64` | `i64` | Explicit cast plus a non-blocking narrowing warning. |

Warnings never block the build. A `u64` into `i64`, a `u32` into `i32`, and an
`f64` into `f32` all warn and cast; none of them is an error.

Integer arguments decide by the range of their declared type, not by their
run-time value: `const count: i32 = 5; clampFloat(count, 0.0, 1.0)` selects the
`f64` overload (emitted as `double` on native targets), because the `i32` type
can hold values past the exact integers of `f32`. A bare literal keeps the
minimum type the checker assigns it, so `clampFloat(5, 0.0, 1.0)` selects the
`f32` overload (emitted as `float` on native targets).

On targets where `f64` is the portable software binary64 (AVR), the algebraic
and rounding forms keep full double precision, but the transcendentals (`power`,
the logarithms, `exponential`, the trigonometry and its inverses) delegate to
their `f32` implementation and widen the result. On those targets an `f64`
transcendental result therefore carries `f32` precision. Targets with a native
`double` compute them in double precision.

## Ranges and clamping

| API | Description |
| --- | --- |
| `interpolateRange(value: i32, sourceMinimum: i32, sourceMaximum: i32, targetMinimum: i32, targetMaximum: i32): i32` | Maps an integer from one range to another. |
| `interpolateRange(value: u32, sourceMinimum: u32, sourceMaximum: u32, targetMinimum: u32, targetMaximum: u32): u32` | Maps an unsigned integer from one range to another in 64-bit arithmetic. |
| `interpolateRange(value: i64, sourceMinimum: i64, sourceMaximum: i64, targetMinimum: i64, targetMaximum: i64): i64` | Maps a wide integer from one range to another in 64-bit arithmetic. |
| `interpolateRangeFloat(value: f32, sourceMinimum: f32, sourceMaximum: f32, targetMinimum: f32, targetMaximum: f32): f32` | Maps an `f32` value from one range to another. |
| `interpolateRangeFloat(value: f64, sourceMinimum: f64, sourceMaximum: f64, targetMinimum: f64, targetMaximum: f64): f64` | Maps an `f64` value from one range to another in double precision. |
| `clamp(value: i32, minimum: i32, maximum: i32): i32` | Limits an integer to a range. |
| `clamp(value: u32, minimum: u32, maximum: u32): u32` | Limits an unsigned integer to a range. |
| `clamp(value: i64, minimum: i64, maximum: i64): i64` | Limits a wide integer to a range without wrapping it negative. |
| `clampFloat(value: f32, minimum: f32, maximum: f32): f32` | Limits an `f32` value to a range. |
| `clampFloat(value: f64, minimum: f64, maximum: f64): f64` | Limits an `f64` value to a range. |

## Numeric helpers

| API | Description |
| --- | --- |
| `power(base: f32, exponent: f32): f32` | Raises an `f32` value to a power. |
| `power(base: f64, exponent: f64): f64` | Raises an `f64` value to a power. |
| `squareRoot(value: f32): f32` | Square root of an `f32` value. |
| `squareRoot(value: f64): f64` | Square root of an `f64` value. |
| `square(value: f32): f32` | Multiplies an `f32` value by itself. |
| `square(value: f64): f64` | Multiplies an `f64` value by itself. |
| `naturalLog(value: f32): f32` | Natural logarithm of an `f32` value. |
| `naturalLog(value: f64): f64` | Natural logarithm of an `f64` value. |
| `logarithm10(value: f32): f32` | Base-10 logarithm of an `f32` value. |
| `logarithm10(value: f64): f64` | Base-10 logarithm of an `f64` value. |
| `exponential(value: f32): f32` | `e` raised to an `f32` value. |
| `exponential(value: f64): f64` | `e` raised to an `f64` value. |
| `absolute(value: i32): i32` | Absolute value of an integer. |
| `absolute(value: u32): u32` | Absolute value of an unsigned integer (itself). |
| `absolute(value: i64): i64` | Absolute value of a wide integer; the most negative `i64` returns itself. |
| `absoluteFloat(value: f32): f32` | Absolute value of an `f32` value. |
| `absoluteFloat(value: f64): f64` | Absolute value of an `f64` value. |
| `minimum(left: i32, right: i32): i32` | Smaller of two integers. |
| `minimum(left: u32, right: u32): u32` | Smaller of two unsigned integers. |
| `minimum(left: i64, right: i64): i64` | Smaller of two wide integers. |
| `minimumFloat(left: f32, right: f32): f32` | Smaller of two `f32` values. |
| `minimumFloat(left: f64, right: f64): f64` | Smaller of two `f64` values. |
| `maximum(left: i32, right: i32): i32` | Larger of two integers. |
| `maximum(left: u32, right: u32): u32` | Larger of two unsigned integers. |
| `maximum(left: i64, right: i64): i64` | Larger of two wide integers. |
| `maximumFloat(left: f32, right: f32): f32` | Larger of two `f32` values. |
| `maximumFloat(left: f64, right: f64): f64` | Larger of two `f64` values. |
| `roundDown(value: f32): f32` | Rounds an `f32` value down. |
| `roundDown(value: f64): f64` | Rounds an `f64` value down. |
| `roundUp(value: f32): f32` | Rounds an `f32` value up. |
| `roundUp(value: f64): f64` | Rounds an `f64` value up. |
| `roundNearest(value: f32): f32` | Rounds an `f32` value to the nearest integer. |
| `roundNearest(value: f64): f64` | Rounds an `f64` value to the nearest integer. |
| `remainderFloat(value: f32, divisor: f32): f32` | Remainder with the sign of the value. |
| `remainderFloat(value: f64, divisor: f64): f64` | Remainder with the sign of the value, in double precision. |
| `truncate(value: f32): f32` | Drops the fractional part of an `f32` value. |
| `truncate(value: f64): f64` | Drops the fractional part of an `f64` value. |

## Random and bits

| API | Description |
| --- | --- |
| `randomInteger(minimum: i32, maximum: i32): i32` | Random integer in the range. |
| `seedRandom(seed: u32): void` | Seeds the random generator. |
| `readBitValue(value: u32, bitIndex: u8): boolean` | Reads one bit. |
| `writeBitValue(value: u32, bitIndex: u8, bitValue: boolean): u32` | Writes one bit and returns the result. |
| `setBitValue(value: u32, bitIndex: u8): u32` | Sets one bit and returns the result. |
| `clearBitValue(value: u32, bitIndex: u8): u32` | Clears one bit and returns the result. |
| `lowByteValue(value: u32): u8` | Low 8 bits. |
| `highByteValue(value: u32): u8` | Bits 8-15. |
| `bitMask(bitIndex: u8): u32` | Mask with a single bit set. |

## Trigonometry

| API | Description |
| --- | --- |
| `sine(radians: f32): f32` | Sine of an `f32` angle. |
| `sine(radians: f64): f64` | Sine of an `f64` angle. |
| `cosine(radians: f32): f32` | Cosine of an `f32` angle. |
| `cosine(radians: f64): f64` | Cosine of an `f64` angle. |
| `tangent(radians: f32): f32` | Tangent of an `f32` angle. |
| `tangent(radians: f64): f64` | Tangent of an `f64` angle. |
| `arcSine(value: f32): f32` | Arcsine of an `f32` value. |
| `arcSine(value: f64): f64` | Arcsine of an `f64` value. |
| `arcCosine(value: f32): f32` | Arccosine of an `f32` value. |
| `arcCosine(value: f64): f64` | Arccosine of an `f64` value. |
| `arcTangent(value: f32): f32` | Arctangent of an `f32` value. |
| `arcTangent(value: f64): f64` | Arctangent of an `f64` value. |
| `arcTangent2(y: f32, x: f32): f32` | Arctangent of `y / x` with quadrant. |
| `arcTangent2(y: f64, x: f64): f64` | Arctangent of `y / x` with quadrant, in double precision. |
| `toRadians(degrees: f32): f32` | Degrees to radians. |
| `toRadians(degrees: f64): f64` | Degrees to radians with the double-precision pi constant. |
| `toDegrees(radians: f32): f32` | Radians to degrees. |
| `toDegrees(radians: f64): f64` | Radians to degrees with the double-precision pi constant. |
