# Control flow

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

A callback parameter is declared with a **function type**. It lowers to a C
function pointer:

```e95
const run = (callback: () => void) => {
    callback()
}
```

The type lists the parameters and the return type, so callbacks that carry
values declare them explicitly:

```e95
const each = (callback: (value: i16) => void) => {
    callback(1)
}

const compute = (callback: () => i16): i16 => {
    return callback()
}
```

Pass a named function or a captureless inline arrow. Its parameter and return
types must match the declared function type exactly: `() => i16` is not
assignable to `() => void`, just like a C function pointer. A callback that
references local state would need a closure and is rejected.

This is what `attachPinInterrupt` (`handler: () => void`),
`HardwareTimer.initialize` (`(periodMicros: u32, callback: () => void)`) and the
I2C slave handlers (`onReceive`/`onRequest` with `handler: () => void`) accept.

Function types also type object members. Each slot can be a named function or a
captureless inline arrow:

```e95
type Handler = {
    onEvent: (value: i16) => void
}

const handler: Handler = { onEvent: printValue }
handler.onEvent = (value: i16) => { serial.sendLine(value) }
```
