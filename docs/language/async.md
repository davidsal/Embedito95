# Async and await

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
- On the `macos-arm64` host, the event loop returns when no task remains, so the
  program exits instead of looping forever.

## Wrappers around sleep

A wrapper whose whole body is a single `await sleep(parameter)` or
`await sleepMicros(parameter)` that forwards its only parameter is inlined at
the call site, so the caller waits inside its own task and no child task is
created for the wrapper:

```e95
const wait = async (milliseconds: u32) => {
    await sleep(milliseconds)
}

const blink = async () => {
    await wait(500) // waits in the blink task, no child task for wait
}
```

The call site's argument becomes the duration. Any other wrapper keeps the
regular behaviour of awaiting a child task: two or more statements in the body,
a transformed argument (`await sleep(milliseconds * 2)`), or a parameter with a
default value. A local `sleep` that is not the core timer is never treated as
one.

See [Engine](../engine.md) for scheduling and task storage.
