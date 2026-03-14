# Pending Promise Recycler

> Save precious resources and avoid performing the same operation again and again by recycling pending promises.

[![CI](https://github.com/Dunkelheit/pending-promise-recycler/actions/workflows/ci.yml/badge.svg)](https://github.com/Dunkelheit/pending-promise-recycler/actions/workflows/ci.yml)

`pending-promise-recycler` is a lightweight, production-dependency-free TypeScript module meant to use existing pending
promises as many times as needed, instead of creating new ones.

Originally intended for Node.js backend and middle-layer services that might incur in a high burst of concurrent calls
to 3rd party APIs before the response of the first one can be cached, `pending-promise-recycler` can also be used for
virtually any situation in which components of a JavaScript system need keep track of a pending Promise for an expensive
operation, so that it can be reused instead of created over and over again.

## Introduction

Consider the following (expensive!) operation:

```typescript
const fetchSomethingExpensive = (arg1: string, arg2: string): Promise<{ foo: string }> => {
    return new Promise(resolve => {
        // Assume there is a call to a 3rd party API here -it will take ~300 ms. to respond
        setTimeout(() => {
            resolve({ foo: 'bar' });
        }, 300);
    });
};
```

Assume we have a REST API with an endpoint that executes this `fetchSomethingExpensive` function every time we call it.
Even if we would cache the result of `fetchSomethingExpensive`, there could be such a scenario in which a burst of
thousands of concurrent calls are fired against your API -before we are able to cache the response to the first call.

In this case, we want to make sure the same promise is used to satisfy all the concurrent requests to our REST API.
`pending-promise-recycler` can help us with that:

```typescript
import recycle from 'pending-promise-recycler';

const recyclableFetch = recycle(fetchSomethingExpensive);

// Simulate four concurrent incoming requests
const responses = await Promise.all([
    recyclableFetch('a', 'b'),
    recyclableFetch('a', 'b'),
    recyclableFetch('a', 'b'),
    recyclableFetch('a', 'b'),
]);

console.log(responses);
// [ { foo: 'bar' }, { foo: 'bar' }, { foo: 'bar' }, { foo: 'bar' } ]
```

In this example with four concurrent executions of `recyclableFetch()`, our very expensive `fetchSomethingExpensive`
function gets only executed and resolved once.

## Usage

Install `pending-promise-recycler` using `npm`:

```
> npm install pending-promise-recycler
```

Import the module and wrap any promise-returning function with it:

```typescript
import recycle from 'pending-promise-recycler';

const recyclableFetch = recycle(fetchSomethingExpensive);
```

All three options are optional. Pass any combination of them to customise the behaviour:

```typescript
// keyBuilder — function or fixed string used to derive the cache key for each call.
//              Defaults to a SHA-256 hash of the function name and serialised arguments.
// ttl        — milliseconds before an in-flight entry is evicted and all waiting callers
//              are rejected with a PromiseTimeoutError. Omit to wait indefinitely.
// maxSize    — maximum number of concurrent in-flight entries. When the limit is reached,
//              the oldest entry is evicted first (FIFO). Omit for an unbounded registry.
const recyclableFetch = recycle(fetchSomethingExpensive, {
    keyBuilder: (_, arg1, arg2) => `${arg1}:${arg2}`,
    ttl: 5000,
    maxSize: 100,
});
```

The module ships both an ES module build and a CommonJS build, so it works in ESM and CJS projects alike:

```typescript
// ESM
import recycle from 'pending-promise-recycler';

// CommonJS
const { default: recycle } = require('pending-promise-recycler');
```

### Identifying recyclable promises

The internal registry where recyclable promises are stored needs to identify them somehow. By default functions will
be uniquely identified by their function name and hashed arguments. The default key builder requires all arguments
to be unambiguously JSON-serializable. The following values throw a descriptive error at call time because
`JSON.stringify` would either omit them or silently coerce them to a form that collides with another value:

| Value | Problem |
|---|---|
| `function`, `symbol`, `undefined` | Omitted or replaced by `null` inside arrays |
| `NaN`, `Infinity`, `-Infinity` | All become the JSON literal `null` |
| `-0` | Serialised as `"0"`, indistinguishable from `0` |
| Circular references | `JSON.stringify` throws |

Objects whose `toJSON()` method returns a different shape than the object itself are serialised using the `toJSON()`
return value, which can cause two structurally different arguments to hash to the same key. In that situation — and
whenever finer control over identity is needed — it is **strongly recommended to use a custom key builder**. This
can be done as follows:

```typescript
// Identify the recyclable function with a fixed string
const recyclableFetch = recycle(fetchSomethingExpensive, {
    keyBuilder: 'fixed-key-name'
});

// Use a dynamic key builder to identify the function based on its arguments
const moreFineTunedRecyclableFetch = recycle(fetchSomethingExpensive, {
    keyBuilder: (func, ...args) => {
        return `${args[0].method}-${args[0].uri}`; // "GET-http://localhost:8080/something/expensive"
    }
});
```

### Observing in-flight promises

Every wrapped function exposes a `pendingCount` property that reflects the number of promises currently in flight
within its registry:

```typescript
const recyclableFetch = recycle(fetchSomethingExpensive);

console.log(recyclableFetch.pendingCount); // 0

const p1 = recyclableFetch('a', 'b');
const p2 = recyclableFetch('a', 'b'); // recycled — same key, same promise

console.log(recyclableFetch.pendingCount); // 1 (one registry entry, not two)

await Promise.all([p1, p2]);

console.log(recyclableFetch.pendingCount); // 0
```

### Capping the registry size with maxSize

Without any guard, a function called with many distinct argument combinations can accumulate an unbounded number of
in-flight entries in the registry — a potential denial-of-service vector in high-throughput services. Pass a
`maxSize` option to cap the registry at a fixed number of entries:

```typescript
const recyclableFetch = recycle(fetchSomethingExpensive, {
    maxSize: 100  // keep at most 100 concurrent in-flight entries
});
```

When a new key would push the registry over the limit, the oldest (first-inserted) entry is evicted before the new
one is added (FIFO order). Eviction only removes the entry from the registry; the underlying promise keeps running
and the original caller still receives its result. New calls arriving after eviction with the same key will start
a fresh promise.

`maxSize` can be combined with `ttl`:

```typescript
const recyclableFetch = recycle(fetchSomethingExpensive, {
    maxSize: 100,
    ttl: 5000,
});
```

The `maxSize` value must be a positive integer; a `RangeError` is thrown at wrap time otherwise.

### Protecting against hung promises with a TTL

By default, if a promise never settles, its registry entry is never cleaned up. Pass a `ttl` (time-to-live, in
milliseconds) to automatically evict the entry and reject all waiting callers if the promise has not resolved or
rejected within that time:

```typescript
import recycle, { PromiseTimeoutError } from 'pending-promise-recycler';

const recyclableFetch = recycle(fetchSomethingExpensive, {
    ttl: 5000 // reject all callers after 5 seconds if still pending
});

try {
    const result = await recyclableFetch(id);
} catch (err) {
    if (err instanceof PromiseTimeoutError) {
        // The request was still in-flight after 5 seconds
    }
}
```

If the promise settles before the TTL, the timer is cancelled, all callers receive the resolved value normally, and
the TTL never intervenes. The `ttl` value must be a non-negative finite number; a `RangeError` is thrown at wrap
time otherwise.

### Types

The module exports the following types:

```typescript
// A function that returns a Promise
type RecyclableFunction<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

// A function that generates a key for the internal registry
type KeyBuilderFunction = (func: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) => string;

// Options for the recycle function
interface RecycleOptions {
    keyBuilder?: KeyBuilderFunction | string;
    ttl?: number;
    maxSize?: number;
}

// The wrapped function returned by recycle(), with an added pendingCount property
type RecyclableWrappedFunction<TArgs extends unknown[], TResult> = RecyclableFunction<TArgs, TResult> & {
    readonly pendingCount: number;
};

// Error thrown to all in-flight callers when a TTL elapses before the promise settles
class PromiseTimeoutError extends Error {}
```

## Example

See [example.ts](./example.ts) for a working example with a recyclable function that fetches data from an
HTTP server, demonstrating recycling, `pendingCount`, and the `ttl` option.

## API

### recycle(function, options)

The first argument, `function`, is any Promise-returning function that we want to be able to recycle during its
"pending" state.

The second argument, `options`, is optional and can contain the following properties:

* `keyBuilder` &mdash; can either be a **function** or a **string**. The resulting value of this property will be used
to uniquely identify the promise from the first argument, `function`.
    * When the value is a *function*, it will be called with the arguments `(originalFunction, ...args)`, where:
        * `originalFunc` is the original function.
        * `...args` is the array of arguments passed to the original function.

* `ttl` &mdash; an optional number of **milliseconds** after which a pending promise is forcibly evicted from the
registry and all in-flight callers are rejected with a `PromiseTimeoutError`. Useful as a safety net against promises
that never settle (e.g. a hung network request). If the promise settles before the TTL, the timer is cancelled,
callers receive the resolved value normally, and no error is thrown. Must be a non-negative finite number; a
`RangeError` is thrown at wrap time otherwise.

* `maxSize` &mdash; an optional positive integer that caps the number of concurrent in-flight entries the registry
may hold. When a new key would exceed this limit, the oldest (first-inserted) entry is evicted first (FIFO). The
evicted promise is not cancelled; its original caller still receives the result. New callers with the evicted key
will start a fresh promise. Must be a positive integer; a `RangeError` is thrown at wrap time otherwise.

### pendingCount

Every function returned by `recycle()` exposes a read-only `pendingCount` property. It reflects how many distinct
keys are currently tracked in that instance's registry — i.e., how many unique in-flight promises are active at any
given moment. Concurrent calls sharing the same key count as one.

## Testing

The test suite of `pending-promise-recycler` can be executed with the `npm` task `test`:

```
> npm run test
```

There is also a linter task and a build task:

```
> npm run lint
> npm run build
```

## Contributing

GitHub issues are the preferred way to report problems or make requests for new functionality. This is a PR-friendly
project, if you want to contribute feel free to submit your pull requests following the
[GitHub flow](https://guides.github.com/introduction/flow/index.html). Just make sure all the tests are passing.

## License

[MIT](./LICENSE).
