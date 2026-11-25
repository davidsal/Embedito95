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
  matter how many `f32` arguments accompany it; every `f32` variable and every
  integer argument is widened with an explicit `(f64)` cast, because a bare C++
  argument would make the call ambiguous between the `f32` and `f64` overloads.
  Float literals need no cast: they are emitted already in the parameter
  context, so a `0.0` argument becomes a plain numeric literal (`0`) on native
  targets and a `f64::fromBits(…)` construction on AVR. This is why
  `interpolateRangeFloat(value64, 0.0, 1.0, 0.0, 100.0)`
  resolves to `f64` instead of narrowing `value64` to `f32` because the literals
  were cheaper. A call stays `f32` when every argument is `f32` or an integer
  whose whole type range is exact in `f32` (`u16`/`i16` or narrower).
  Narrowing is only explicit user intent: declaring the destination `f32`
  (`const result: f32 = interpolateRangeFloat(value64, …)`) still casts the
  `f64` result, and the symbol hover notes the possible precision loss.
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
  emits a cast in the generated C++. The editor does not underline the call; the
  argument hover explains the possible precision, range or sign loss, and it
  never becomes a build error.
- **`u64` is not overloaded.** No integer width holds a full `u64`, so it always
  falls back to `i64`, with an explicit cast; the argument hover explains the
  possible range loss instead of losing it silently. The bit helpers
  (`u32`/`u8`/`boolean`) and
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
| `u64` | `i64` | `i64` | Explicit cast; the hover notes the possible narrowing. |

These conversions never block the build and are never underlined. A `u64` into
`i64`, a `u32` into `i32`, and an `f64` into `f32` all cast automatically and
only the hover notes the possible loss; none of them is an error.

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

## API reference

Every exported function, its declaration with the width family, and the
concrete overloads the compiler type-checks are listed in the generated
[Math API reference](math-api.md). That page is built from the library source,
so it cannot drift from the declarations; read it for exact signatures.

Promotion rules and width-selection details stay in the sections above and are
not repeated there. To rewrite the reference after changing the library,
regenerate it with `pnpm run test:snapshot` from the repository root.
