# embedito95-cli

## 1.1.0

### Minor Changes

- 8bf49e6: Add the `macos-arm64` host target with a POSIX strategy: native `f64`/`i128`, `console` over stdout, host `time`/`async`, `compile` with `clang++` and `run` with clean signal handling. Untyped `let` now widens to the platform word size (`i16`/`i32`/`i64`).
- d2c0110: Add the refcount cycle collector and its `enableCycleCollector` switch in `config.json`, and forward the resolved `E95_CYCLES` value to every compiled translation unit so project, core, library, module and async code always agrees.
- 02c764c: Declare every `math` helper per numeric width. Floating-point helpers get an `f32` and an `f64` overload: an `f64` argument keeps double precision instead of narrowing silently, the result follows the selected overload (so `const r = square(value)` infers `f64`), integer arguments pick `f32` when they fit in 2^24 and `f64` otherwise, and narrowing emits a visible cast plus a non-blocking warning. The generated `e95_config.h` now carries `E95_FLOAT64_SOFTWARE`, so shared C++ picks the native or software `f64` implementation from the platform mode. `interpolateRange`, `clamp`, `absolute`, `minimum` and `maximum` also get an `i32`, a `u32` and an `i64` overload: the integer overload now follows the same promotion as the binary operators, so all-unsigned arguments stay on the cheap `u32` path, `u8` + signed resolves to `i16`, `u16` + signed to `i32` and `u32` + signed (for example `clamp(u32, i32, i32)`) to `i64`, keeping the unsigned magnitude instead of wrapping it negative. `u32` overloads do their ratio in 64-bit intermediates. `u64` stays without an overload, falls back to `i64` with an explicit cast plus a non-blocking warning, and the bit helpers keep their fixed `u32`/`u8` signatures. Core library sources can now write one declaration per width family (`f32 | f64`, `i32 | i64 | u32`), which the compiler expands to the same concrete overloads before type checking; user code still rejects width unions.

### Patch Changes

- 3c8106c: Publish under `AGPL-3.0-only WITH LicenseRef-Embedito95-Runtime-Exception-1.0` and ship `LICENSE` plus `LICENSE-EXCEPTION.md` in every package tarball, so scanners and SBOMs see the runtime exception instead of plain AGPL.
- Updated dependencies [8bf49e6]
- Updated dependencies [3c8106c]
- Updated dependencies [12c0f6f]
- Updated dependencies [d2c0110]
- Updated dependencies [02c764c]
  - embedito95-core@0.3.0
  - embedito95-registry@0.3.0

## 1.0.3

### Patch Changes

- ee0d2e1: Add `AsyncTask<T>` as the only parameterized type in the language and reflect its payload in hover. The CLI bundles `embedito95-core` and `embedito95-registry`, so the new parser/checker behavior ships with it; the LSP and VS Code extension are versioned and synchronized with the CLI.
- 50cb5ae: Declare callbacks with function types such as `() => void` and `(value: i16) => void`, lowering them to C function pointers with exact signature assignability. The CLI bundles `embedito95-core` and `embedito95-registry`, so the parser/checker/codegen behavior ships with it; hover now shows callback parameter types. The LSP and VS Code extension are versioned and synchronized with the CLI.
- d9f15d0: Delegate automatically to the project's pinned `embedito95Version` when it differs from the running CLI, with `--force` and `EMBEDITO95_SKIP_VERSION_CHECK=1` escape hatches, and inherit the parent project's version in `init --library`.
- Updated dependencies [ee0d2e1]
- Updated dependencies [50cb5ae]
  - embedito95-core@0.2.1
  - embedito95-registry@0.2.1

## 1.0.2

### Patch Changes

- 9d1ee2e: Resolve workspace protocols in bundled manifests so upgrading the CLI no longer fails with `EUNSUPPORTEDPROTOCOL`.

## 1.0.1

### Patch Changes

- bf982a1: Bundle the VS Code extension in the CLI package and tie its version to the CLI.

## 1.0.0

### Major Changes

- 32d6751: Breaking: project configs list library package names instead of versioned maps, and built-in libraries no longer carry their own version.

### Patch Changes

- 5b32d79: Bundle embedito95-core and embedito95-registry inside the CLI package so `npx embedito95-cli` installs a single tarball.
- Updated dependencies [32d6751]
  - embedito95-core@0.2.0
  - embedito95-registry@0.2.0
