# e95

The Embedito95 language is **e95**. It is TypeScript-like, compiles to C++ and
keeps a small syntax and type system on purpose. Source files use the `.e95`
extension, and every project starts at `main.e95`, which declares and calls
`main`. Libraries are also written in e95 and export the values and functions
that other modules import.

This page is the short entry point: design, what e95 does not share with
TypeScript, keywords, and where each topic lives.

## Design

- **No classes or interfaces.** `type` declarations and closures build objects.
- **Only `T | null` unions, no `===`.** Only `==` and `!=`; mixing a float with
  an integer is an error.
- **Inference instead of annotations.** Variables infer their type, constants
  take the smallest fitting type and the language server shows both on hover;
  only parameters need explicit types.
- **Safe arithmetic.** Operands are promoted to at least the architecture word,
  mixed signs widen to signed, and `-fwrapv` keeps overflow defined, catching the
  classic Arduino overflow bugs.
- **`async` / `await` protothreads.** `sleep(ms)` yields the CPU for that time;
  `sleep()` yields one event-loop pass.
- **Memory tuned for small devices.** Arrays, strings and objects are
  heap-backed, reference-counted handles, including fixed-size `T[N]` arrays.
  See [Engine](engine.md) for the runtime details.
- **Reference counting.** A direct self-reference is rejected at compile time;
  longer cycles are not detected and leak.
- **Portable by design.** Libraries are written in e95 and compiled per platform,
  so the same code can target different boards.

## Coming from TypeScript

e95 looks like TypeScript but is not TypeScript. This table lists what exists and
what does not. When something is missing, use the e95 form.

| TypeScript | e95 |
| --- | --- |
| `interface` | Use `type Name = { ... }`. |
| `class`, `extends`, `new` | Use a `type` with functions, or plain functions. |
| `any`, `unknown`, `never` | Every value has a concrete type. |
| `string \| number`, other unions | Only `T \| null`. |
| `===`, `!==` | `==`, `!=`. |
| `?.` optional chaining | Check for `null` first. |
| `...` spread | Not available. |
| Destructuring | Access fields one by one. |
| `++`, `--` | `+= 1`, `-= 1`. |
| Bitwise and shifts (`&`, `\|`, `^`, `~`, `<<`, `>>`, `>>>`) | Not available; `\|` only builds `T \| null`. |
| `for...of`, `for...in` | Classic `for (let index = 0; ...)`. |
| `continue` | Restructure the loop with `if`. |
| `var` | `const` or `let`. |
| `function` keyword | Arrow functions assigned to `const`. |
| `try`, `catch`, `throw` | Not available. |
| `undefined` | `null`. |
| Default or namespace imports | Named imports only. |
| User-defined generics | None. `AsyncTask<T>` is the only parameterized type in the language; `@embedito95/async` declares it. |

## Keywords

`import`, `from`, `export`, `const`, `let`, `type`, `enum`, `if`, `else`,
`switch`, `case`, `default`, `break`, `while`, `do`, `for`, `return`, `async`,
`await`, `this`, `true`, `false`, `null`.

`function` is reserved by the lexer but rejected by the parser: use an arrow
function assigned to `const`.

## Imports

Imports are named and always come from a package or a relative module:

```e95
import { Pin, setDigital, HIGH } from '@embedito95/gpio'
import { delay as delayMillis, getMillis as millis } from '@embedito95/time'
```

- Only named imports (`{ ... }`); there are no default or namespace imports.
- `as` renames a binding for the current file.
- A module declares its public API with `export`.

## Topics

Read the file for what you are writing. Each one is self-contained.

| Topic | File |
| --- | --- |
| `const`, `let`, functions, objects, enums, closures | [Declarations](language/declarations.md) |
| Type table, `null`, floating point, value behavior | [Types](language/types.md) |
| Expressions and arithmetic promotions | [Expressions](language/expressions.md) |
| `if`, `switch`, loops, callbacks | [Control flow](language/control-flow.md) |
| `async` and `await` | [Async](language/async.md) |
