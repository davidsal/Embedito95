# Embedito95

Embedito95's language is **e95**, a TypeScript-like language that compiles to
C++. It targets microcontrollers and hosts with the same syntax and types: the
generated C++ can be built into device firmware, or into an executable such as a
kernel, an operating system or an application. Its small syntax and types make
embedded development approachable for beginners, artists and DIY makers without
giving up hardware control, while its small API and strict types make it
**AI-friendly** and easy to verify.

## Why Embedito95

Embedito95 targets basic or old single-core hardware without an FPU. Cooperative
tasks and `f32` as the default float (with an optional portable `f64`) let a
simple MCU run many concurrent tasks, reducing cost and e-waste. It builds with
the platform's native toolchain (no VM or extra bootloader), and its layered
compiler and libraries are open to new architectures beyond AVR and ARM
Cortex-M.

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
design and the TypeScript differences, then follow the topic links:
[declarations](docs/language/declarations.md), [types](docs/language/types.md),
[expressions](docs/language/expressions.md),
[control flow](docs/language/control-flow.md) and
[async](docs/language/async.md).

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

Embedito95 runs on microcontroller boards and on host targets through the same
API. Today it supports the Arduino Nano and Uno (AVR), the STM32 Blue Pill (ARM
Cortex-M3) and `macOS - ARM64` as the first host target. See
[Boards](docs/boards.md) for specs, pinouts and peripheral details.

The output is not limited to firmware. Depending on the target, the same e95
source can produce:

- **Device firmware** for microcontrollers and bare-metal boards.
- **Host software**, including kernels, operating systems, services and
  applications.

More host targets (Linux and Windows) and bare-metal targets are planned. The
license does not depend on the target: it covers the output, whatever the
platform. **ESP32 and its variants**, together with **WiFi and Bluetooth
libraries**, remain on the roadmap. That work requires time and funding:
donations help build those libraries while also improving the code and paying
human contributors, because Embedito95 is not an AI-only project.

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
- **macOS - ARM64** → Xcode Command Line Tools (`xcode-select --install`).

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

Then create a project and either flash it (boards) or run it (host targets):

```sh
npx embedito95-cli init      # create a project
cd my-project
npx embedito95-cli flash     # build + compile + upload (boards)
npx embedito95-cli run       # build + compile + execute (hosts)
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
- **`compile`** creates the firmware, or the host executable on `macos-arm64`.
  On STM32 it writes `build/<project>/artifacts/<project>.elf` and
  `<project>.bin` (plus object files). On AVR, `arduino-cli` keeps the `.hex` in
  its own build folder and the command prints the Flash/RAM usage. On
  `macos-arm64` it writes `build/<project>/artifacts/<project>`.

## Command line

The full reference is [docs/cli.md](docs/cli.md). The commands that are easy to
miss:

```sh
npx embedito95-cli install dht22    # add a built-in library
npx embedito95-cli init --library   # create a library inside this project
npx embedito95-cli install          # reinstall what config.json declares
```

To remove a library, see
[Remove a library](docs/cli.md#remove-a-library). Do not delete the folder by
hand.

A new project also contains `AGENTS.md` and a copy of these docs under `docs/`,
pinned to the toolchain version in `config.json`, so AI agents and editors read
the e95 rules instead of guessing TypeScript.

## Development

To run Embedito95 locally (compiler, CLI, language server and tests), follow
the [development guide](docs/development.md).

## Contributing

External pull requests are not accepted. Bug reports, ideas and board reports
are welcome as [issues](https://github.com/davidsal/Embedito95/issues). See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

Planned work lives in the public backlog. See the
[project board](https://github.com/users/davidsal/projects/2) or the
[issues](https://github.com/davidsal/Embedito95/issues).

## License

### Project code

The Embedito95 compiler, command-line interface, language server, editor
extensions, runtime, core libraries and the official standard e95 libraries are
licensed under the **GNU Affero General Public License v3.0 only**
(`AGPL-3.0-only`). See [LICENSE](LICENSE).

### Your code and your output

Your sketches and your own libraries are yours. The C++ generated from them and
the resulting output belong to you, whether that output is device firmware, an
executable, a kernel, an operating-system image or an application. Embedito95
does not claim ownership of your output.

A commercial license only changes the **distribution terms**: you need one when
you distribute your output commercially without publishing its source under the
AGPL. Owning or building the output never requires a payment.

### Who pays

The rule is simple: **if the output leaves your hands, it is either open source
or licensed.**

| You | Cost |
| --- | --- |
| Student, hobby, personal use | Free. You do not distribute the output, so the AGPL asks nothing from you. |
| Open-source project | Free. Publish your source under the AGPL. |
| Company using it internally | Free while you do not distribute the output. |
| Selling or giving away devices running your firmware | AGPL applies: publish your source. |
| Distributing executables, applications, kernels or OS images | AGPL applies: publish your source. |
| Distributing private output (firmware, executable, kernel, OS image or application) | Commercial license, per developer seat, unlimited devices and deployments. |
| Distributing a modified Embedito95 without publishing it | Commercial license. |

Shipping a product, flashing devices, or distributing an executable or an
operating-system image is commercial use. You do not have to pay if you publish
the corresponding source under the AGPL. You pay when you want to keep it
private.

Support, SLA and sponsored features are available separately.

Commercial licensing, support and sponsored development: licensing@voldrek.com
(see [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md)).

"Embedito95" and its logo are trademarks of David Melara. The licenses above do
not grant permission to use them.
