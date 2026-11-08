# GPIO

Digital and analog pin access, PWM and shift helpers.

```e95
import { Pin, PinMode, setMode, setDigital, HIGH } from '@embedito95/gpio'
```

## Enums and constants

- `PinMode`: `INPUT`, `OUTPUT`, plus `INPUT_PULLUP` or `INPUT_PULLDOWN` where the
  board supports it. `INPUT` and `OUTPUT` are also exported directly.
- `Pin`: the pins of the board. `LED_BUILTIN` points to the onboard LED.
- `DigitalLevel`: `LOW` and `HIGH`, also exported directly.
- `BitOrder`: `MSB_FIRST` and `LSB_FIRST`, also exported directly.
- `VoltageReference`: `EXTERNAL`, `SUPPLY` and `INTERNAL`.

## Functions

| API | Description |
| --- | --- |
| `setMode(pin: Pin, mode: PinMode): void` | Configures a pin as input or output. |
| `setDigital(pin: Pin, level: DigitalLevel): void` | Drives a digital pin `LOW` or `HIGH`. |
| `getDigital(pin: Pin): DigitalLevel` | Reads the digital level of a pin. |
| `writeShift(dataPin: Pin, clockPin: Pin, bitOrder: BitOrder, value: u8): void` | Sends one byte bit by bit, pulsing the clock pin. |
| `readShift(dataPin: Pin, clockPin: Pin, bitOrder: BitOrder): u8` | Reads one byte bit by bit, pulsing the clock pin. |
| `setAnalog(pin: Pin, value: u8 \| u16): void` | Sets the PWM duty. The type is `u8` on AVR and `u16` on STM32. |
| `getAnalog(pin: Pin): i16` | Reads the ADC value. |
| `setReference(reference: VoltageReference): void` | Selects the ADC voltage reference. |
