---
"embedito95-core": patch
"embedito95-registry": patch
"embedito95-cli": patch
---

Add `AsyncTask<T>` as the only parameterized type in the language and reflect its payload in hover. The CLI bundles `embedito95-core` and `embedito95-registry`, so the new parser/checker behavior ships with it; the LSP and VS Code extension are versioned and synchronized with the CLI.
