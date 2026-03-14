import { describe, it, expect, afterEach, vi } from 'vitest';

import recycle, { PromiseTimeoutError } from './index.js';

interface TestFunctionOptions {
    isResolved?: boolean;
    result?: unknown;
    delay?: number;
}

function testFunctionBuilder(name: string, {
    isResolved = true,
    result = 'Why hello there',
    delay = 10,
}: TestFunctionOptions = {}): (...args: unknown[]) => Promise<unknown> {
    // A computed-property object is used so the returned function's .name
    // matches `name`, which the default key builder reads via func.name.
    const fns: Record<string, (...args: unknown[]) => Promise<unknown>> = {
        [name]: () => new Promise((resolve, reject) => {
            const settle = () => (isResolved ? resolve(result) : reject(result));
            if (delay > 0) { setTimeout(settle, delay); } else { settle(); }
        }),
    };
    return fns[name];
}

describe('pending-promise-recycler', () => {

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('Basic usage', () => {

        it('Executes a promise function once', async () => {
            const spy = vi.fn(testFunctionBuilder('a'));
            const recyclableFunc = recycle(spy);
            const result = await recyclableFunc('lorem', 'ipsum', 'dolor sit amet');
            expect(spy).toHaveBeenCalledOnce();
            expect(spy).toHaveBeenCalledWith('lorem', 'ipsum', 'dolor sit amet');
            expect(result).toBe('Why hello there');
        });

        it('Executes a fulfilled promise function twice, recycling the promise itself', async () => {
            const spy = vi.fn(testFunctionBuilder('a'));
            const recyclableFunc = recycle(spy);
            const [resultA, resultB] = await Promise.all([
                recyclableFunc('lorem', 'ipsum', 'dolor sit amet'),
                recyclableFunc('lorem', 'ipsum', 'dolor sit amet'),
            ]);
            expect(spy).toHaveBeenCalledOnce();
            expect(recyclableFunc.pendingCount).toBe(0);
            expect(resultA).toBe('Why hello there');
            expect(resultB).toBe('Why hello there');
        });

        it('Executes a rejected promise function twice, recycling the promise itself', async () => {
            const spy = vi.fn(testFunctionBuilder('a', { isResolved: false }));
            const recyclableFunc = recycle(spy);
            const [promiseA, promiseB] = await Promise.allSettled([
                recyclableFunc('lorem', 'ipsum', 'dolor sit amet'),
                recyclableFunc('lorem', 'ipsum', 'dolor sit amet'),
            ]);
            expect(spy).toHaveBeenCalledOnce();
            expect(recyclableFunc.pendingCount).toBe(0);
            expect(promiseA).toHaveProperty('status', 'rejected');
            expect(promiseA).toHaveProperty('reason', 'Why hello there');
            expect(promiseB).toHaveProperty('status', 'rejected');
            expect(promiseB).toHaveProperty('reason', 'Why hello there');
        });
    });

    describe('Error handling', () => {

        it('Handles rejected promises, making sure the registry stays clean', async () => {
            const spy = vi.fn(testFunctionBuilder('a', {
                isResolved: false,
                result: new Error('Ruh-roh'),
            }));
            const recyclableFunc = recycle(spy);
            await expect(recyclableFunc('lorem', 'ipsum', 'dolor sit amet')).rejects.toThrow('Ruh-roh');
            expect(recyclableFunc.pendingCount).toBe(0);
            expect(spy).toHaveBeenCalledOnce();
            expect(spy).toHaveBeenCalledWith('lorem', 'ipsum', 'dolor sit amet');
        });

        it('Handles promises that cause a TypeError', async () => {
            // Deliberately accesses a property on undefined inside the Promise
            // constructor, producing a TypeError rejection without any throw statement.
            const func = () => new Promise(resolve => {
                resolve((undefined as unknown as Record<string, unknown>)['key']);
            });
            const recyclableFunc = recycle(func);
            await expect(recyclableFunc()).rejects.toThrow(TypeError);
            expect(recyclableFunc.pendingCount).toBe(0);
        });

        it('Handles promises that throw an unhandled rejection error', async () => {
            const err = new Error('Something went wrong!');
            const func = () => new Promise(() => { throw err; });
            const recyclableFunc = recycle(func);
            await expect(recyclableFunc()).rejects.toThrow(err);
            expect(recyclableFunc.pendingCount).toBe(0);
        });

        it('Handles async functions that throw an unhandled rejection error', async () => {
            const err = new Error('Something went wrong!');
            const func = async () => { throw err; };
            const recyclableFunc = recycle(func);
            await expect(recyclableFunc()).rejects.toThrow(err);
            expect(recyclableFunc.pendingCount).toBe(0);
        });
    });

    describe('Key builders', () => {

        it('Supports custom key builder functions', async () => {
            // The custom builder always returns the same key regardless of arguments.
            // Two calls with *different* args would get different keys under the default
            // builder — so recycling can only happen here if the custom builder is used.
            const spy = vi.fn(testFunctionBuilder('a', { delay: 50 }));
            const recyclableFunc = recycle(spy, {
                keyBuilder: () => 'fixed'
            });
            const [r1, r2] = await Promise.all([
                recyclableFunc('arg-A'),
                recyclableFunc('arg-B'),
            ]);
            expect(spy).toHaveBeenCalledOnce();
            expect(recyclableFunc.pendingCount).toBe(0);
            expect(r1).toBe('Why hello there');
            expect(r2).toBe('Why hello there');
        });

        it('Supports a fixed key value', async () => {
            // Two calls with *different* args would get different keys under the default
            // builder — so recycling can only happen here because of the fixed key.
            const spy = vi.fn(testFunctionBuilder('a', { delay: 50 }));
            const recyclableFunc = recycle(spy, { keyBuilder: 'toothbrush' });
            const [r1, r2] = await Promise.all([
                recyclableFunc('arg-A'),
                recyclableFunc('arg-B'),
            ]);
            expect(spy).toHaveBeenCalledOnce();
            expect(recyclableFunc.pendingCount).toBe(0);
            expect(r1).toBe('Why hello there');
            expect(r2).toBe('Why hello there');
        });

        it('Works with anonymous functions', async () => {
            const innerFunc = testFunctionBuilder('');
            const spy = vi.fn(innerFunc);
            // vi.fn() renames the wrapper; restore the original empty name so the
            // default key builder exercises the `func.name || 'anonymous'` fallback.
            Object.defineProperty(spy, 'name', { value: innerFunc.name });
            const recyclableFunc = recycle(spy);
            const result = await recyclableFunc('lorem');
            expect(recyclableFunc.pendingCount).toBe(0);
            expect(spy).toHaveBeenCalledOnce();
            expect(spy).toHaveBeenCalledWith('lorem');
            expect(result).toBe('Why hello there');
        });

        it('Captures options at wrap time — mutating the options object afterwards has no effect', async () => {
            // P1 starts with key 'key-A' in the registry. Then we mutate the options
            // object to 'key-B'. If the key is re-read per call (the bug), P2 would use
            // 'key-B', miss the registry entry, and invoke the spy a second time.
            // If options are captured at wrap time (the fix), P2 uses 'key-A', finds P1
            // in the registry, and is recycled — spy is only called once.
            const spy = vi.fn(testFunctionBuilder('a', { delay: 50 }));
            const opts = { keyBuilder: 'key-A' };
            const recyclableFunc = recycle(spy, opts);

            const p1 = recyclableFunc();        // uses captured 'key-A', adds to registry
            opts.keyBuilder = 'key-B';          // mutate while p1 is in-flight
            const p2 = recyclableFunc();        // must still use 'key-A' → recycled

            await Promise.all([p1, p2]);
            expect(spy).toHaveBeenCalledOnce();
        });
    });

    describe('Default key builder', () => {

        it('Throws a descriptive error when arguments contain a circular reference', async () => {
            const recyclableFunc = recycle(testFunctionBuilder('a'));
            const circular: Record<string, unknown> = {};
            circular.self = circular;
            await expect(recyclableFunc(circular)).rejects.toThrow(
                'pending-promise-recycler: failed to serialize arguments'
            );
        });

        it('Throws a descriptive error when arguments contain a function', async () => {
            const recyclableFunc = recycle(testFunctionBuilder('a'));
            await expect(recyclableFunc(() => {})).rejects.toThrow(
                'pending-promise-recycler: failed to serialize arguments'
            );
        });

        it('Throws a descriptive error when arguments contain a symbol', async () => {
            const recyclableFunc = recycle(testFunctionBuilder('a'));
            await expect(recyclableFunc(Symbol('test'))).rejects.toThrow(
                'pending-promise-recycler: failed to serialize arguments'
            );
        });

        it('Throws a descriptive error when arguments contain undefined', async () => {
            const recyclableFunc = recycle(testFunctionBuilder('a'));
            await expect(recyclableFunc(undefined)).rejects.toThrow(
                'pending-promise-recycler: failed to serialize arguments'
            );
        });
    });

    describe('Per-instance registry', () => {

        it('Two recycled functions with the same key do not share promises', async () => {
            const funcA = vi.fn(testFunctionBuilder('shared', { delay: 50 }));
            const funcB = vi.fn(testFunctionBuilder('shared', { delay: 50 }));
            const recyclableA = recycle(funcA, { keyBuilder: 'same-key' });
            const recyclableB = recycle(funcB, { keyBuilder: 'same-key' });

            // Fire both concurrently
            const [resultA, resultB] = await Promise.all([recyclableA(), recyclableB()]);

            // Both underlying functions must have been invoked — no cross-instance recycling
            expect(funcA).toHaveBeenCalledOnce();
            expect(funcB).toHaveBeenCalledOnce();
            expect(resultA).toBe('Why hello there');
            expect(resultB).toBe('Why hello there');
        });

        it('pendingCount is tracked independently per instance', async () => {
            const recyclableA = recycle(testFunctionBuilder('a', { delay: 50 }), { keyBuilder: 'key' });
            const recyclableB = recycle(testFunctionBuilder('b', { delay: 50 }), { keyBuilder: 'key' });

            const pA = recyclableA();
            expect(recyclableA.pendingCount).toBe(1);
            expect(recyclableB.pendingCount).toBe(0); // B's registry is unaffected

            const pB = recyclableB();
            expect(recyclableA.pendingCount).toBe(1);
            expect(recyclableB.pendingCount).toBe(1);

            await Promise.all([pA, pB]);
            expect(recyclableA.pendingCount).toBe(0);
            expect(recyclableB.pendingCount).toBe(0);
        });

        it('Concurrent calls within an instance are still recycled', async () => {
            const spy = vi.fn(testFunctionBuilder('a', { delay: 50 }));
            const recyclableFunc = recycle(spy, { keyBuilder: 'key' });

            const [r1, r2, r3] = await Promise.all([
                recyclableFunc(), recyclableFunc(), recyclableFunc()
            ]);
            expect(spy).toHaveBeenCalledOnce();
            expect(r1).toBe('Why hello there');
            expect(r2).toBe('Why hello there');
            expect(r3).toBe('Why hello there');
        });
    });

    describe('TTL', () => {

        it('Evicts from the registry and rejects all in-flight callers with PromiseTimeoutError', async () => {
            vi.useFakeTimers();
            const recyclableFunc = recycle(
                vi.fn(() => new Promise<string>(() => {})),
                { ttl: 500, keyBuilder: 'key' }
            );

            const p1 = recyclableFunc(); // first caller
            const p2 = recyclableFunc(); // recycled — shares the same in-flight entry

            expect(recyclableFunc.pendingCount).toBe(1);
            vi.advanceTimersByTime(499);
            expect(recyclableFunc.pendingCount).toBe(1); // not yet

            vi.advanceTimersByTime(1); // TTL fires — registry cleared synchronously
            expect(recyclableFunc.pendingCount).toBe(0);

            // Both the original caller and the recycled caller must receive the rejection
            await expect(p1).rejects.toBeInstanceOf(PromiseTimeoutError);
            await expect(p2).rejects.toBeInstanceOf(PromiseTimeoutError);
        });

        it('Does not reject callers when the promise settles before the TTL', async () => {
            // If the TTL fires before the promise settles, callers receive a
            // PromiseTimeoutError. If the promise settles first, callers must receive the
            // resolved value — not a timeout error. The assertion below is only satisfiable
            // if the promise settled naturally.
            vi.useFakeTimers();
            const func = vi.fn(testFunctionBuilder('a', { delay: 100 }));
            const recyclableFunc = recycle(func, { ttl: 500 });

            const promise = recyclableFunc();
            expect(recyclableFunc.pendingCount).toBe(1);

            // Advance past the promise resolution (100ms) but before TTL (500ms)
            await vi.advanceTimersByTimeAsync(200);
            expect(recyclableFunc.pendingCount).toBe(0);

            // Resolves with the correct value — not rejected with PromiseTimeoutError
            await expect(promise).resolves.toBe('Why hello there');
        });

        it('After TTL eviction, a subsequent call creates a fresh promise', async () => {
            vi.useFakeTimers();
            const neverSettles = vi.fn(() => new Promise<string>(() => {}));
            const recyclableFunc = recycle(neverSettles, { ttl: 500, keyBuilder: 'key' });

            const p1 = recyclableFunc();
            expect(neverSettles).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(500); // TTL fires, evicts from registry
            expect(recyclableFunc.pendingCount).toBe(0);

            const p2 = recyclableFunc(); // must trigger a brand-new call
            expect(neverSettles).toHaveBeenCalledTimes(2);
            expect(recyclableFunc.pendingCount).toBe(1);

            await expect(p1).rejects.toBeInstanceOf(PromiseTimeoutError);
            p2.catch(() => {}); // p2 never settles in this test; suppress future rejection
        });

        it('Without a TTL, a never-settling promise stays in the registry indefinitely', () => {
            vi.useFakeTimers();
            const recyclableFunc = recycle(
                vi.fn(() => new Promise<string>(() => {}))
            );

            recyclableFunc().catch(() => {}); // never rejects without TTL; catch is defensive
            expect(recyclableFunc.pendingCount).toBe(1);

            vi.advanceTimersByTime(60_000); // advance 1 minute
            expect(recyclableFunc.pendingCount).toBe(1); // still there
        });

        it('Does not delete a later call\'s entry when the original hung promise settles after TTL', async () => {
            vi.useFakeTimers();
            // Collect each call's resolve function in order so P1 and P2 can be
            // settled independently — fn is called twice (once per non-recycled invocation).
            const resolvers: Array<(value: string) => void> = [];
            const fn = vi.fn(() => new Promise<string>(r => resolvers.push(r)));
            const recyclableFunc = recycle(fn, { ttl: 500, keyBuilder: 'key' });

            const p1 = recyclableFunc();               // P1 starts; TTL timer armed
            // Pre-attach a handler so that when p1 rejects during the microtask flush
            // below it is not flagged as an unhandled rejection before our assertion runs.
            p1.catch(() => {});
            expect(recyclableFunc.pendingCount).toBe(1);

            vi.advanceTimersByTime(500);               // TTL fires, P1 evicted
            expect(recyclableFunc.pendingCount).toBe(0);

            const p2 = recyclableFunc();               // P2 starts with the same key
            expect(recyclableFunc.pendingCount).toBe(1);

            resolvers[0]('done');                      // P1's underlying res settles
            await vi.advanceTimersByTimeAsync(0);      // flush microtasks

            // P1's finally block must not have touched P2's registry entry
            expect(recyclableFunc.pendingCount).toBe(1);

            await expect(p1).rejects.toBeInstanceOf(PromiseTimeoutError);
            p2.catch(() => {}); // p2 never settles in this test; suppress future rejection
        });

        it('Throws a RangeError when ttl is negative', () => {
            expect(() => recycle(testFunctionBuilder('a'), { ttl: -1 }))
                .toThrow(RangeError);
        });

        it('Throws a RangeError when ttl is NaN', () => {
            expect(() => recycle(testFunctionBuilder('a'), { ttl: NaN }))
                .toThrow(RangeError);
        });

        it('Throws a RangeError when ttl is Infinity', () => {
            expect(() => recycle(testFunctionBuilder('a'), { ttl: Infinity }))
                .toThrow(RangeError);
        });
    });

    describe('pendingCount', () => {

        it('Returns 0 when no promises are in flight', () => {
            const recyclableFunc = recycle(testFunctionBuilder('a'));
            expect(recyclableFunc.pendingCount).toBe(0);
        });

        it('Increments when a promise starts and decrements when it settles', async () => {
            const recyclableFunc = recycle(testFunctionBuilder('a', { delay: 50 }));

            const promise = recyclableFunc();
            expect(recyclableFunc.pendingCount).toBe(1);

            await promise;
            expect(recyclableFunc.pendingCount).toBe(0);
        });

        it('Counts multiple in-flight promises with different keys', async () => {
            const recyclableFunc = recycle(testFunctionBuilder('a', { delay: 50 }));

            const p1 = recyclableFunc('key-1');
            const p2 = recyclableFunc('key-2');
            expect(recyclableFunc.pendingCount).toBe(2);

            await Promise.all([p1, p2]);
            expect(recyclableFunc.pendingCount).toBe(0);
        });

        it('Does not double-count recycled concurrent calls with the same key', async () => {
            const recyclableFunc = recycle(testFunctionBuilder('a', { delay: 50 }));

            const p1 = recyclableFunc('same-key');
            const p2 = recyclableFunc('same-key'); // recycled
            expect(recyclableFunc.pendingCount).toBe(1); // only one registry entry

            await Promise.all([p1, p2]);
            expect(recyclableFunc.pendingCount).toBe(0);
        });

        it('Decrements correctly even when a promise rejects', async () => {
            const recyclableFunc = recycle(testFunctionBuilder('a', { isResolved: false }));

            await Promise.allSettled([recyclableFunc()]);
            expect(recyclableFunc.pendingCount).toBe(0);
        });
    });
});
