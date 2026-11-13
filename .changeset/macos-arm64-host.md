---
"embedito95-cli": minor
"embedito95-core": minor
"embedito95-registry": minor
---

Add the `macos-arm64` host target with a POSIX strategy: native `f64`/`i128`, `console` over stdout, host `time`/`async`, `compile` with `clang++` and `run` with clean signal handling. Untyped `let` now widens to the platform word size (`i16`/`i32`/`i64`).
