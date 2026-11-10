---
"embedito95-cli": patch
---

Delegate automatically to the project's pinned `embedito95Version` when it differs from the running CLI, with `--force` and `EMBEDITO95_SKIP_VERSION_CHECK=1` escape hatches, and inherit the parent project's version in `init --library`.
