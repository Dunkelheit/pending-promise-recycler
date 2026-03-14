# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.4] - 2026-03-14
### Changed
- Refactored `src/index.ts` for readability and elegance: collapsed the
  `isNonSerializable` predicate into a single boolean expression, trimmed its JSDoc,
  removed a redundant inline comment in `defaultKeyBuilder`, replaced the no-op
  `cancelTtl` sentinel with `undefined` and optional chaining (`cancelTtl?.()`),
  renamed `res` → `raw` to distinguish the original promise from the TTL-raced one,
  moved `return` inside the `try` block as `return await tracked`, replaced the manual
  iterator call (`registry.keys().next().value`) with array destructuring, and aligned
  the `identifier` ternary arms on separate lines.
- Refactored `src/index.test.ts` for readability and elegance: moved `testFunctionBuilder`
  option destructuring into the function body, replaced 7 near-identical "non-serializable
  argument" `it()` blocks with a single `it.each()` data table (circular-reference test
  kept standalone), collapsed 3 TTL and 5 `maxSize` `RangeError` `it()` blocks into two
  `it.each()` calls, replaced four `toHaveProperty()` calls with two `toMatchObject()`
  calls against a shared fixture, removed a redundant inline comment, and spread
  concurrent `Promise.all` arguments onto separate lines.

## [0.4.3] - 2026-03-14
### Fixed
- TypeScript error *"Expected 0 arguments, but got 1"* in the `maxSize` eviction test: the
  `neverSettles` spy was typed as `() => Promise<string>` (no parameters), causing the
  wrapped function's `TArgs` to be inferred as `[]`. Changed the spy signature to
  `(..._args: unknown[]) => Promise<string>` so it correctly accepts the key arguments
  forwarded by the custom `keyBuilder`.

### Changed
- Moved `CONTRIBUTING.md` from `.github/CONTRIBUTING.md` to the repository root, making it
  discoverable as a standard top-level community health file.
- Extended the ESLint config with an explicit `@typescript-eslint/no-unused-vars` rule that
  honours the `_`-prefix convention for intentionally unused variables, arguments, and caught
  errors (`varsIgnorePattern`, `argsIgnorePattern`, `caughtErrorsIgnorePattern`).

### Added
- `CODE_OF_CONDUCT.md`: Contributor Covenant 3.0, establishing community standards and
  expectations for all participants.

## [0.4.2] - 2026-03-14
### Added
- `CLAUDE.md`: guidance for Claude AI agents covering architecture, commands, code
  conventions, testing patterns, and explicit constraints.
- `AGENTS.md`: equivalent guidance for all AI coding agents (Copilot, Codex, Cursor, etc.).
- `.github/CONTRIBUTING.md`: comprehensive contribution guide replacing the brief paragraph
  in the README — covers prerequisites, dev workflow, coding standards, test conventions,
  Conventional Commits format, and the PR process.
- `.github/ISSUE_TEMPLATE/bug_report.yml`: structured GitHub Forms bug report template.
- `.github/ISSUE_TEMPLATE/feature_request.yml`: structured GitHub Forms feature request
  template with an enforced zero-dependency checklist.
- `.github/ISSUE_TEMPLATE/config.yml`: disables blank issues and redirects questions to
  GitHub Discussions.
- `.github/PULL_REQUEST_TEMPLATE.md`: PR checklist covering typecheck, lint, tests,
  zero-dep constraint, and changelog hygiene.
- `SECURITY.md`: vulnerability disclosure policy with supported versions table and
  private reporting instructions.
- `.editorconfig`: enforces 4-space indent, LF line endings, UTF-8, and trailing-whitespace
  trimming across all editors and IDEs.
- `.github/CODEOWNERS`: auto-assigns `@Dunkelheit` as reviewer on every pull request.

## [0.4.1] - 2026-03-14
### Changed
- Migrate ESLint configuration from the legacy eslintrc format (`.eslintrc.json`) to the
  modern flat config format (`eslint.config.js`), as required by ESLint v9.
- Upgrade `eslint` from v8 to v9.
- Replace separate `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` packages
  with the unified `typescript-eslint` package.
- Add `@eslint/js` and `globals` packages to support the flat config format.

## [0.4.0] - 2026-03-13
### Added
- Per-instance registry: each call to `recycle()` now maintains its own internal registry,
  eliminating the risk of key collisions between independently wrapped functions.
- `pendingCount` property on the wrapped function, reflecting the number of promises currently
  in flight within that instance's registry.
- `ttl` option: an optional time-to-live (in milliseconds) after which a pending promise is
  evicted from the registry and all in-flight callers are rejected with a `PromiseTimeoutError`.
  If the promise settles before the TTL the timer is cancelled and callers receive the value
  normally. Must be a non-negative finite number; a `RangeError` is thrown at wrap time
  otherwise.
- `PromiseTimeoutError` exported class, allowing callers to distinguish a TTL rejection from
  other errors with `instanceof`.
- Dual ESM/CJS package: the library now ships both an ES module build (`dist/esm/`) and a
  CommonJS build (`dist/cjs/`), making it usable in both modern and legacy Node.js projects.
- Stricter default key builder: in addition to circular references, arguments containing
  functions, symbols, or `undefined` now throw a descriptive error prompting the use of a
  custom `keyBuilder`, preventing silent key collisions from lossy JSON serialisation.

### Changed
- Internal `_registry` export removed. Observability is now provided by the public
  `pendingCount` property on each wrapped function.
- Options (`keyBuilder`, `ttl`) are now captured once at `recycle()` call time. Mutating the
  options object after wrapping no longer has any effect.

## [0.3.0] - 2026-02-14
### Changed
- Migrate project to TypeScript with ESM module system.
- Replace Mocha/Chai test framework with Vitest.
- Update all dependencies.

## [0.2.2] - 2021-01-26
### Changed
- Update module dependencies.

## [0.2.1] - 2020-12-21
### Changed
- Update module dependencies.

## [0.2.0] - 2020-10-22
### Changed
- Use a hash of the function arguments instead of just concatenating everything into a string.

### Added
- Extra tests for scenarios in which promises get rejected.

## [0.1.3] - 2020-10-20
### Changed
- Drop jsdoc documentation.

## [0.1.2] - 2020-10-20
### Security
- Update dependencies.

## [0.1.1] - 2020-10-18
### Added
- Working example involving recyclable requests to an HTTP server.

### Changed
- More legible README.md.
- Extra assertions in unit tests.

## [0.1.0] - 2020-10-16
### Added
- Initial module implementation.
