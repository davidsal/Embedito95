---
"embedito95-core": patch
"embedito95-registry": patch
"embedito95-cli": patch
---

Declare callbacks with function types such as `() => void` and `(value: i16) => void`, lowering them to C function pointers with exact signature assignability. The CLI bundles `embedito95-core` and `embedito95-registry`, so the parser/checker/codegen behavior ships with it; hover now shows callback parameter types. The LSP and VS Code extension are versioned and synchronized with the CLI.
