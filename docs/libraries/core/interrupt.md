# Interrupt

Pin interrupts.

```e95
import { attachPinInterrupt, InterruptMode } from '@embedito95/interrupt'
```

`InterruptMode`: `LOW`, `CHANGE`, `RISING` and `FALLING`.

| API | Description |
| --- | --- |
| `attachPinInterrupt(pin: Pin, handler: () => void, mode: InterruptMode): void` | Runs `handler` on the selected pin transition. |
| `detachPinInterrupt(pin: Pin): void` | Stops delivering interrupts from the pin. |
| `getInterruptNumber(pin: Pin): u8` | Interrupt channel of the pin, or `255` when it has none. |
| `enableInterrupts(): void` | Enables interrupt delivery. |
| `disableInterrupts(): void` | Disables interrupt delivery. |

The handler is declared as `() => void`: pass a named function or a captureless
inline arrow with that exact signature. It runs in interrupt context, so keep it
short.
