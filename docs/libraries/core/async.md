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
