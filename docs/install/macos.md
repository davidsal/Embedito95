# Install on macOS

This guide installs everything you need to write and upload your first
Embedito95 program. It takes about 15–30 minutes.

You only need the tools for the board you own:

- **Arduino Nano or Uno** → Node.js + `arduino-cli`
- **STM32 Blue Pill** → Node.js + STM32CubeIDE

## 1. Install Node.js 22 or newer

Install **Node.js 22 or newer**. The LTS release is recommended.

Download the **LTS** installer from <https://nodejs.org> and run it. This is the
simplest option.

If you use Homebrew, you can install it from the terminal instead:

```bash
brew install node
```

Open **Terminal** and check:

```bash
node --version
```

You should see `v22` or newer. Embedito95 does not work with older versions.

## 2. Install your board tools

### Arduino Nano or Uno

Install `arduino-cli` with Homebrew:

```bash
brew install arduino-cli
```

Or follow the
[official installation page](https://arduino.github.io/arduino-cli/latest/installation/).

Then install the AVR core:

```bash
arduino-cli core install arduino:avr
```

Some clones use a **CH340** USB chip. If macOS does not detect the board,
install the CH340 driver. Original Nanos may need an **FTDI** driver.

### STM32 Blue Pill

1. Download **STM32CubeIDE** from STMicroelectronics.
2. Open the `.dmg` and drag STM32CubeIDE into **Applications**.
3. It includes the ARM compiler and the STM32CubeProgrammer CLI.
4. For uploading you also need an **ST-Link V2** probe.

The STM32 firmware is downloaded automatically. You do not need `git` or a
manual clone.

`doctor` looks for CubeIDE in:

```text
/Applications/STM32CubeIDE.app
```

If you installed it somewhere else, `doctor` will ask for the path and save it.

## 3. Check your setup

```bash
npx embedito95-cli doctor
```

Choose your board family and board. `doctor` shows a `✔` or `✖` for every
requirement and offers to fix what it can.

The first `npx` command downloads the CLI, so it may take a minute.

To get syntax highlighting, diagnostics, hover and completions in VS Code,
Cursor or VSCodium, install the editor extension:

```sh
npx embedito95-cli install-vs-code
```

The language server is bundled inside the extension.

## 4. Create and upload a project

```bash
npx embedito95-cli init
cd my-project
npx embedito95-cli flash
```

`init` asks for the project name, family and board. `flash` builds, compiles
and uploads the program in one step.

To open the serial monitor:

```bash
npx embedito95-cli monitor
```

## If something fails

- **`node` or `npx` not found** → install Node.js again and open a new Terminal
  window.
- **`arduino-cli` not found** → check that Homebrew's `bin` folder is in your
  `PATH`.
- **The board is not detected** → try another USB cable (it must carry data,
  not only power), install the CH340/FTDI driver, or use another USB port.
- **“App cannot be opened because the developer cannot be verified”** → open
  **System Settings → Privacy & Security** and allow the app.
- **STM32 not detected** → check the ST-Link wiring and driver.
- **`doctor` reports CubeIDE missing** → run `npx embedito95-cli doctor` again and
  enter the CubeIDE path when asked.

Next: see the [supported boards](../boards.md) or go back to the
[first program](../../README.md#a-first-program).
