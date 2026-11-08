# Install on Windows

This guide installs everything you need to write and upload your first
Embedito95 program. It takes about 15–30 minutes.

You only need the tools for the board you own:

- **Arduino Nano or Uno** → Node.js + `arduino-cli`
- **STM32 Blue Pill** → Node.js + STM32CubeIDE

## 1. Install Node.js 22 or newer

Install **Node.js 22 or newer**. The LTS release is recommended.

Open **PowerShell** and run:

```powershell
winget install OpenJS.NodeJS.LTS
```

If `winget` is not available, download the LTS installer from
<https://nodejs.org> and run it.

Close PowerShell, open a **new** window and check:

```powershell
node --version
```

You should see `v22` or newer. Embedito95 does not work with older versions.

## 2. Install your board tools

### Arduino Nano or Uno

1. Install `arduino-cli` from the
   [official installation page](https://arduino.github.io/arduino-cli/latest/installation/).
2. Make sure `arduino-cli` is available in PowerShell:
3. Install the AVR core:

```powershell
arduino-cli core install arduino:avr
```

Clones usually need a **CH340** USB driver; original Nanos may need an
**FTDI** driver. Install it if Windows does not detect the board.

### STM32 Blue Pill

1. Install **STM32CubeIDE** from STMicroelectronics.
2. It already includes the ARM compiler and the STM32CubeProgrammer CLI.
3. For uploading you also need an **ST-Link V2** probe. Its driver is installed
   with STM32CubeIDE.

The STM32 firmware is downloaded automatically. You do not need `git` or a
manual clone.

If `doctor` cannot find CubeIDE, it will ask you for the installation folder.
The usual locations are:

```text
C:\ST\STM32CubeIDE_*
C:\Program Files\STMicroelectronics\STM32Cube\*
```

## 3. Check your setup

```powershell
npx embedito95-cli doctor
```

Choose your board family and board. `doctor` shows a `✔` or `✖` for every
requirement and offers to fix what it can.

The first `npx` command downloads the CLI, so it may take a minute.

## 4. Create and upload a project

```powershell
npx embedito95-cli init
cd my-project
npx embedito95-cli flash
```

`init` asks for the project name, family and board. `flash` builds, compiles
and uploads the program in one step.

To open the serial monitor:

```powershell
npx embedito95-cli monitor
```

## If something fails

- **`npx` or `node` not found** → install Node.js again and open a new
  PowerShell window.
- **`arduino-cli` not found** → add its folder to `PATH`, then reopen
  PowerShell.
- **The board is not detected** → try another USB cable (it must carry data,
  not only power), install the CH340/FTDI driver, or use another USB port.
- **STM32 not detected** → check the ST-Link wiring and driver.
- **`doctor` reports CubeIDE missing** → run `npx embedito95-cli doctor` again and
  enter the CubeIDE folder when asked.

Next: see the [supported boards](../boards.md) or go back to the
[first program](../../README.md#a-first-program).
