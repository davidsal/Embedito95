# Command line

`embedito95-cli` creates projects, installs libraries and builds firmware.
Every command can be run with `npx embedito95-cli <command>` or, after a global
install, `embedito95 <command>`.

Run `build`, `compile`, `run`, `upload`, `flash`, `monitor` and `install` from
the project root. `init` and `doctor` can run anywhere.

| Command | What it does |
| --- | --- |
| [`init`](#init) | Create a project |
| [`init --library`](#init---library) | Create a library inside a project |
| [`install`](#install) | Reinstall the libraries listed in `config.json` |
| [`install <library>`](#install-a-library) | Add a library and install it |
| [`libraries`](#libraries) | List available and installed libraries |
| [`build`](#build) | Transpile e95 to C++ |
| [`compile`](#compile) | Compile the firmware |
| [`run`](#run) | `build` + `compile` + run the executable |
| [`upload`](#upload) | Upload the firmware |
| [`flash`](#flash) | `build` + `compile` + `upload` |
| [`monitor`](#monitor) | Open the serial monitor |
| [`doctor`](#doctor) | Check the toolchain |
| [`install-vs-code`](#install-vs-code) | Install the editor extension |

## init

```sh
npx embedito95-cli init
```

Asks for a project name and a platform, then:

- writes `config.json`, `main.e95` and `.gitignore`;
- installs the core libraries for the platform under `core/`. Board targets
  install every core library except `console`, while host targets install
  `type`, `console`, `time` and `async`;
- writes `AGENTS.md` for AI agents;
- copies this documentation into `docs/`, pinned to the CLI version.

Available targets are `arduino-nano`, `arduino-uno`, `stm32-bluepill` and
`macos-arm64` (`macOS - ARM64`), listed with the boards first and the host
target last. Board targets write the blink example (`main.e95` with the GPIO and
time imports, `setup` and `blinkLed`). Host targets write a minimal `main.e95`
with an empty `setup`, a `main` that calls `setup()` as its first statement and
the final `main()` call, because GPIO code does not apply to the host. `init`
checks the platform toolchain and reports whether it is satisfied. On
`macos-arm64` the requirement is `clang++` from the Xcode Command Line Tools;
when it is missing, `init` prints the install hint shown under
[`compile`](#compile) and still creates the project.

The project cannot be created inside another project.

## init --library

```sh
npx embedito95-cli init --library
```

Run it from a project root. Asks for a library name and creates:

```text
libraries/<name>/
  config.json
  <platform>.e95
```

It also adds the library to `libraries` in the project `config.json` with the
package name `embedito95-<name>`, so `install` keeps it. Import it with:

```e95
import { myFunction } from 'embedito95-<name>'
```

## install

```sh
npx embedito95-cli install
```

Reinstalls everything declared in `config.json`: the core libraries in `core/`
and the libraries in `libraries/`. Use it after editing `config.json` by hand,
after upgrading the CLI, or when a library folder looks broken.

If a folder in `libraries/` is not registered in `config.json`, the command
warns and asks before deleting it.

## install a library

```sh
npx embedito95-cli install dht22
```

Adds the library to `config.json` and installs it in one step. The name can be
the short name, the package name or the local package name:

```sh
npx embedito95-cli install dht22
npx embedito95-cli install @embedito95/dht22
npx embedito95-cli install embedito95-dht22
```

Running it for an already installed library is safe: it reinstalls it.

The built-in libraries are `dht22`, `eeprom`, `max7219`, `servo`,
`software-serial` and `ssd1306`. See [Libraries](libraries.md).

## Remove a library

Delete its entry from `libraries` in `config.json` and reinstall:

```json
{
  "libraries": ["@embedito95/dht22"]
}
```

```sh
npx embedito95-cli install
```

The folder is removed because it is no longer registered. The command detects
the orphan folder and asks for confirmation before deleting it. Core libraries
cannot be removed.

## libraries

```sh
npx embedito95-cli libraries
```

Lists the core libraries, the built-in libraries available from the registry,
and marks the ones already installed in this project. Use it instead of guessing
names:

```text
Core libraries (always installed):
  @embedito95/gpio
  @embedito95/serial
  ...

Built-in libraries (install <name>):
  dht22 (installed)
  eeprom
  ...
```

## build

```sh
npx embedito95-cli build
```

Transpiles the `.e95` sources to C++ under `build/<project>/`. It reports
syntax, type and import errors. It does not need the board toolchain.

## compile

```sh
npx embedito95-cli compile
```

Compiles the generated C++ for the platform in `config.json`. On STM32 it
writes `build/<project>/artifacts/<project>.elf` and `<project>.bin`. On AVR the
`.hex` stays in the `arduino-cli` build folder, and the command prints the Flash
and RAM usage.

On `macos-arm64` it compiles with `clang++` using
`-std=c++11 -O2 -Wall -Wextra -fno-exceptions -fno-rtti` and writes the
executable to `build/<project>/artifacts/<project>`. Use [`run`](#run) to build,
compile and execute it in one step. This target requires the Xcode Command Line
Tools; when `clang++` is missing, the command fails with:

```text
clang++ not found. Install Xcode Command Line Tools: xcode-select --install
```

## run

```sh
npx embedito95-cli run
```

Runs `build`, `compile` and then the compiled executable from
`build/<project>/artifacts/<project>`. It inherits the terminal's stdin, stdout
and stderr, and exits with the program's exit code, so a non-zero result from
your program is reported as a non-zero exit code of the command.

Press Ctrl+C to stop the program. The CLI forwards `SIGINT` to the executable
(and `SIGTERM`/`SIGHUP` when the process receives them), prints
`✖ Interrupted (SIGINT)` and exits with `130` (`143` for `SIGTERM`, `129` for
`SIGHUP`). The executable is terminated too, so no orphan process is left behind.
If it does not exit within a short timeout, it is killed with `SIGKILL`.

Only host platforms (`macos-arm64`, using `clang++` and `console: "stdout"`)
support execution. On board platforms such as `arduino-nano` or
`stm32-bluepill`, `run` fails before building with:

```text
✖ Execution not supported for this platform
```

The host event loop returns when no async task remains, so a program whose
tasks finish exits on its own. The program receives no extra arguments; read
its input from stdin instead.

## upload

```sh
npx embedito95-cli upload
```

Uploads the compiled firmware to the board. Add `--verbose` to see the raw
tool output. Uploading requires a board; the `macos-arm64` host target has no
upload step.

## flash

```sh
npx embedito95-cli flash
```

Runs `build`, `compile` and `upload` in one step. This is the usual command
while developing.

## monitor

```sh
npx embedito95-cli monitor
```

Opens the serial monitor. `esc` exits, `c` clears the screen and `t` toggles
timestamps.

## doctor

```sh
npx embedito95-cli doctor
```

Checks the board toolchain for the selected platform and offers to fix what it
can. Run it after installing or when a build fails for missing tools.

## install-vs-code

```sh
npx embedito95-cli install-vs-code
```

Installs the extension in VS Code, Cursor or VSCodium. The extension and its
language server are bundled inside the CLI package, so the installed version
always matches the CLI version. Add `--verbose` to see the raw editor output.

## config.json

```json
{
  "name": "my-project",
  "type": "project",
  "embedito95Version": "embedito95@1.0.0",
  "platform": "arduino-nano",
  "core": ["@embedito95/gpio"],
  "libraries": ["@embedito95/dht22"]
}
```

| Field | Meaning |
| --- | --- |
| `name` | Project name, also used for the `build/<name>/` folder. |
| `type` | `project` or `library`. |
| `embedito95Version` | Toolchain version the project is pinned to. `docs/` matches it, and the CLI delegates to it when it differs from the running version. |
| `platform` | Target board. |
| `core` | Package names of the core libraries installed for that platform. Boards list every core library except `@embedito95/console`; host targets list `@embedito95/type`, `@embedito95/console`, `@embedito95/time` and `@embedito95/async`. Maintained by the CLI. |
| `libraries` | Package names of the libraries to install from the registry. Edit this to add or remove. |

`core` and `libraries` are lists of package names, not versions: the library
version is fixed by `embedito95Version`, so libraries are not versioned
separately.

## Toolchain version delegation

When you run a command inside a project, the CLI reads `embedito95Version` from
`config.json` and compares it with the version that is running. If they match,
the project has no `config.json`, or `config.json` has no valid
`embedito95Version`, the command runs normally and prints nothing extra.

If they differ, the CLI prints one line to `stderr` and re-runs the pinned
version with the same arguments:

```text
Using embedito95-cli@1.0.0 (project pin)
```

Internally it runs `npx --yes embedito95-cli@1.0.0 <your arguments>` (through
`cmd.exe /c` on Windows) with inherited stdio and forwards the child exit code. The first delegation may
download the pinned version; `npx` caches it, so later runs do not need the
network. In a monorepo, run each command from the project you want: every
`config.json` delegates to its own `embedito95Version`.

If the pinned version cannot start at all (the `npx` process cannot be spawned),
the CLI exits with an error instead of silently running the wrong version, and
prints the manual command:

```text
Could not start embedito95-cli@1.0.0 for this project. Run 'npx embedito95-cli@1.0.0 build' manually, or pass --force to use the running CLI.
```

If `npx` does start but fails (for example the version is unpublished, or the
network is unavailable with no cache), its `stderr` and exit code are forwarded
unchanged.

A child process started this way sets `EMBEDITO95_DELEGATED=1` so it never
delegates again.

To run the current CLI deliberately, pass `--force` or set
`EMBEDITO95_SKIP_VERSION_CHECK=1`:

```sh
npx embedito95-cli build --force
EMBEDITO95_SKIP_VERSION_CHECK=1 npx embedito95-cli build
```

`--force` is consumed by the CLI and never reaches the command or the delegated
invocation.
