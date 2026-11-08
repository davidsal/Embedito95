# Declarations

## `const` and `let`

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
- A variable takes the architecture word when inferred: `i16` on AVR and
  `i32` on ARM.
- An annotation narrows or widens the value; the language server warns on
  narrowing but does not reject it.

## Functions

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

## Objects

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

## Enums

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

## Closures

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
  must be top-level functions. See [Callbacks](control-flow.md#callbacks).
