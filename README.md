# Pending Promise Recycler

> Save precious resources and avoid performing the same operation again and again by recycling pending promises.

![Node.js CI](https://github.com/Dunkelheit/pending-promise-recycler/workflows/Node.js%20CI/badge.svg)

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

Import the module and wrap any promise-returning function with it, optionally passing an object with options.

```typescript
import recycle from 'pending-promise-recycler';

// recycle(func, options)
const recyclableFunc = recycle(func, {});
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
be uniquely identified by their function name and hashed arguments, but it is **strongly recommended to use a custom
key builder** to make sure your recycling needs are met. This can be done as follows:

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

### Protecting against hung promises with a TTL

By default, if a promise never settles, its registry entry is never cleaned up. Pass a `ttl` (time-to-live, in
milliseconds) to evict the entry automatically if the promise has not resolved or rejected within that time:

```typescript
const recyclableFetch = recycle(fetchSomethingExpensive, {
    ttl: 5000 // evict after 5 seconds if still pending
});
```

If the promise settles before the TTL, the timer is cancelled and the entry is removed normally. The TTL only
intervenes when a promise is genuinely stuck.

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
}

// The wrapped function returned by recycle(), with an added pendingCount property
type RecyclableWrappedFunction<TArgs extends unknown[], TResult> = RecyclableFunction<TArgs, TResult> & {
    readonly pendingCount: number;
};
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
registry. Useful as a safety net against promises that never settle (e.g. a hung network request). If the promise
settles before the TTL, the timer is cancelled and normal cleanup proceeds.

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
