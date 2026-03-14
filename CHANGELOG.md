# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-13
### Added
- Per-instance registry: each call to `recycle()` now maintains its own internal registry,
  eliminating the risk of key collisions between independently wrapped functions.
- `pendingCount` property on the wrapped function, reflecting the number of promises currently
  in flight within that instance's registry.
- `ttl` option: an optional time-to-live (in milliseconds) after which a pending promise is
  evicted from the registry, protecting against hung promises leaking indefinitely.
- Dual ESM/CJS package: the library now ships both an ES module build (`dist/esm/`) and a
  CommonJS build (`dist/cjs/`), making it usable in both modern and legacy Node.js projects.
- Guard in the default key builder: serialization errors (e.g. circular references) now throw
  a descriptive message prompting the use of a custom `keyBuilder`.

### Changed
- Internal `_registry` export removed. Observability is now provided by the public
  `pendingCount` property on each wrapped function.

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
