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

See [Engine](../engine.md) for scheduling and task storage.
