# Time

Delays and the millisecond/microsecond clock.

```e95
import { delay, getMillis, hasElapsed } from '@embedito95/time'
```

| API | Description |
| --- | --- |
| `delay(milliseconds: u32): void` | Blocks the CPU for the given time. |
| `delayMicros(microseconds: u32): void` | Blocks the CPU for the given time. |
| `getMillis(): u32` | Milliseconds since the board started. |
| `getMicros(): u32` | Microseconds since the board started. |
| `hasElapsed(startMillis: u32, elapsedMillis: u32): boolean` | Checks a millisecond deadline, safe across counter overflow. |
| `hasElapsedMicros(startMicros: u32, elapsedMicros: u32): boolean` | Checks a microsecond deadline, safe across counter overflow. |

`delay` blocks and does not yield. Inside async tasks use `await sleep(ms)` from
`@embedito95/async` instead.
