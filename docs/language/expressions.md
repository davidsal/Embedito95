# Expressions

| Category | Operators |
| --- | --- |
| Arithmetic | `+`, `-`, `*`, `/`, `%` |
| Comparison | `==`, `!=`, `<`, `<=`, `>`, `>=` |
| Logical | `&&`, `\|\|`, `!` |
| Nullish | `??` |
| Ternary | `condition ? whenTrue : whenFalse` |
| Assignment | `=`, `+=`, `-=`, `*=`, `/=`, `%=` |
| Unary | `-`, `!` |
| Cast | `value as T` |
| Access | `.member`, `[index]`, `(arguments)` |

- Precedence, from lowest to highest: assignment, ternary, `??`/`||`, `&&`,
  `==`/`!=`, relational, additive, multiplicative, unary, cast and access.
- `??` cannot be mixed with `&&` or `||` without parentheses.
- Arithmetic accepts numeric operands only, and `%` is integer-only.
- Comparisons always produce `boolean`; the promotion rules are in
  [Binary operations](#binary-operations).
- `++` and `--` are rejected: use `+= 1` or `-= 1`.
- There are no bitwise or shift operators (`&`, `|`, `^`, `<<`, `>>`), no `===`,
  no optional chaining (`?.`) and no spread.

A cast converts between numeric types or removes `null` from a value. Narrowing
a value is always allowed: `value as u8` documents the intent, while
`setAnalog(pin, value)` also compiles and performs the same automatic cast.
Numeric conversions are implicit in parameters and assignments: the value is
cast to the target type and the editor never underlines the expression. The
symbol hover explains it when the stored value may be truncated, lose precision
or lose range/sign. Literals and constants whose known value fits the
destination show no note at all.

## Binary operations

Every numeric operation gets a **common type at compile time**. Both operands
are cast to it first, so the result does not depend on C/C++ promotion rules.

- **At least one architecture word:** `i16`/`u16` on AVR, `i32`/`u32` on ARM.
  The signed word is preferred when the operand range fits.
- **Mixed signed/unsigned** widens to signed: `u16 + i16` becomes `i32` on AVR.
- **Subtraction** always allows a negative result: `u8 - u8` becomes a signed
  word (`i16` on AVR), so `0 - 1` is `-1`, not `255`.
- **Folded literals widen** when needed: `1000 * 1000` becomes `i32` on AVR
  instead of overflowing a 16-bit `int`.
- **Comparisons** always produce `boolean`. They promote both operands the same
  way, but mixing an integer with a float is a compile error instead of an
  implicit conversion.

Common C/C++ problems it avoids:

| Case | C/C++ | Embedito95 |
| --- | --- | --- |
| `1000 * 1000` on AVR | overflows 16-bit `int` | computed as `i32` |
| `-1 < 1u` | usually false (unsigned conversion) | true (signed comparison) |
| `0u - 1u` | large unsigned value | `-1` in a signed type |
| wider result into `u8` | silent truncation | auto cast with truncation, hover-only note |
| signed overflow | undefined behavior | wraps with `-fwrapv` |

`-fwrapv` is passed on AVR and STM32, so signed overflow is deterministic. There
is no runtime trap: values that exceed the result type still wrap, so use a
wider type or an explicit check when the range is uncertain.

`-fwrapv` also protects 16-bit counters on AVR. There `int` is 16 bits, so an
`i16` (`int16_t`) is promoted to a 16-bit `int`, and `32767 + 1` overflows a
signed `int`. Without the flag that is undefined behavior: the compiler may
assume it never happens, delete the loop exit and let
`for (let i: i16 = 0; i >= 0; i += 1)` run forever. With `-fwrapv` the
increment wraps to `-32768` and the loop ends. On ARM `int` is 32 bits, so the
intermediate does not overflow and the same loop ends even without the flag.

The full result type for every arithmetic pair on each word size, and the
promotion used by each comparison, are listed in
[Binary operator result types](binary-operators.md). That page is generated from
the same checker functions that the `binary-operations.txt` and
`binary-comparisons.txt` regression fixtures use. Both live in the project test
suite, under `packages/test/src/language/snapshots/`.
