# Timer

Hardware timers, tones and pulse measurement.

```e95
import { getTimer, Timer } from '@embedito95/timer'

const timer = getTimer(Timer.1)
```

`Timer` lists the counters available on the board. `getTimer` returns a
`HardwareTimer`.

| API | Description |
| --- | --- |
| `initialize(periodMicros: u32, callback): void` | Sets the period and registers the period callback. |
| `setPeriod(periodMicros: u32): void` | Changes the period while running. |
| `start(): void` | Starts period callbacks. |
| `stop(): void` | Stops period callbacks. |

Free functions:

| API | Description |
| --- | --- |
| `startTone(timer: Timer, pin: Pin, frequencyHertz: u16): void` | Drives a square wave on the pin. |
| `stopTone(pin: Pin): void` | Stops the tone and leaves the pin `LOW`. |
| `measurePulseWidth(pin: Pin, pulseLevel: DigitalLevel, timeoutMicros: u32): u32` | Measures a pulse in microseconds, or `0` on timeout. |

The callback runs in interrupt context and must be a top-level function without
captured state.
