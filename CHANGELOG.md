# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
