# Install on Linux

This guide installs everything you need to write and upload your first
Embedito95 program. It takes about 15–30 minutes.

You only need the tools for the board you own:

- **Arduino Nano or Uno** → Node.js + `arduino-cli`
- **STM32 Blue Pill** → Node.js + STM32CubeIDE

The commands below use Ubuntu/Debian (`apt`). On Fedora, replace `apt` with
`dnf` where needed.

## 1. Install Node.js 22 or newer

Install **Node.js 22 or newer**. The LTS release is recommended.

Run these two commands in a terminal:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Check the version:

```bash
node --version
```

You should see `v22` or newer. If your distribution already has Node.js 22 or
newer, you can skip this step.

## 2. Install your board tools

### Arduino Nano or Uno

Install `arduino-cli` with the official script:

```bash
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
sudo mv bin/arduino-cli /usr/local/bin/
```

Then install the AVR core:

```bash
arduino-cli core install arduino:avr
```

Give your user permission to use serial ports:

```bash
sudo usermod -aG dialout $USER
```

Log out and log back in for the change to take effect.

### STM32 Blue Pill

1. Install **STM32CubeIDE** from STMicroelectronics.
2. Extract or install it under `/opt/st` or `~/st`; `doctor` looks in both
   places.
3. It includes the ARM compiler and the STM32CubeProgrammer CLI.
4. For uploading you also need an **ST-Link V2** probe.

The STM32 firmware is downloaded automatically. You do not need `git` or a
manual clone.

## 3. Check your setup

```bash
npx embedito95-cli doctor
```

Choose your board family and board. `doctor` shows a `✔` or `✖` for every
requirement and offers to fix what it can.

The first `npx` command downloads the CLI, so it may take a minute.

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

- **`node` or `npx` not found** → install Node.js again and reopen the terminal.
- **`arduino-cli` not found** → check that `/usr/local/bin` is in your `PATH`.
- **Permission denied on `/dev/ttyUSB0` or `/dev/ttyACM0`** → add your user to
  the `dialout` group (step 2), then log out and back in.
- **The board is not detected** → try another USB cable (it must carry data,
  not only power), or another USB port.
- **STM32 not detected** → check the ST-Link wiring and permissions.
- **`doctor` reports CubeIDE missing** → run `npx embedito95-cli doctor` again and
  enter the CubeIDE folder when asked.

Next: see the [supported boards](../boards.md) or go back to the
[first program](../../README.md#a-first-program).
