# Libraries

Embedito95 ships **core libraries** for the hardware and **built-in libraries**
for common components. All of them are written in e95 and share the same API
across boards.

```e95
import { getSerial, Serial } from '@embedito95/serial'
import { getSensor } from '@embedito95/dht22'
```

Core libraries ship with every project. Built-in libraries are added on demand:

```sh
npx embedito95-cli libraries        # list what is available
npx embedito95-cli install dht22
```

## Core libraries

| Library | Package | Provides |
| --- | --- | --- |
| [GPIO](libraries/core/gpio.md) | `@embedito95/gpio` | Digital and analog pins, PWM, shift helpers |
| [Time](libraries/core/time.md) | `@embedito95/time` | Delays and millisecond/microsecond clock |
| [Async](libraries/core/async.md) | `@embedito95/async` | `sleep` and the `AsyncTask` type |
| [Math](libraries/core/math.md) | `@embedito95/math` | Ranges, rounding, trig, random and bit helpers |
| [Serial](libraries/core/serial.md) | `@embedito95/serial` | UART ports and text/number parsing |
| [SPI](libraries/core/spi.md) | `@embedito95/spi` | SPI buses and transactions |
| [I2C](libraries/core/i2c.md) | `@embedito95/i2c` | I2C master and slave buses |
| [Interrupt](libraries/core/interrupt.md) | `@embedito95/interrupt` | Pin interrupts |
| [Timer](libraries/core/timer.md) | `@embedito95/timer` | Hardware timers, tones and pulse measurement |
| [Servo hardware](libraries/core/servo-hardware.md) | `@embedito95/servo-hardware` | Low-level pulse channels |
| [EEPROM hardware](libraries/core/eeprom-hardware.md) | `@embedito95/eeprom-hardware` | Non-volatile memory cells |
| [Software serial hardware](libraries/core/software-serial-hardware.md) | `@embedito95/software-serial-hardware` | Low-level software UART driver |
| [Canvas](libraries/core/canvas.md) | `@embedito95/canvas` | 5x7 font glyph data |
| [System](libraries/core/system.md) | `@embedito95/system` | Free heap reporting |
| [Type](libraries/core/type.md) | `@embedito95/type` | Array, string, object and 128-bit support |

## Built-in libraries

| Library | Package | Provides |
| --- | --- | --- |
| [DHT22](libraries/built-in/dht22.md) | `@embedito95/dht22` | Temperature and humidity sensor |
| [EEPROM](libraries/built-in/eeprom.md) | `@embedito95/eeprom` | Byte and block access to non-volatile memory |
| [MAX7219](libraries/built-in/max7219.md) | `@embedito95/max7219` | 8x8 LED matrix controller |
| [Servo](libraries/built-in/servo.md) | `@embedito95/servo` | Servo angle and pulse control |
| [Software serial](libraries/built-in/software-serial.md) | `@embedito95/software-serial` | Serial port on GPIO pins |
| [SSD1306](libraries/built-in/ssd1306.md) | `@embedito95/ssd1306` | OLED display over I2C or SPI |

## Creating a library

You can write your own libraries in e95. From inside a project, run:

```sh
npx embedito95-cli init --library
```

It asks for a library name and creates `libraries/<name>/` with:

- `config.json` — `"type": "library"` and package `embedito95-<name>`.
  `embedito95Version` is the compatibility anchor: libraries are not versioned
  separately. It is inherited from the parent project's `config.json`, so a
  library keeps targeting the version the project is pinned to even when a
  different CLI version creates it. A standalone library (with no enclosing
  project) falls back to the version of the CLI that created it.
- `<platform>.e95` — the entry file for the project's platform (for example
  `arduino-nano.e95`).

The library is also registered in the project's `config.json` under `libraries`,
and `build` compiles it automatically. Import it by its package name:

```e95
import { myFunction } from 'embedito95-<name>'
```

Libraries are written in **e95 only**. There is no C++ to write: the compiler
generates it from your e95 source. Only `.e95` files inside the library
directory are used, and the entry file is `main.e95` if present, otherwise the
first `.e95` file. Low-level C++ templates exist only inside the registry
strategies for the supported boards; they are not part of a user library.

