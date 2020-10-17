# Pending Promise Recycler

> Save precious resources and avoid performing the same operation again and again by recycling pending promises.

`pending-promise-recycler` is a lightweight, production-dependency-free JavaScript module meant to use existing pending
promises as many times as needed, instead of creating new ones.

Originally intended for Node.js backend and middle-layer services that might incur in a high burst of concurrent calls
to 3rd party APIs before the response of the first one can be cached, `pending-promise-recycler` can also be used for
virtually any situation in which components of a JavaScript system need keep track of a pending Promise for an expensive
operation, so that it can be reused instead of created over and over again.   

## Introduction

Consider the following (expensive!) operation:

```javascript
const fetchSomethingExpensive = (arg1, arg2) => {
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

```javascript
const recycle = require('pending-promise-recycler');

const recyclableFetch = recycle(fetchSomethingExpensive);

// Simulate four concurrent incoming requests
const responses = await Promise.all([ recyclableFetch(), 
    recyclableFetch(), recyclableFetch(), recyclableFetch() ]);

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

Require the module `pending-promise-recycler` and wrap any function with it, optionally passing an object with 
options.

```javascript
const recycle = require('pending-promise-recycler');

// recycle(function func, object options)
const recyclableFunc = recycle(func, {});
``` 

The internal registry where recyclable promises are stored needs to identify them somehow, by default functions will
be uniquely identified by their function name and their arguments, but it is **strongly recommended to use a custom
key builder** to make sure your recycling needs are met. This can be done as follows: 

```javascript
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

## API

### recycle(function, options)

The first argument, `function`, is any Promise function that we want to be able to recycle during its "pending" state.

The second argument, `options`, is optional and can contain the following properties:

* `keyBuilder` &mdash; can either be a **function** or a **string**. The resulting value of this property will be used
to uniquely identify the promise from the first argument, `function`.
    * When the value is a *function*, it will be called with the arguments `(originalFunction, ...args)`, where:   
        * `originalFunc` is the original function.
        * `...args` is the array of arguments passed to the original function.

## Testing

The test suite of `pending-promise-recycler` can be executed with the `npm` task `test`:

```
> npm run test
```

There is also a linter task:

```
> npm run lint
```

JSDoc documentation can be generated as follows:

```
> npm run jsdoc
```

## Contributing

GitHub issues are the preferred way to report problems or make requests for new functionality. This is a PR-friendly
project, if you want to contribute feel free to submit your pull requests following the 
[GitHub flow](https://guides.github.com/introduction/flow/index.html). Just make sure all the tests are passing.

## License

[MIT](./LICENSE).
