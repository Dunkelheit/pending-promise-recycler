# CLAUDE.md

This file provides guidance for Claude AI agents working on this repository.

## Project overview

`pending-promise-recycler` is a zero-dependency TypeScript library that deduplicates
in-flight promises. When multiple callers invoke the same async function with the same
arguments concurrently, only one underlying call is made — the rest receive the same
promise. It ships as a dual ESM/CJS package targeting Node.js ≥ 18.

The entire public surface lives in **`src/index.ts`** (≈ 100 lines). There is a single
test file, **`src/index.test.ts`**, written with Vitest.

## Development commands

```bash
npm ci                  # install dependencies (use ci, never install)
npm run build           # compile ESM + CJS; output goes to dist/
npm run typecheck       # tsc --noEmit (no emit, just type checking)
npm run lint            # ESLint with the flat config in eslint.config.js
npm run lint:fix        # auto-fix lint violations
npm test                # run the full Vitest suite (no watch)
npm run test:coverage   # run tests with V8 coverage; report in coverage/
```

**Always run `npm test` (and ideally `npm run typecheck` and `npm run lint`) before
marking any change as complete.**

## Architecture

```
src/
  index.ts        ← entire library: types, PromiseTimeoutError, recycle()
  index.test.ts   ← full test suite (Vitest)
dist/
  esm/            ← ES module build  (tsc default tsconfig.json)
  cjs/            ← CommonJS build   (tsconfig.cjs.json)
```

`recycle(func, options)` returns a wrapped function that:
1. Derives a registry key from the function name + hashed JSON arguments (default)
   or from a user-supplied `keyBuilder` (string or function).
2. On the first call for a key: invokes `func`, stores the resulting promise in a
   per-instance `Map`, and removes it when the promise settles.
3. On subsequent concurrent calls with the same key: returns the already-stored promise.
4. Optionally arms a `setTimeout` (the `ttl` option) that evicts the entry and rejects
   all callers with `PromiseTimeoutError` if the promise has not settled in time.

Each call to `recycle()` gets its own isolated `Map` — there is no shared global state.

## Code conventions

- **TypeScript strict mode** is enabled (`"strict": true`). All types must be explicit;
  avoid `any`.
- **4-space indentation**, single quotes, semicolons, LF line endings, max line length 120.
  These are enforced by ESLint (`eslint.config.js`).
- Source files use **ESM** (`import`/`export`). The CJS build is produced by a second
  `tsc` invocation using `tsconfig.cjs.json`.
- No runtime dependencies — keep `dependencies` empty in `package.json`.
- Errors thrown by the library are prefixed with `pending-promise-recycler:` for easy
  identification in log output.

## Testing conventions

- Tests live alongside source in `src/index.test.ts`.
- Use **Vitest** (`describe` / `it` / `expect` / `vi`). Do not add Jest or Mocha.
- Use `vi.useFakeTimers()` for any test that involves `setTimeout` / TTL behaviour;
  call `vi.useRealTimers()` in `afterEach` (already done globally).
- Spy on functions with `vi.fn()` to assert call counts.
- Prefer `Promise.all` / `Promise.allSettled` to simulate concurrent callers.
- Every new code path must be covered by at least one test.

## What to avoid

- Do **not** introduce any runtime dependency. This library has zero production deps.
- Do **not** add a global registry. All state must be scoped to a single `recycle()` call.
- Do **not** suppress TypeScript errors with `@ts-ignore` or `as any`.
- Do **not** modify `CHANGELOG.md` manually — it is maintained by the project author.
- Do **not** bump the version in `package.json` unless explicitly instructed to.
