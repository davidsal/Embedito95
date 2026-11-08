# Command line

`embedito95-cli` creates projects, installs libraries and builds firmware.
Every command can be run with `npx embedito95-cli <command>` or, after a global
install, `embedito95 <command>`.

Run `build`, `compile`, `upload`, `flash`, `monitor` and `install` from the
project root. `init` and `doctor` can run anywhere.

| Command | What it does |
| --- | --- |
| [`init`](#init) | Create a project |
| [`init --library`](#init---library) | Create a library inside a project |
| [`install`](#install) | Reinstall the libraries listed in `config.json` |
| [`install <library>`](#install-a-library) | Add a library and install it |
| [`libraries`](#libraries) | List available and installed libraries |
| [`build`](#build) | Transpile e95 to C++ |
| [`compile`](#compile) | Compile the firmware |
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
- installs the core libraries for the platform under `core/`;
- writes `AGENTS.md` for AI agents;
- copies this documentation into `docs/`, pinned to the CLI version.

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
  "libraries": {
    "@embedito95/dht22": "0.1.0"
  }
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

## upload

```sh
npx embedito95-cli upload
```

Uploads the compiled firmware to the board. Add `--verbose` to see the raw
tool output.

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

Installs the extension in VS Code, Cursor or VSCodium. The language server is
bundled inside. Add `--verbose` to see the raw editor output.

## config.json

```json
{
  "name": "my-project",
  "type": "project",
  "embedito95Version": "embedito95@0.1.6",
  "platform": "arduino-nano",
  "core": {
    "@embedito95/gpio": "0.1.0"
  },
  "libraries": {
    "@embedito95/dht22": "0.1.0"
  }
}
```

| Field | Meaning |
| --- | --- |
| `name` | Project name, also used for the `build/<name>/` folder. |
| `type` | `project` or `library`. |
| `embedito95Version` | Toolchain version that created the project. `docs/` matches it. |
| `platform` | Target board. |
| `core` | Core libraries installed for that platform. Maintained by the CLI. |
| `libraries` | Libraries to install from the registry. Edit this to add or remove. |
