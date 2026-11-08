# embedito95-cli

Command-line toolchain for **Embedito95** (language `e95`), a TypeScript-like
language for microcontrollers that compiles to C++.

```sh
npx embedito95-cli doctor    # check your toolchain
npx embedito95-cli init      # create a project
npx embedito95-cli flash     # build + compile + upload
```

Other commands: `install`, `build`, `compile`, `upload`, `monitor`.

Requires **Node.js 22 or newer**. Flashing an Arduino needs `arduino-cli`; the
STM32 Blue Pill needs STM32CubeIDE and an ST-Link V2 probe.

- Documentation and full install guides: https://github.com/davidsal/Embedito95
- License: AGPL-3.0-only
