# Servo hardware

Low-level pulse channels used by the `@embedito95/servo` library.

```e95
import { getChannel, setChannelPulse } from '@embedito95/servo-hardware'
```

| API | Description |
| --- | --- |
| `getChannelCount(): u8` | Number of pulse outputs the board can drive. |
| `getChannel(pin: Pin): u8` | Channel wired to the pin, or `0` when it has none. |
| `setChannelPulse(channel: u8, pulseMicros: u16): void` | Sets the high time in a fixed 50 Hz frame. |
| `releaseChannel(channel: u8): void` | Stops the pulse and leaves the pin `LOW`. |

For degrees and pulse ranges, use `@embedito95/servo`.
