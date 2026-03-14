# Contributing to pending-promise-recycler

Thank you for taking the time to contribute! 🎉

This document explains how to set up a development environment, coding standards to
follow, and the process for submitting changes.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Coding standards](#coding-standards)
- [Tests](#tests)
- [Commit messages](#commit-messages)
- [Submitting a pull request](#submitting-a-pull-request)
- [Reporting bugs](#reporting-bugs)
- [Requesting features](#requesting-features)

---

## Code of conduct

Please be respectful and constructive in all interactions. This project follows the
[Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating you
agree to abide by its terms.

---

## Getting started

### Prerequisites

- **Node.js ≥ 18** (the CI matrix tests against 20, 22, and 24).
- **npm ≥ 10** (comes bundled with Node.js 18+).
- A modern code editor with TypeScript support (VS Code is recommended; an
  `.editorconfig` file is provided for consistent formatting).

### Fork and clone

```bash
# 1. Fork the repository on GitHub, then:
git clone https://github.com/<your-username>/pending-promise-recycler.git
cd pending-promise-recycler

# 2. Install dependencies
npm ci

# 3. Verify everything works
npm run build && npm test
```

---

## Development workflow

```bash
npm run build           # compile ESM + CJS output to dist/
npm run typecheck       # type-check without emitting files
npm run lint            # lint src/ with ESLint
npm run lint:fix        # auto-fix lint violations
npm test                # run the full Vitest suite (single run, no watch)
npm run test:coverage   # run tests + V8 coverage (output in coverage/)
```

**Husky git hooks** are installed automatically after `npm ci`:

| Hook | Runs |
|---|---|
| `pre-commit` | `npm run lint:fix` |
| `pre-push` | `npm run build && npm test` |

These hooks are the same checks performed by CI, so a passing push means CI should pass too.

---

## Coding standards

- **TypeScript strict mode** is enabled. All types must be explicit. Do not use `any` or
  suppress errors with `@ts-ignore`.
- **4-space indentation**, single quotes, semicolons, LF line endings, max line length
  120 characters. These are enforced by ESLint (`eslint.config.js`).
- The library must remain **zero-dependency** at runtime. Never add entries to the
  `dependencies` field in `package.json`. Development tooling goes in `devDependencies`.
- Error messages thrown by the library should be prefixed with `pending-promise-recycler:`
  to make them easy to identify in logs.
- All mutable state must be scoped inside a single `recycle()` call. There must be no
  module-level or global mutable state.

---

## Tests

- Tests live in `src/index.test.ts` alongside the source.
- Use **Vitest** (`describe` / `it` / `expect` / `vi`). Do not add Jest or Mocha.
- Use `vi.useFakeTimers()` for any test involving `setTimeout` or TTL behaviour.
  Restore real timers in `afterEach` (already done globally in the test file).
- Every new code path must be covered by at least one test case.
- Aim for 100 % branch coverage — `npm run test:coverage` will tell you.
- Do **not** write tests that rely on real timing (e.g., `setTimeout` without fake timers).

---

## Commit messages

Please follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

Common types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`.

Examples:

```
feat: add clearAll() method to flush the entire registry
fix: prevent TTL timer from firing after promise settles
docs: update README to document pendingCount property
chore(deps-dev): bump vitest from 3.x to 4.x
```

- Use the imperative mood in the summary ("add", not "added" or "adds").
- Keep the summary line under 72 characters.
- Reference issues in the footer: `Closes #42`.

---

## Submitting a pull request

1. **Create a branch** from `main` with a descriptive name:
   ```bash
   git checkout -b feat/my-feature
   # or
   git checkout -b fix/issue-42
   ```

2. **Make your changes.** Keep commits focused and atomic.

3. **Run the full quality suite** and fix any issues:
   ```bash
   npm run typecheck && npm run lint && npm test
   ```

4. **Push and open a PR** against `main`. Fill in the pull request template.

5. **Wait for CI** — all checks (lint, typecheck, build, test on Node 20/22/24) must be
   green before a review is requested.

6. Respond to review comments promptly. Once approved, the maintainer will merge.

> **Note:** breaking changes require an updated `CHANGELOG.md` entry and a semver major
> bump — please discuss them in an issue before starting work.

---

## Reporting bugs

Use the [Bug report](.github/ISSUE_TEMPLATE/bug_report.yml) template. Please include:

- A minimal, self-contained reproduction case.
- The Node.js version and OS you are running.
- Observed vs. expected behaviour.

---

## Requesting features

Use the [Feature request](.github/ISSUE_TEMPLATE/feature_request.yml) template. Before
opening a request, check whether an existing issue or discussion already covers your
use case.
