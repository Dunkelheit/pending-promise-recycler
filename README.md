# pending-promise-recycler

[![CI](https://github.com/Dunkelheit/pending-promise-recycler/actions/workflows/ci.yml/badge.svg)](https://github.com/Dunkelheit/pending-promise-recycler/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/pending-promise-recycler.svg)](https://www.npmjs.com/package/pending-promise-recycler)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Reuse in-flight promises across concurrent callers. When multiple callers invoke the same function with the same arguments while a previous call is still pending, the underlying function runs only once — every caller shares the same promise.

---

## The Problem

Consider a Node.js service that fetches a user record from an upstream API:

```typescript
async function fetchUser(id: string): Promise<User> {
    const response = await fetch(`https://api.example.com/users/${id}`);
    return response.json();
}
```

Under a sudden traffic burst — before any downstream cache has been populated — your service may receive hundreds of concurrent requests for the same resource within the same few hundred milliseconds. Each triggers a separate upstream call:

```
→ fetchUser('u42')   ─── dispatched ──────────────────→
→ fetchUser('u42')   ─── dispatched again ────────────→
→ fetchUser('u42')   ─── dispatched yet again ────────→
```

Result caching alone does not help here: by the time the first response arrives and can be stored, the other calls have already been dispatched.

`pending-promise-recycler` solves this by returning the same in-flight promise to every concurrent caller that shares the same key:

```
→ fetchUser('u42')   ─── dispatched ──────────────── resolves ─→
→ fetchUser('u42')   ─── recycled (same promise) ────────────→
→ fetchUser('u42')   ─── recycled (same promise) ────────────→
```

> **This is not a result cache.** Once a promise settles — whether it resolves or rejects — its registry entry is removed and the next call starts fresh.

---

## Installation

```sh
npm install pending-promise-recycler
```

Requires **Node.js ≥ 18**. Ships as a dual ESM / CommonJS package with bundled TypeScript declarations.

---

## Quick Start

```typescript
import recycle from 'pending-promise-recycler';

async function fetchUser(id: string): Promise<User> {
    const response = await fetch(`https://api.example.com/users/${id}`);
    return response.json();
}

const recyclableFetchUser = recycle(fetchUser);

// 50 concurrent requests for the same user — fetchUser is called exactly once
const users = await Promise.all(
    Array.from({ length: 50 }, () => recyclableFetchUser('u42'))
);
```

---

## API

### `recycle(fn, options?)`

Wraps `fn` and returns a new function with an identical signature, plus a `pendingCount` property.

```typescript
import recycle from 'pending-promise-recycler';

const wrapped = recycle(myAsyncFunction, {
    keyBuilder: ..., // optional — see below
    ttl: ...,        // optional — see below
    maxSize: ...,    // optional — see below
});
```

Each call to `recycle()` creates a completely independent internal registry. Two wrapped functions that happen to produce the same key will never share a promise with each other.

---

### `options.keyBuilder`

Determines how each call is identified in the registry. Two calls that produce the **same key** while the first is still pending will share the same promise.

**Default behaviour** — keys are derived from `SHA-256(funcName + JSON.stringify(args))`. This works for any arguments that are unambiguously JSON-serialisable (see [Argument Serialisation](#argument-serialisation)).

**Fixed string** — every call to the wrapped function uses the same key, regardless of arguments. Useful when the function takes no arguments or when all concurrent callers should share the same in-flight promise regardless of arguments:

```typescript
const fetchConfig = recycle(loadRemoteConfig, {
    keyBuilder: 'remote-config',
});
```

**Builder function** — derive the key dynamically from the call arguments. The function receives the original `fn` as its first argument, followed by all arguments passed to the wrapped call:

```typescript
const fetchUser = recycle(getUser, {
    keyBuilder: (_fn, id: string, opts: { locale: string }) =>
        `user:${id}:${opts.locale}`,
});
```

---

### `options.ttl`

Number of milliseconds after which a still-pending entry is evicted from the registry and **all waiting callers are rejected** with a `PromiseTimeoutError`. Acts as a safety net against promises that never settle (e.g. a hung network request or a stalled database query).

If the promise settles before the TTL elapses, the timer is cancelled and callers receive the result normally — `PromiseTimeoutError` is never thrown.

```typescript
import recycle, { PromiseTimeoutError } from 'pending-promise-recycler';

const fetchUser = recycle(getUser, { ttl: 5_000 }); // reject after 5 s

try {
    const user = await fetchUser('u42');
} catch (err) {
    if (err instanceof PromiseTimeoutError) {
        // The call was still in-flight after 5 seconds
    }
}
```

Must be a non-negative finite number; a `RangeError` is thrown at wrap time otherwise.

---

### `options.maxSize`

Maximum number of concurrent in-flight entries the registry may hold. When adding a new entry would exceed this limit, the **oldest** entry is evicted first (FIFO).

Eviction only removes the entry from the registry — the underlying promise keeps running and the original caller still receives its result. New callers arriving after eviction with the same key start a fresh underlying call.

Without `maxSize`, a function called with many distinct argument combinations can accumulate an unbounded number of registry entries — a potential memory and denial-of-service risk in high-throughput services.

```typescript
const fetchUser = recycle(getUser, { maxSize: 200 });
```

`maxSize` and `ttl` may be combined:

```typescript
const fetchUser = recycle(getUser, { maxSize: 200, ttl: 5_000 });
```

Must be a positive integer; a `RangeError` is thrown at wrap time otherwise.

---

### `wrapped.pendingCount`

Read-only property that reflects the number of distinct keys currently held in the registry — that is, the number of distinct in-flight promises at any given moment. Concurrent calls that share the same key count as **one** entry.

```typescript
const fetchUser = recycle(getUser);

console.log(fetchUser.pendingCount); // 0

const p1 = fetchUser('u1');
const p2 = fetchUser('u1'); // recycled — same key, same promise
const p3 = fetchUser('u2'); // different key, new promise

console.log(fetchUser.pendingCount); // 2

await Promise.all([p1, p2, p3]);

console.log(fetchUser.pendingCount); // 0
```

The counter decrements when a promise settles, regardless of whether it resolved or rejected.

---

### `PromiseTimeoutError`

Thrown to every caller of an in-flight entry when its `ttl` elapses before the underlying promise settles. Extends the built-in `Error` class and is a named export.

```typescript
import { PromiseTimeoutError } from 'pending-promise-recycler';

err instanceof PromiseTimeoutError; // true
err.name;                           // 'PromiseTimeoutError'
err.message;                        // 'pending-promise-recycler: promise timed out after 5000ms'
```

---

## Argument Serialisation

The default key builder serialises arguments with `JSON.stringify`. Some JavaScript values are silently misrepresented by JSON, producing key collisions between distinct calls. The library detects these and throws a descriptive error at call time rather than silently generating a wrong key:

| Value | Problem |
|---|---|
| `function`, `symbol`, `undefined` | Omitted by `JSON.stringify`, or replaced by `null` inside arrays |
| `NaN`, `Infinity`, `-Infinity` | All serialise to the JSON literal `null` |
| `-0` | Serialises as `"0"`, indistinguishable from `0` |
| Circular references | `JSON.stringify` throws |

Objects with a custom `toJSON()` method are serialised using its return value, which may cause two structurally different arguments to hash to the same key. Whenever your arguments fall into any of the above categories — or whenever you need precise control over identity — provide a custom `keyBuilder`.

---

## CommonJS

```js
const { default: recycle, PromiseTimeoutError } = require('pending-promise-recycler');
```

---

## TypeScript Types

All types are exported from the package entry point.

```typescript
// Any function that returns a Promise — the accepted type for the first argument of recycle()
type RecyclableFunction<TArgs extends unknown[], TResult> =
    (...args: TArgs) => Promise<TResult>;

// Signature for a custom key builder function
type KeyBuilderFunction =
    (func: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) => string;

// Options accepted by recycle()
interface RecycleOptions {
    keyBuilder?: KeyBuilderFunction | string;
    ttl?: number;
    maxSize?: number;
}

// The wrapped function returned by recycle()
type RecyclableWrappedFunction<TArgs extends unknown[], TResult> =
    RecyclableFunction<TArgs, TResult> & { readonly pendingCount: number };

// Thrown to all in-flight callers when a ttl elapses before the promise settles
class PromiseTimeoutError extends Error {}
```

---

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions, coding standards, and the pull request process.

## License

[MIT](./LICENSE)
