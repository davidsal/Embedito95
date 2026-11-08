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
