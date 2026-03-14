# AGENTS.md

This file provides guidance for AI coding agents (GitHub Copilot, OpenAI Codex, Cursor,
and similar tools) working on this repository.

> Claude users: also read **CLAUDE.md** for additional Claude-specific conventions.

## Project overview

`pending-promise-recycler` is a zero-dependency TypeScript library that deduplicates
in-flight promises. When multiple callers invoke the same async function with the same
arguments concurrently, only one underlying call is made — the rest receive the same
promise. It ships as a dual ESM/CJS package targeting Node.js ≥ 18.

The entire public surface lives in **`src/index.ts`**. There is one test file,
**`src/index.test.ts`**, written with Vitest.

## Repository layout

```
.github/
  workflows/
    ci.yml              ← lint + typecheck + test (matrix: Node 20/22/24)
    publish.yml         ← publishes to npm on tag push
  ISSUE_TEMPLATE/       ← GitHub issue forms
  CONTRIBUTING.md       ← full contribution guide
  CODEOWNERS            ← code ownership
  PULL_REQUEST_TEMPLATE.md
dependabot.yml          ← weekly npm + GitHub Actions updates
src/
  index.ts              ← library source
  index.test.ts         ← test suite (Vitest)
dist/                   ← build output (git-ignored)
  esm/                  ← ES module build
  cjs/                  ← CommonJS build
eslint.config.js        ← ESLint flat config (v9+)
tsconfig.json           ← ESM build config
tsconfig.cjs.json       ← CJS build config
vitest.config.ts        ← Vitest + coverage config
CHANGELOG.md            ← human-maintained release notes
```

## Essential commands

```bash
npm ci                  # install dependencies (always use ci, not install)
npm run build           # compile to dist/ (ESM + CJS)
npm run typecheck       # type-check without emitting files
npm run lint            # lint src/
npm run lint:fix        # auto-fix lint violations
npm test                # run test suite (Vitest, no watch mode)
npm run test:coverage   # tests + V8 coverage report
```

**Always run `npm test`, `npm run typecheck`, and `npm run lint` before finishing a task.**
The CI pipeline (`ci.yml`) will block merges if any of these fail.

## Code conventions

| Concern | Rule |
|---|---|
| Indentation | 4 spaces (no tabs) |
| Quotes | Single quotes |
| Semicolons | Required |
| Line endings | LF (Unix) |
| Max line length | 120 characters |
| TypeScript | Strict mode; no `any`, no `@ts-ignore` |
| Imports | ESM `import`/`export`; no CommonJS `require` in source |
| Runtime deps | **Zero** — keep `dependencies` empty in `package.json` |
| Error messages | Prefix with `pending-promise-recycler:` |

## Testing conventions

- Use **Vitest**. Do not introduce Jest or Mocha.
- Use `vi.useFakeTimers()` for TTL / `setTimeout`-related tests.
- Every new code path must have at least one covering test.
- Use `vi.fn()` to spy on functions and assert call counts.

## Constraints

- The library must have **no runtime dependencies**.
- All mutable state must be **per-instance** (scoped inside `recycle()`). No global
  registries or module-level mutable state.
- Do **not** modify `CHANGELOG.md` or bump `package.json` version unless explicitly asked.
- The `dist/` directory is git-ignored; never commit build artefacts.
