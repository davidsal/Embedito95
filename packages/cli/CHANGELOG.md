# embedito95-cli

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
