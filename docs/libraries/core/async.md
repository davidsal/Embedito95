# Async

Cooperative tasks and sleep helpers.

```e95
import { sleep } from '@embedito95/async'
```

| API | Description |
| --- | --- |
| `sleep(milliseconds: u32 = 0): AsyncTask` | Suspends the task for the given time; `0` yields one event-loop pass. |
| `sleepMicros(microseconds: u32 = 0): AsyncTask` | Same as `sleep` with microsecond resolution. |

`AsyncTask<T>` describes the task handle:

```e95
type AsyncTask<T = null> = {
    completed: boolean
    value: T
}
```

An `async` function always returns an `AsyncTask<T>`, where `T` is the type of the
returned value. When the function returns nothing, the task carries no payload
and its type is plain `AsyncTask`. `await` on an `AsyncTask<T>` yields `T`, so
the task's `value` field has that same type. Several async tasks started from
`main` run cooperatively on the event loop.

## Inlined timer wrappers

A wrapper whose whole body is a single `await sleep(parameter)` or
`await sleepMicros(parameter)` forwarding its only parameter is inlined at the
call site: the caller uses its own timer and no child task is created for the
wrapper, with the call-site argument as the duration. Any other wrapper (two or
more statements, a transformed argument, a parameter with a default value) is
awaited as a regular child task.

On the `macos-arm64` host, `sleep` and `sleepMicros` are backed by
`@embedito95/time` (`CLOCK_MONOTONIC` plus `nanosleep`), and the event loop
returns when no task remains, so `run` exits on its own. The `async: "scheduler"`
platform capability enables the host auto-import; board targets keep their
existing behavior. Host support does not imply upload, GPIO or Raspberry Pi
support.
