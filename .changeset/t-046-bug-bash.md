---
"embedito95-core": minor
"embedito95-cli": patch
---

Fix formatter comment placement, LSP completions and checker diagnostics (unknown members, unused locals and parameters, entry-point calls, template literals), and stabilize async codegen for anonymous shapes and awaited object results. Synthesized return types now use the `_` prefix to avoid colliding with user types.
