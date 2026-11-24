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
pnpm run test:leak     # Codegen leak scenarios (hermetic)
pnpm run test:bench    # Opt-in async scheduler bench (not in test:full)
pnpm run test:full     # Everything, including the compile suites
pnpm run test:snapshot # Regenerate snapshots
```

`test:full` runs `lint`, `test`, `test:run`, `test:leak`, `test:compile:checks`,
`test:runtime` and `test:compile` in that order. It needs both the AVR
(`arduino-cli`) and ARM toolchains and takes several minutes; use it before
opening a pull request, and the narrower scripts while iterating.

The workspace uses the `hoisted` node linker (`pnpm-workspace.yaml`). The CLI
package needs it to bundle `embedito95-core` and `embedito95-registry` inside
its published tarball, so keep that setting when changing the install setup.

`test:run` and `test:leak` are hermetic: each suite provisions its test project
in a temporary directory from the tracked registry sources
(`packages/registry/src/core` and `packages/registry/src/libraries`), so they do
not read `packages/test/testers/` (gitignored) and need no manual `init`. They
still need a host C++ compiler, selected through `E95_CXX` or `clang++` by
default.

## Async scheduler bench (opt-in)

`pnpm run test:bench` measures the generated async event loop. It is **opt-in**:
it is not part of `test`, `test:run`, `test:leak` or `test:full`, and it never
regenerates or touches the snapshots. The instrumentation is injected only into
the bench's temporary copy of the generated `.cpp`/`.ino` sources; the
production codegen and the committed snapshots never see it.

The `fade-blink` scenario runs a ~16 ms fade step, a ~500 ms blink half period
and extra periodic coroutines on the host. Two of them await real child tasks
on every iteration, one returning a scalar (`u8`) payload and one a nominal
object payload, so the bench actually exercises child spawning, slot churn,
payload release and queue growth/drain (the scheduler work task 43 changes). The
host clock is simulated: one event-loop pass is one simulated millisecond, so
the wake latency is a deterministic pass count instead of wall-clock noise.

```sh
pnpm run test:bench --json baseline.json          # host run, labelled baseline
pnpm run test:bench --label optimized --json optimized.json
pnpm run test:bench --compare baseline.json optimized.json
pnpm run test:bench --avr --json avr-baseline.json
```

Flags:

- `--label <name>`: label stored with the results (default `baseline`).
- `--passes <n>`: complete event-loop passes per repetition (default `20000`;
  the run executes exactly `n` passes, no off-by-one; the maximum is `200000`,
  the driver's sample buffer size — a larger value is rejected with a clear
  error instead of silently truncating the summary).
- `--json <path>`: write the result as JSON, later consumable by `--compare`.
- `--compare <a.json> <b.json>`: print the metric diff (absolute and percent).
  It refuses to compare results with a different mode, scenario, pass count,
  warm-up/repetition settings or compiler flags, so a diff can never compare
  unlike runs.
- `--avr`: compile the same scenario with `arduino-cli` for
  `arduino:avr:nano` and report flash/RAM. It only compiles; it does not execute
  on hardware, because no board is attached.

Host precision:

- Durations are measured internally in **nanoseconds** with a high-resolution
  clock and converted to microseconds only for the report. On Darwin the driver
  uses `clock_gettime_nsec_np(CLOCK_UPTIME_RAW)` because `CLOCK_MONOTONIC`
  resolves to ~1 µs there and makes short passes round to `0 ns`; other systems
  fall back to `clock_gettime(CLOCK_MONOTONIC)`. The result JSON records the
  clock source and its resolution (`clock.source`,
  `clock.resolutionNanoseconds`).
- A degenerate sample set (`median == 0 ns` with `p95 > 0`) means the clock is
  coarser than the measured pass. The result is still written but marked
  `conclusive: false` with a `conclusiveReason`, and the report prints a
  warning, so a `0 ns` median can never be mistaken for a real measurement.
- Each repetition discards a warm-up window (2000 passes, capped at a quarter of
  the run) and the binary is executed 5 times; median and p95 are computed over
  every measured pass sample, not a fixed small set.
- The host build uses `-std=c++17 -O2`. `-O2` (not `-Os`) is deliberate: the
  bench measures host CPU cost, and `-Os` trades speed for size, which is an AVR
  concern and would distort the timing. AVR flags are unchanged.

Host metrics:

- **pass time**: real time per event-loop pass (median, p95, mean/min/max) in
  ns/µs, plus the total wall time.
- **visits / dispatches**: queue slots inspected and handlers dispatched per
  pass.
- **compactions**: number of periodic compactions and the slots they visited.
- **allocations**: total `malloc`/`free` calls (counted by interposing on
  `malloc`/`free`/`realloc`, same pattern as `test:leak`) and the net live
  blocks. A successful `realloc` with a non-null pointer is counted as a free of
  the old block plus an alloc of the new one (so `alloc - free == live`); a
  failed `realloc` leaves the original block live and is not counted as freed.
  Alloc/free and live are aggregated over the same scope: alloc/free are summed
  and live is the sum of every repetition's final net-live delta, so the
  invariant holds across repetitions and is reported as `allocations.balance`.
- **wake latency**: passes late relative to the `sleep` deadline (`0` means the
  task was resumed in the exact simulated millisecond it was due), reported as
  count/mean/median/p95/max plus a latency histogram.

`--avr` also needs `arduino-cli` with the AVR core installed. To measure the
scheduler on real hardware, compile with `--avr` and flash the generated sketch
manually (for example with `arduino-cli upload` on an attached `arduino:avr:nano`
board); the bench itself never opens a GUI.

The baseline numbers are recorded per ticket. Until a second scheduler variant
exists, `--compare` only has the `baseline` result to diff against, but the
comparator is ready for the optimized run.

## Executable scenario details

`test:run` compares every scenario against its `.events` sidecar. To capture the
events of one scenario while debugging, use the explicit single-scenario mode:

```sh
node packages/test/codegen-run/run.js --record async-reuse
```

The old `E95_RECORD_EVENTS=1` environment switch is rejected on purpose: it
turned every scenario into "print and exit 0", which let the suite pass without
comparing. A `.alloc` sidecar no longer pins an exact live-block count; the host
driver drains the queue, samples the net allocation delta, waits a quiet window
and requires it not to grow (an optional `max <n>` line adds an upper bound).
Allocation scenarios compile without ASan/UBSan because the `malloc`/`free`
interposer collides with the sanitizer interceptors; the other scenarios keep
both sanitizers. `async-string-reuse` covers slot reuse with a String-bearing
payload and a self-cyclic node whose `label` is a `string` leaf, so the cycle
trace/refcount path (`_e95Trace_`/`TypeInfoOf`) is exercised and the `.alloc`
delta must stay stable after the queue drains. Closing a cycle through the async
payload handle itself (or creating one inside a coroutine) still crashes the
host runtime; that path needs its own scheduler/payload fix and is documented as
a limitation in the scenario.

## VS Code extension

To use the tools from the editor, install the VS Code extension:

```sh
pnpm run lsp:install
```

The extension version is tied to the CLI version. `pnpm changeset version`
syncs `packages/lsp` and `packages/lsp-vscode`, and the CLI `prepack` builds
the VSIX from the same commit and embeds it in the published tarball.

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
