# e95

The Embedito95 language is **e95**. It is TypeScript-like, compiles to C++ and
keeps a small syntax and type system on purpose. Source files use the `.e95`
extension, and every project starts at `main.e95`, which declares and calls
`main`. Libraries are also written in e95 and export the values and functions
that other modules import.

## Design

- **No classes or interfaces.** `type` declarations and closures build objects.
- **Only `T | null` unions, no `===`.** Only `==` and `!=`; mixing a float with
  an integer is an error.
- **Inference instead of annotations.** Variables infer their type, constants
  take the smallest fitting type and the language server shows both on hover;
  only parameters need explicit types.
- **Safe arithmetic.** Operands are promoted to at least the architecture word,
  mixed signs widen to signed, and `-fwrapv` keeps overflow defined, catching the
  classic Arduino overflow bugs.
- **`async` / `await` protothreads.** `sleep(ms)` yields the CPU for that time;
  `sleep()` yields one event-loop pass.
- **Memory tuned for small devices.** Arrays, strings and objects are
  heap-backed, reference-counted handles, including fixed-size `T[N]` arrays.
  See [Engine](engine.md) for the runtime details.
- **Reference counting.** A direct self-reference is rejected at compile time;
  longer cycles are not detected and leak.
- **Portable by design.** Libraries are written in e95 and compiled per platform,
  so the same code can target different boards.

## Imports

Imports are named and always come from a package or a relative module:

```e95
import { Pin, setDigital, HIGH } from '@embedito95/gpio'
import { delay as delayMillis, getMillis as millis } from '@embedito95/time'
```

- Only named imports (`{ ... }`); there are no default or namespace imports.
- `as` renames a binding for the current file.
- A module declares its public API with `export`.

## Declarations

### `const` and `let`

`const` is immutable and `let` is mutable. Both infer their type or accept an
explicit annotation:

```e95
const INTERVAL = 1000        // smallest fitting type: i16
const TIMEOUT: u32 = 2000    // explicit type
let counter = 0              // word type: i16 on AVR, i32 on ARM
let temperature: f32 = 0.0   // explicit type
```

- A constant takes the smallest integer type that fits, preferring signed:
  `100` is `i8` and `200` is `u8`.
- A variable takes the architecture word when inferred: `i16` on AVR and `i32`
  on ARM.
- An annotation narrows or widens the value; the language server warns on
  narrowing but does not reject it.

### Functions

Functions are arrow functions assigned to `const`. Parameters need an explicit
type; the return type is inferred from the returns or declared after the
parameters:

```e95
const add = (a: i16, b: i16): i16 => {
    return a + b
}

const blink = () => {
    setDigital(LED_BUILTIN, HIGH)
}
```

Arrow functions can capture local state where the runtime supports a closure; see
[Closures](#closures).

### Objects

`type` declares the shape of an object. Object literals are written with `{}`.
Optional fields use `?`:

```e95
type Point = {
    x: i16
    y: i16
}

type SensorConfig = {
    pin: i16
    label: string
    isValid?: boolean
}

const origin: Point = { x: 0, y: 0 }
const config: SensorConfig = { pin: 3, label: "dht22" }
```

- Missing required fields are an error; optional fields may be omitted.
- Objects are heap-backed handles that share storage when copied.
- A method is a function-typed member of the `type`; inside it, `this` refers to
  the object:

```e95
type Counter = {
    value: i16
    increment: () => void
}

const counter: Counter = {
    value: 0,
    increment: () => {
        this.value = this.value + 1
    }
}
```

### Enums

`enum` declares integer-backed members. Members take consecutive values from `0`
unless an explicit value is given:

```e95
enum Mode {
    OFF,
    ON
}

enum Level {
    LOW = 1,
    HIGH = 10
}
```

- `Mode.OFF` is `0` and `Mode.ON` is `1`.
- A `switch` over an enum must cover every member unless it has a `default`.
- Both `type` and `enum` can be exported.

### Closures

A closure is created by a factory that returns an object literal whose methods
capture the factory's locals:

```e95
type Counter = {
    increment: () => void
    getValue: () => i16
}

const makeCounter = (): Counter => {
    let count: i16 = 0

    return {
        increment: () => {
            count = count + 1
        },
        getValue: () => {
            return count
        }
    }
}
```

- Captured locals become fields of the returned object, so each call to
  `makeCounter` gets independent state.
- A local closure can also be returned by reference as a property:
  `return { paint: paint }`.
- Closure forms are restricted: a local closure outside a factory or a nested
  closure property is rejected with a diagnostic.
- Callbacks handed to interrupt, timer and I2C APIs cannot capture state; those
  must be top-level functions. See [Callbacks](#callbacks).

## Types

| Type | Storage | Notes |
| --- | --- | --- |
| `i8`–`i128`, `u8`–`u128` | value | fixed-width signed/unsigned; 128-bit is software |
| `f32` | value | single precision |
| `f64` | value | double precision; STM32 only, not AVR |
| `boolean` | value | `true` or `false` |
| `char` | value | one byte, single quotes (`'a'`) |
| `string` | heap handle | dynamic text, double quotes (`"hi"`), copy-on-write |
| `T[]` | heap handle | dynamic array; `[1, 2, 3]` is an array literal |
| `T[N]` | heap handle | capacity annotation; `N` is not reserved yet |
| object (`type`) | heap handle | fields stored inline in one block |
| `T \| null` | same as `T` | the only union |
| `void` | — | no return value |

- `f64` is only available on 32-bit targets such as the STM32 Blue Pill.
- `i128` and `u128` use a portable software implementation, since the MCUs do
  not have native 128-bit registers.
- `T[]` grows dynamically. `T[N]` parses, but `N` does not reserve storage yet;
  see [Engine](engine.md#2-heap-fragmentation).
- `enum` values are integer-backed.
- Template literals with interpolation are also supported: `` `value: ${x}` ``.

### Null and nullable

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

### Floating point

- A float is used as the result only when it is requested: with a float literal
  (`1.5`), a float operand or an explicit `f32`/`f64` target.
- Pure integer arithmetic stays integer, including division: `5 / 2` is `2`.
- Storing an integer result in a float variable converts it with a warning, not
  an error.
- `%` is only defined for integers.

## Expressions

| Category | Operators |
| --- | --- |
| Arithmetic | `+`, `-`, `*`, `/`, `%` |
| Comparison | `==`, `!=`, `<`, `<=`, `>`, `>=` |
| Logical | `&&`, `||`, `!` |
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

## Control flow

```e95
if (a > b) {
    // ...
} else if (a == b) {
    // ...
} else {
    // ...
}

switch (mode) {
    case Mode.OFF: {
        break
    }
    case Mode.ON: {
        break
    }
    default: {
        break
    }
}

while (running) {
    // ...
}

for (let index = 0; index < 10; index += 1) {
    // ...
}

do {
    // ...
} while (running)
```

- `switch` compares against `case` values and uses `break` to leave a branch.
- A `switch` over an enum must cover every member unless it has a `default`.
- `for` is the classic three-part loop; there is no `for...of`.
- `break` works in loops and `switch`. There is no `continue`.

## Callbacks

A parameter without a type is a **callback slot** and lowers to a C function
pointer:

```e95
const run = (callback) => {
    callback()
}
```

The argument must be a top-level function reference with no parameters and no
captured state. This is what `attachPinInterrupt`, `HardwareTimer.initialize` and
the I2C slave handlers accept.

For callbacks that carry values, use a method-only `type`. Its value holds
function pointers, and each slot can be a named function or a stateless inline
arrow:

```e95
type Handler = {
    onEvent: (value: i16) => void
}

const handler: Handler = { onEvent: printValue }
handler.onEvent = (value: i16) => { serial.sendLine(value) }
```

## Async and await

An `async` arrow returns a task, and `await` suspends it until the awaited task
completes:

```e95
const blink = async () => {
    while (true) {
        setDigital(LED_BUILTIN, HIGH)
        await sleep(500)
        setDigital(LED_BUILTIN, LOW)
        await sleep(500)
    }
}
```

- Tasks are protothreads scheduled by the event loop; they are not threads.
- `await sleep(ms)` yields the CPU for that time and `await sleep()` yields one
  event-loop pass.
- `delay(ms)` blocks and does not yield; inside tasks, use `await sleep(ms)`.
- Several async tasks started from `main` run cooperatively.

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

The full result type for every arithmetic pair is listed in
[binary-operations.txt](../packages/test/src/language/snapshots/binary-operations.txt).
The promotion used by each comparison is listed in
[binary-comparisons.txt](../packages/test/src/language/snapshots/binary-comparisons.txt).

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
