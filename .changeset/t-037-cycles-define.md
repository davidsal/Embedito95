---
"embedito95-core": minor
"embedito95-registry": minor
"embedito95-cli": minor
---

Add the refcount cycle collector and its `enableCycleCollector` switch in `config.json`, and forward the resolved `E95_CYCLES` value to every compiled translation unit so project, core, library, module and async code always agrees.
