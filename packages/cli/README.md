# embedito95-cli

Command-line toolchain for **Embedito95** (language `e95`), a TypeScript-like
language for microcontrollers that compiles to C++.

```sh
npx embedito95-cli doctor    # check your toolchain
npx embedito95-cli init      # create a project
npx embedito95-cli run       # build + compile + run (host targets)
npx embedito95-cli flash     # build + compile + upload
```

Other commands: `install`, `build`, `compile`, `upload`, `monitor`.

On host targets, `run` inherits the terminal and exits with the program's code.
Pressing Ctrl+C forwards `SIGINT` to the executable, prints
`✖ Interrupted (SIGINT)` and exits with `130` (`143` for `SIGTERM`, `129` for
`SIGHUP`), leaving no orphan process behind.

Requires **Node.js 22 or newer**. Flashing an Arduino needs `arduino-cli`; the
STM32 Blue Pill needs STM32CubeIDE and an ST-Link V2 probe.

- Documentation and full install guides: https://github.com/davidsal/Embedito95
- License: AGPL-3.0-only
