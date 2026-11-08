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
a value is allowed and reported as a warning, so `value as u8` documents the
intent while `setAnalog(pin, value)` still compiles with the same warning.

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
| wider result into `u8` | silent truncation | warning on assignment |
| signed overflow | undefined behavior | wraps with `-fwrapv` |

`-fwrapv` is passed on AVR and STM32, so signed overflow is deterministic. There
is no runtime trap: values that exceed the result type still wrap, so use a
wider type or an explicit check when the range is uncertain.

The full result type for every arithmetic pair is listed in the
`binary-operations.txt` snapshot, and the promotion used by each comparison in
`binary-comparisons.txt`. Both live in the project test suite, under
`packages/test/src/language/snapshots/`.
