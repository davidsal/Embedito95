# Embedito95

Embedito95's language is **e95**, a TypeScript-like language for microcontrollers
that compiles to C++. Its small syntax and types make embedded development
approachable for beginners, artists and DIY makers without giving up hardware
control, while its small API and strict types make it **AI-friendly** and easy to
verify.

## Why Embedito95

Embedito95 targets basic or old single-core hardware without an FPU. Cooperative
tasks and no `f64`/`double` by default let a simple MCU run many concurrent
tasks, reducing cost and e-waste. It builds with the platform's native toolchain
(no VM or extra bootloader), and its layered compiler and libraries are open to
new architectures beyond AVR and ARM Cortex-M.

## About the author

Embedito95 is created by **David Melara**, an electronics and systems engineer.
He built the whole project on his own with AI agents, following his own ideas:
copy-on-write strings, reference counting, lower heap fragmentation, reworked
binary operations and cooperative multitasking. He never liked how large tools
such as Bison or TypeScript are, so the lexer, parser and language server are
built in-house; the language is TypeScript-like but deliberately smaller.

## Language

Embedito95 programs are written in **e95**, a small TypeScript-like language
that compiles to C++. Sources use the `.e95` extension and start at `main.e95`.
The language keeps only `type` declarations and closures, `T | null` unions and
a single set of fixed-width types. See [e95](docs/e95-language.md) for the
design, supported types, binary operations and value behavior.

## Engine

The generated C++ runtime is built for small devices: reference-counted handles,
copy-on-write strings, geometric buffers and cooperative tasks. See
[Engine](docs/engine.md) for handles and reference counting, heap fragmentation
and multitasking.

## Libraries

Embedito95 ships core libraries for the hardware (`@embedito95/gpio`,
`@embedito95/serial`, `@embedito95/spi`, ...) and built-in libraries for common
components (`dht22`, `servo`, `ssd1306`, ...). All are written in e95 and expose
the same API across boards. See [Libraries](docs/libraries.md) for every exported
function and method with its parameter and return types.

You can also write your own. From inside a project, run:

```sh
npx embedito95-cli init --library
```

It creates `libraries/<name>/` with a `config.json` and a `<platform>.e95` entry
file, registers the library in the project's `config.json`, and you import it by
its package name (`embedito95-<name>`). Libraries are written in **e95 only**:
the compiler generates the C++, so there is no C++ to write.

## Current targets

Embedito95 supports the Arduino Nano and Uno (AVR) and the STM32 Blue Pill
(ARM Cortex-M3), all through the same API. See [Boards](docs/boards.md) for
specs, pinouts and peripheral details.

The next target we would like to support is the **ESP32 and its variants**,
together with **WiFi and Bluetooth libraries**. That work requires time and
funding: donations help build those libraries while also improving the code and
paying human contributors, because Embedito95 is not an AI-only project.

## Donations

If you want to support the project and help bring ESP32, WiFi and Bluetooth
support to Embedito95, you can donate Bitcoin:

`bc1qr7je64upzyx2qhau7ekm3mlsscjdmjlythg5ey`

[![Donate Bitcoin](assets/donate-bitcoin.svg)](bitcoin:bc1qr7je64upzyx2qhau7ekm3mlsscjdmjlythg5ey?message=Embedito95%20donation)

GitHub may not open `bitcoin:` links directly, so you can also copy the address
above into any Bitcoin wallet.

## A first program

```e95
import {
    Pin,
    setAnalog,
    setDigital,
    setMode,
    LED_BUILTIN,
    HIGH,
    LOW,
    OUTPUT,
} from '@embedito95/gpio'
import { sleep } from '@embedito95/async'

const BLINK_DELAY = 500
const FADE_STEP = 5
const PWM_MIN = 0
const PWM_MAX = 255
const PWM_PIN = Pin.11

const blink = async () => {
    while (true) {
        setDigital(LED_BUILTIN, HIGH)
        await sleep(BLINK_DELAY)
        setDigital(LED_BUILTIN, LOW)
        await sleep(BLINK_DELAY)
    }
}

const fade = async () => {
    let value = PWM_MIN
    let step = FADE_STEP

    while (true) {
        setAnalog(PWM_PIN, value)
        value = value + step
        if (value >= PWM_MAX) {
            value = PWM_MAX
            step = -FADE_STEP
        }
        if (value <= PWM_MIN) {
            value = PWM_MIN
            step = FADE_STEP
        }
        await sleep(10)
    }
}

const setup = () => {
    setMode(LED_BUILTIN, OUTPUT)
    setMode(PWM_PIN, OUTPUT)
}

const main = () => {
    setup()
    blink()
    fade()
}

main()
```

Both functions are `async` tasks, so the event loop runs the blink and the
fade at the same time.

## Examples

Coming soon.

## Installation

Embedito95 requires **Node.js 22 or newer** (LTS recommended). Depending on
your board, you also need:

- **Arduino Nano or Uno** → `arduino-cli` with the AVR core.
- **STM32 Blue Pill** → STM32CubeIDE and an ST-Link V2 probe.

Follow the installation guide for your operating system:

- [Windows](docs/install/windows.md)
- [Linux](docs/install/linux.md)
- [macOS](docs/install/macos.md)

Once everything is installed, check the setup:

```sh
npx embedito95-cli doctor
```

Install the editor extension (VS Code, Cursor or VSCodium):

```sh
npx embedito95-cli install-vs-code
```

It downloads the extension from GitHub and installs it with your editor. The
language server is bundled inside, so there is nothing else to install. Add
`--verbose` to see the raw editor output if something fails.

Then create and flash a project:

```sh
npx embedito95-cli init      # create a project
cd my-project
npx embedito95-cli flash     # build + compile + upload
```

`flash` runs `build`, `compile` and `upload` in one step. If you prefer to run
them separately:

```sh
npx embedito95-cli build     # generate C++ from .e95
npx embedito95-cli compile   # compile for the target board
npx embedito95-cli upload    # upload the compiled firmware
```

Generated files live under `build/<project>/`:

- **`build`** writes the transpiled source (`<project>.ino` on AVR, C++ sources
  on STM32) plus `libraries/`, `modules/`, `core/` and `intermediate/`.
- **`compile`** creates the firmware. On STM32 it writes
  `build/<project>/artifacts/<project>.elf` and `<project>.bin` (plus object
  files). On AVR, `arduino-cli` keeps the `.hex` in its own build folder and the
  command prints the Flash/RAM usage.

## Development

To run Embedito95 locally (compiler, CLI, language server and tests), follow
the [development guide](docs/development.md).

## Roadmap

See [Roadmap](docs/roadmap.md) for the planned features, including the design of
automatic `volatile` for interrupt context.

## License

### Project code

The Embedito95 compiler, command-line interface, language server, editor
extensions, runtime, core libraries and the official standard e95 libraries are
licensed under the **GNU Affero General Public License v3.0 only**
(`AGPL-3.0-only`). See [LICENSE](LICENSE).

### Your code

Your sketches and your own libraries are yours. The C++ generated from them and
the firmware you build belong to you.

### Commercial use

If you distribute firmware that includes the Embedito95 runtime, that
distribution must comply with the AGPL (publish the corresponding source under
the AGPL) unless you hold a commercial license.

- Personal, educational and non-profit use: free under the AGPL.
- Commercial use with open-source firmware: free under the AGPL.
- Commercial use with closed firmware: commercial license, per developer seat,
  unlimited devices.
- Support, SLA and sponsored features: available separately.

Commercial licensing, support and sponsored development: licensing@voldrek.com
(see [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md)).

"Embedito95" and its logo are trademarks of David Melara. The licenses above do
not grant permission to use them.
