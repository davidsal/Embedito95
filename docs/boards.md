# Boards

Embedito95 currently supports the boards below. They share the same e95 API;
the differences are in resolution, available pins and hardware capabilities,
not in function names.

## Supported boards

| Board | Platform id | MCU | Architecture | Clock | Memory | Logic | Runtime |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Arduino Nano | `arduino-nano` | ATmega328P | AVR | 16 MHz | 32 KB flash / 2 KB SRAM / 1 KB EEPROM | 5 V | 16-bit, no `f64`, PROGMEM |
| Arduino Uno | `arduino-uno` | ATmega328P | AVR | 16 MHz | 32 KB flash / 2 KB SRAM / 1 KB EEPROM | 5 V | 16-bit, no `f64`, PROGMEM |
| STM32 Blue Pill | `stm32-bluepill` | STM32F103C8T6 | ARM Cortex-M3 | 72 MHz | 64 KB flash / 20 KB SRAM / no EEPROM | 3.3 V | 32-bit, `f64`, no PROGMEM |

## Peripherals

| Board | GPIO | ADC | DAC | PWM | Timers | External interrupts | SPI | I2C | UART |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Arduino Nano | 20 (+2 ADC-only) | 8 × 10-bit | — | 6 × 8-bit | 3 | 2 | 1 | 1 | 1 |
| Arduino Uno | 20 | 6 × 10-bit | — | 6 × 8-bit | 3 | 2 | 1 | 1 | 1 |
| STM32 Blue Pill | 33 | 10 × 12-bit | — | 12 × 16-bit | 4 | 16 lines | 2 | 2 | 3 |

## Arduino Nano

- **GPIO**: D0–D13; A0–A5 analog and digital; A6–A7 ADC-only.
- **PWM**: D3, D5, D6, D9, D10, D11. 490 Hz on D3/D9/D10/D11, 980 Hz on D5/D6.
- **Timers**: `TIMER_0` 8-bit (reserved by `millis`), `TIMER_1` 16-bit,
  `TIMER_2` 8-bit.
- **Interrupts**: `INT0` and `INT1` on D2/D3, with `LOW`, `CHANGE`, `RISING` and
  `FALLING` triggers.
- **Buses**: SPI D11/D12/D13 (SS D10), I2C A4/A5, UART D0/D1 (300–115200 baud).
- **Pin modes**: `INPUT`, `OUTPUT` and `INPUT_PULLUP`.

## Arduino Uno

Identical to the Arduino Nano except that it exposes six ADC channels (A0–A5).
Pins A6 and A7 are not available on the Uno.

## STM32 Blue Pill

- **GPIO**: A0–A15, B0–B15 and C13. C14/C15 are oscillator-only; A13/A14 and
  B3/B4 are marked as debug pins.
- **PWM**: A0–A3, A6, A7, B0, B1 and B6–B9; 16-bit at 1 kHz (`TIM2`, `TIM3` and
  `TIM4`).
- **Timers**: `TIMER_1` on APB2 and `TIMER_2`–`TIMER_4` on APB1, 16-bit at
  72 MHz.
- **Interrupts**: `EXTI0`–`EXTI15`, selected by pin number across ports (PA0,
  PB0 and PC0 share `EXTI0`; the last attach wins). Triggers: `LOW`, `CHANGE`,
  `RISING` and `FALLING`.
- **Buses**: SPI1 A4–A7 and SPI2 B12–B15; I2C1 B6/B7 and I2C2 B10/B11; UART1
  A9/A10, UART2 A2/A3 and UART3 B10/B11 (1200–2,000,000 baud).
- **Pin modes**: `INPUT`, `OUTPUT`, `INPUT_PULLUP` and `INPUT_PULLDOWN`.
- **No DAC** and no internal EEPROM.
