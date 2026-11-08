# Math

Numeric helpers for ranges, rounding, trigonometry, random values and bits.

```e95
import { clamp, squareRoot, sine } from '@embedito95/math'
```

## Ranges and clamping

| API | Description |
| --- | --- |
| `interpolateRange(value: i32, sourceMinimum: i32, sourceMaximum: i32, targetMinimum: i32, targetMaximum: i32): i32` | Maps an integer from one range to another. |
| `interpolateRangeFloat(value: f32, sourceMinimum: f32, sourceMaximum: f32, targetMinimum: f32, targetMaximum: f32): f32` | Maps a float from one range to another. |
| `clamp(value: i32, minimum: i32, maximum: i32): i32` | Limits an integer to a range. |
| `clampFloat(value: f32, minimum: f32, maximum: f32): f32` | Limits a float to a range. |

## Numeric helpers

| API | Description |
| --- | --- |
| `power(base: f32, exponent: f32): f32` | Raises a value to a power. |
| `squareRoot(value: f32): f32` | Square root. |
| `square(value: f32): f32` | Multiplies a value by itself. |
| `naturalLog(value: f32): f32` | Natural logarithm. |
| `logarithm10(value: f32): f32` | Base-10 logarithm. |
| `exponential(value: f32): f32` | `e` raised to a value. |
| `absolute(value: i32): i32` | Absolute value of an integer. |
| `absoluteFloat(value: f32): f32` | Absolute value of a float. |
| `minimum(left: i32, right: i32): i32` | Smaller of two integers. |
| `minimumFloat(left: f32, right: f32): f32` | Smaller of two floats. |
| `maximum(left: i32, right: i32): i32` | Larger of two integers. |
| `maximumFloat(left: f32, right: f32): f32` | Larger of two floats. |
| `roundDown(value: f32): f32` | Rounds down. |
| `roundUp(value: f32): f32` | Rounds up. |
| `roundNearest(value: f32): f32` | Rounds to the nearest integer. |
| `remainderFloat(value: f32, divisor: f32): f32` | Remainder with the sign of the value. |
| `truncate(value: f32): f32` | Drops the fractional part. |

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
| `sine(radians: f32): f32` | Sine. |
| `cosine(radians: f32): f32` | Cosine. |
| `tangent(radians: f32): f32` | Tangent. |
| `arcSine(value: f32): f32` | Arcsine. |
| `arcCosine(value: f32): f32` | Arccosine. |
| `arcTangent(value: f32): f32` | Arctangent. |
| `arcTangent2(y: f32, x: f32): f32` | Arctangent of `y / x` with quadrant. |
| `toRadians(degrees: f32): f32` | Degrees to radians. |
| `toDegrees(radians: f32): f32` | Radians to degrees. |
