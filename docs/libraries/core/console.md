# Console

Package: `@embedito95/console`

Writes text and primitive values to the standard output of host targets. The
library declares that it requires the `console: "stdout"` platform capability:
`init` and `install` install it only on platforms that expose it, so board
projects do not include it under `core/` nor in `config.core`. Importing it from
a board project is reported as an unknown library.

```e95
import { console } from '@embedito95/console'

console.log("Hello World!")
```

`console.log` takes one value and writes it followed by a line terminator. It
accepts `string`, `char`, `boolean`, every numeric width from `u8` to `i64`,
`f32`, `f64`, and `string | null`. A `null` value is written as the text
`null`.

There is no formatting support and no multi-argument overload: compose the
text first when a line needs several values.
