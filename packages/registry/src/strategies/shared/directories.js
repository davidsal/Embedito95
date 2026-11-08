// Self-contained copy of the project/registry directory layout (TICKET-35).
// `registry` declares no dependencies and `core` already imports `registry`
// (`core/src/project/install.js`), so importing `embedito95-core` here would be
// a phantom dependency and a `core` ↔ `registry` cycle. The `packages/test`
// guard `registry-core-parity` keeps these values in lock-step with the
// canonical `core/src/constants.js`.
export const LIBRARIES_DIRECTORY_NAME = "libraries";
export const CORE_LIBRARIES_DIRECTORY_NAME = "core";
export const MODULES_DIRECTORY_NAME = "modules";
