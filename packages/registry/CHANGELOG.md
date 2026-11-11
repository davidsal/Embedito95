# embedito95-registry

## 0.2.1

### Patch Changes

- ee0d2e1: Add `AsyncTask<T>` as the only parameterized type in the language and reflect its payload in hover. The CLI bundles `embedito95-core` and `embedito95-registry`, so the new parser/checker behavior ships with it; the LSP and VS Code extension are versioned and synchronized with the CLI.
- 50cb5ae: Declare callbacks with function types such as `() => void` and `(value: i16) => void`, lowering them to C function pointers with exact signature assignability. The CLI bundles `embedito95-core` and `embedito95-registry`, so the parser/checker/codegen behavior ships with it; hover now shows callback parameter types. The LSP and VS Code extension are versioned and synchronized with the CLI.

## 0.2.0

### Minor Changes

- 32d6751: Add portable f64 support for targets without a native double, plus exponent literals.
