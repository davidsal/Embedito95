# Development

This guide explains how to run Embedito95 locally. The repository is a pnpm
monorepo with the compiler, the CLI, the language server and the platform
registry.

## Requirements

- Node.js 22 or newer (LTS recommended) and pnpm 11 (`packageManager` is pinned
  in `package.json`). Node.js 20 is end-of-life and no longer supported.
- **AVR**: `arduino-cli` installed and the AVR core available.
- **STM32**: STM32CubeIDE (which bundles the ARM toolchain and the
  STM32CubeProgrammer CLI). The STM32CubeF1 firmware is downloaded
  automatically by `init` and `compile`, or on demand by `doctor`.

## Install and test

```sh
pnpm install
pnpm run lint          # Biome
pnpm run test          # Language, codegen and snapshot suites
pnpm run test:runtime  # Host runtime tests and ARM syntax checks
pnpm run test:run      # Executable codegen scenarios
pnpm run test:snapshot # Regenerate snapshots
```

## VS Code extension

To use the tools from the editor, install the VS Code extension:

```sh
pnpm run lsp:install
```

## Try the CLI

Create a scratch directory inside `packages/test` and run the initializer from
there:

```sh
mkdir -p packages/test/my-project
cd packages/test/my-project
pnpm run embedito95-cli init
```

`init` asks for the target board and creates the project with a `config.json`,
a `.gitignore` and a `main.e95` entry point.
