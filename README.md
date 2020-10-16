# Pending Promise Recycler

> Save precious resources and avoid performing the same operation twice by recycling pending promises.

`pending-promise-recycler` is a lightweight, production-dependency-free JavaScript module meant to use existing pending
promises instead of creating new ones.

Originally intended for Node.js backend and middle-layer services that might incur in a high burst of concurrent calls
to 3rd party APIs before the response of the first one can be cached, `pending-promise-recycler` can also be used for
virtually any situation in which components of a JavaScript system need to be made fully aware of any pending Promise
for an expensive operation, so that it can be reused instead of created over and over again.   

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

Assume you have a REST API with an endpoint that executes to this `fetchSomethingExpensive` function every time we call
it. Even if we would cache its result, there could be such a scenario in which a burst of thousands of concurrent calls
are fired against your API -before we are able to cache the response to the first call.

In this case, we want to make sure the same promise is used to satisfy all the concurrent requests. 
`pending-promise-recycler` can help us with that:

```javascript
const recycle = require('pending-promise-recycler');

const recyclableFetch = recycle(fetchSomethingExpensive);

// Simulate four concurrent incoming requests
const responses = await Promise.all([ recyclableFetch(), recyclableFetch(), recyclableFetch(), recyclableFetch() ]);

console.log(responses);
// [ { foo: 'bar' }, { foo: 'bar' }, { foo: 'bar' }, { foo: 'bar' } ]
// Only one call to the 3rd party API was made, the other three elements in the array have been satisfied by the same
// single promise that incurred in a call to the 3rd party API.
```

## Usage

Install `pending-promise-recycler` using `npm`:

```
> npm install pending-promise-recycler
```

Require the dependency:

```javascript
const recycle = require('pending-promise-recycler');
```

Use the function stored in `recycle` to create "pending-promise-aware" versions of an expensive asynchronous function.

```javascript
// recycle(function func, object options)
const recyclableFetch = recycle(fetchSomethingExpensive, {});
``` 

The internal registry where recyclable promises are stored needs to identify them somehow, by default functions will
be uniquely identified by their name and their arguments, but it is strongly recommended to use the custom keyBuilder
to make sure your recycling needs are met &mdash; see the options section below. 

```javascript
// Identify the recyclable function with a fixed string
const recyclableFetch = recycle(fetchSomethingExpensive, {
    keyBuilder: 'fixed-key-name'
});

// Use a dynamic key builder to identify the function based on its arguments 
const moreFineTunedRecyclableFetch = recycle(fetchSomethingExpensive, {
    keyBuilder: (func, ...args) => {
        return `${args[0].method}-${args[0].uri}`; 
    }
});
``` 

## API

When we require 'pending-promise-recycler'... 

```javascript
const recycle = require('pending-promise-recycler');
```

...the variable `recycle` will be a function as described below:

* **`recycle`**(*function* **`func`**, *object* **`options`**)
    * *function* **`func`** &mdash; the function we want to recycle.
    * *object* **`options`** &mdash; an object with the following possible properties.
        * **`keyBuilder`** can be either a *string* or a *function*:
            * In case of a *string*, this will be the unique identifier of the cached function.
            * Otherwise, a function with signature **`keyBuilder`**(*function* **`originalFunc`**, *array* **`...args`**), 
            which is expected to return a *string* that uniquely identifies this recyclable function. 
                * *function* **`originalFunc`** &mdash; the originally invoked function.
                * *array* **`...args`** &mdash; the array of arguments passed to the original function.
