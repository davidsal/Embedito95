# Roadmap

What Embedito95 should support next. Each item describes the expected behavior,
not an implementation plan. The list is not ordered by priority.

## Self-referencing objects

Objects should be able to reference themselves directly, such as `a.next = a` or
`a.parent = a`, including nullable fields. Reference counting must keep working;
cycles that are never broken still leak, as they do today.

## WiFi and Bluetooth

Embedito95 should ship libraries for common WiFi and Bluetooth modules, with the
same e95 API regardless of the underlying chip. The first step is the ESP32 as a
target; other modules can follow.

## ESP32

The ESP32 and its variants should become supported targets: their own platform
data, peripheral coverage (GPIO, PWM, ADC, I2C, SPI, serial) and the same
toolchain flow as the current boards.

## True fixed-size arrays and strings

`T[N]` should reserve exactly `N` elements, and there should be a fixed-size
string type. Both stay on the heap, but with a fixed capacity, so they never
reallocate and do not fragment memory.

## Portable `f64`

`f64` should work on targets without a native `double`, such as AVR, where it is
currently unavailable. On MCUs without hardware floating point it should fall
back to a portable software implementation with the same operations and
precision as on 32-bit targets, accepting the extra flash usage and slower math.
`f32` should remain the recommended default for those boards.

## Automatic `volatile`

Variables shared between an interrupt handler and normal code should be emitted
as `volatile` automatically, so the optimizer does not cache values the ISR
changes. For example:

```e95
let flag: boolean = false

const onEdge = () => {
    flag = true
}

const main = () => {
    attachPinInterrupt(Pin.2, onEdge, InterruptMode.RISING)
    while (!flag) {
        // must see the change made by the ISR
    }
}
```

### What it should cover

Callbacks registered through these APIs:

| API | AVR | STM32 |
| --- | --- | --- |
| `attachPinInterrupt` | `attachInterrupt` (EXTI) | `EXTIx_IRQHandler` |
| `HardwareTimer.initialize` | `ISR(TIMERx_COMPA_vect)` | `TIMx_IRQHandler` |
| `I2CBus.onReceive` / `onRequest` | `Wire` TWI ISR | `I2Cx_EV/ER_IRQHandler` |

If a handler calls another function that touches a global, that global is
covered too.

### What it should not affect

These use interrupts internally but never expose their state, so user variables
are not involved:

- `software_serial_hardware`, whose buffers are already `volatile`.
- `startTone`, which shares the timer ISR but only touches internal state.
- `eeprom_hardware` on AVR, which briefly disables interrupts instead of using
  an ISR.
- `servo_hardware` and `spi`, which use hardware PWM or blocking polling.
- `serial` on STM32, which polls; on Arduino the RX ISR lives inside
  `HardwareSerial`.
- `time` on Arduino, backed by the Timer0 ISR of the Arduino core; on STM32 it
  reads the DWT cycle counter.
- `async`, which is cooperative and runs on the same thread.
- The built-in libraries `dht22`, `servo`, `ssd1306`, `max7219` and `eeprom` do
  not share user state with an ISR. `software-serial` only does so internally.

### Limits

Only variables shared between an ISR and normal code are marked; a global used
only from `main` stays plain.

`volatile` does not make access atomic. On AVR a `u32` read takes several
instructions, so multi-byte values still need `disableInterrupts()` /
`enableInterrupts()` or a queue such as the one in `software_serial_hardware`.

## Idle sleep

When the event loop has no task ready to run, the MCU should enter a low-power
sleep mode instead of spinning, and wake on the next interrupt. It should:

- Sleep only when every task is waiting or the queue is empty, never while a
  task is runnable.
- Wake on the next deadline: timer compare, pin interrupt, serial or I2C
  interrupt, or any other enabled interrupt.
- Resume the event loop where it left off, keeping `await sleep()` and timer
  callbacks on time.
- Pick the deepest mode the board supports, such as idle mode on AVR and `WFI`
  on STM32.
- Stay transparent to user code: same behavior, less power, no new API.
