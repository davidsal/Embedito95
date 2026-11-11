# embedito95-cli

## 1.0.3

### Patch Changes

- ee0d2e1: Add `AsyncTask<T>` as the only parameterized type in the language and reflect its payload in hover. The CLI bundles `embedito95-core` and `embedito95-registry`, so the new parser/checker behavior ships with it; the LSP and VS Code extension are versioned and synchronized with the CLI.
- 50cb5ae: Declare callbacks with function types such as `() => void` and `(value: i16) => void`, lowering them to C function pointers with exact signature assignability. The CLI bundles `embedito95-core` and `embedito95-registry`, so the parser/checker/codegen behavior ships with it; hover now shows callback parameter types. The LSP and VS Code extension are versioned and synchronized with the CLI.
- d9f15d0: Delegate automatically to the project's pinned `embedito95Version` when it differs from the running CLI, with `--force` and `EMBEDITO95_SKIP_VERSION_CHECK=1` escape hatches, and inherit the parent project's version in `init --library`.
- Updated dependencies [ee0d2e1]
- Updated dependencies [50cb5ae]
  - embedito95-core@0.2.1
  - embedito95-registry@0.2.1

## 1.0.2

### Patch Changes

- 9d1ee2e: Resolve workspace protocols in bundled manifests so upgrading the CLI no longer fails with `EUNSUPPORTEDPROTOCOL`.

## 1.0.1

### Patch Changes

- bf982a1: Bundle the VS Code extension in the CLI package and tie its version to the CLI.

## 1.0.0

### Major Changes

- 32d6751: Breaking: project configs list library package names instead of versioned maps, and built-in libraries no longer carry their own version.

### Patch Changes

- 5b32d79: Bundle embedito95-core and embedito95-registry inside the CLI package so `npx embedito95-cli` installs a single tarball.
- Updated dependencies [32d6751]
  - embedito95-core@0.2.0
  - embedito95-registry@0.2.0
