# Servo

Servo control with angles and pulse widths.

```e95
import { getServo } from '@embedito95/servo'
import { Pin } from '@embedito95/gpio'

const servo = getServo(Pin.9)
```

| API | Description |
| --- | --- |
| `getServoChannelCount(): u8` | Number of servo outputs the board can drive. |
| `getServo(pin: Pin): Servo` | Creates a handle for a pulse output pin. |

## Servo

| API | Description |
| --- | --- |
| `isActive(): boolean` | Whether the handle owns a pulse channel. |
| `setAngle(angleDegrees: u8): void` | Moves to an angle; values above 180 are clamped. |
| `getAngle(): u8` | Last commanded angle. |
| `setPulseWidth(pulseMicros: u16): void` | Sets the pulse directly, clamped to the configured range. |
| `getPulseWidth(): u16` | Current pulse width. |
| `setPulseRange(minimumPulseMicros: u16, maximumPulseMicros: u16): void` | Pulse widths that map to 0 and 180 degrees. |
| `release(): void` | Stops the pulses and frees the channel. |

A handle created for a pin without a pulse output stays inactive, and its
operations have no effect.
