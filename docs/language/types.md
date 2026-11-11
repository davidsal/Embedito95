# Types

| Type | Storage | Notes |
| --- | --- | --- |
| `i8`–`i128`, `u8`–`u128` | value | fixed-width signed/unsigned; 128-bit is software |
| `f32` | value | single precision |
| `f64` | value | double precision; native on STM32, portable software on AVR |
| `boolean` | value | `true` or `false` |
| `char` | value | one byte, single quotes (`'a'`) |
| `string` | heap handle | dynamic text, double quotes (`"hi"`), copy-on-write |
| `T[]` | heap handle | dynamic array; `[1, 2, 3]` is an array literal |
| `T[N]` | heap handle | capacity annotation; `N` is not reserved yet |
| object (`type`) | heap handle | fields stored inline in one block |
| `AsyncTask<T>` | heap handle | the only parameterized type; `await` yields `T` and `value` holds `T` |
| `T \| null` | same as `T` | the only union |
| `void` | — | no return value |

- `f64` is native on 32-bit targets such as the STM32 Blue Pill. On AVR it uses
  a portable IEEE-754 software implementation: same operations and precision,
  more flash usage and slower math. `f32` remains the recommended default there.
- `i128` and `u128` use a portable software implementation, since the MCUs do
  not have native 128-bit registers.
- `T[]` grows dynamically. `T[N]` parses, but `N` does not reserve storage yet;
  see [Engine](../engine.md#2-heap-fragmentation).
- `enum` values are integer-backed.
- `AsyncTask<T>` is the only parameterized type the language understands, and it
  is not a user-defined generic: an `async` function produces it, `await` yields
  its `T` payload, and the `value` field is typed `T`. A task without a payload
  is written as plain `AsyncTask`.
- Template literals with interpolation are also supported: `` `value: ${x}` ``.

## Function types

A function type declares the parameters and return type of a value:

```e95
const run = (callback: () => void) => {
    callback()
}

const each = (callback: (value: i16) => void) => {
    callback(1)
}

const compute = (getValue: () => i16): i16 => {
    return getValue()
}
```

Function types lower to C function pointers, so assignability is **exact**:
parameter count, parameter types and return type must match. In particular,
`() => i16` is not assignable to `() => void`, even though the result would be
discarded; the emitted C would not compile. There are no implicit parameter or
return conversions.

## Null and nullable

`null` is the absent value. The only union the language supports is `T | null`:

```e95
let reading: f32 | null = null
const name: string | null = null
```

- A union never combines different value types: `u8 | string` is invalid.
  `T | null` only adds the possibility of `null` to one type.
- A nullable value must be checked before arithmetic or member access. Using it
  directly reports `nullableOperation`.
- `!= null` and `== null` narrow the type inside `&&` and `||`, and
  `if (value)` treats `null` as false.
- `??` supplies a default, and `as T` asserts a non-null value.
- Assigning a nullable value to a non-nullable target is an error; assigning a
  plain `T` or `null` to `T | null` is allowed.

## Floating point

- A float is used as the result only when it is requested: with a float literal
  (`1.5`), a float operand or an explicit `f32`/`f64` target.
- Number literals accept an exponent: `1e3`, `2E6`, `1.5e-3` and `-4e2` are
  valid. The sign belongs to the exponent, and an exponent without digits is a
  syntax error.
- Pure integer arithmetic stays integer, including division: `5 / 2` is `2`.
- Storing an integer result in a float variable converts it with a warning, not
  an error.
- `%` is only defined for integers.

## Value behavior

| Type | `a = b` | `func(a)` | Caller sees writes via parameter? | `return a` | TS-like |
| --- | --- | --- | --- | --- | --- |
| `i8`–`i128`, `u8`–`u128` | independent copy | independent copy | no, the parameter is a copy | independent copy | yes |
| `f32`, `f64` | independent copy | independent copy | no, the parameter is a copy | independent copy | yes |
| `string` | shares text (CoW) | shares text (CoW) | no, the first write detaches | shares text (CoW) | yes |
| `T[]` | shares storage | shares storage | **yes, same storage** | shares storage | yes |

- **Copy:** independent values; changing one never changes the other.
- **Shares text (CoW):** same block until the first write. That write detaches a
  private block, so the other handle keeps the old text.
- **Shares storage:** same array storage. `push`, `pop` and element writes are
  visible through every handle.

Reassigning a parameter (`a = other`) is always local. Returning a local handle
transfers it; returning a shared one aliases it. Objects and `T[N]` arrays
follow the `T[]` rules.

In short: integers, floats and strings behave as values; arrays and objects
behave as references.
