import { describe, it, expect, afterEach, vi } from 'vitest';

import recycle from './index.js';

interface TestFunctionOptions {
    isResolved?: boolean;
    result?: unknown;
    delay?: number;
    beforeResolving?: () => void;
    afterResolving?: () => void;
}

function testFunctionBuilder(name: string, {
    isResolved = true,
    result = 'Why hello there',
    delay = 10,
    beforeResolving = () => {},
    afterResolving = () => {}
}: TestFunctionOptions = {}): (...args: unknown[]) => Promise<unknown> {
    const obj: Record<string, (...args: unknown[]) => Promise<unknown>> = {
        [name]: () => {
            return new Promise((resolve, reject) => {
                function execute() {
                    beforeResolving();
                    if (isResolved) {
                        resolve(result);
                    } else {
                        reject(result);
                    }
                    afterResolving();
                }
                if (!delay) {
                    return execute();
                }
                setTimeout(execute, delay);
            });
        }
    };
    return obj[name];
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
            const func = testFunctionBuilder('a');
            const funcSpy = vi.fn(func);
            const recyclableFunc = recycle(funcSpy);
            const [resultA, resultB] = await Promise.all([
                recyclableFunc('lorem', 'ipsum', 'dolor sit amet'),
                recyclableFunc('lorem', 'ipsum', 'dolor sit amet'),
            ]);
            expect(funcSpy).toHaveBeenCalledOnce();
            expect(recyclableFunc.pendingCount).toBe(0);
            expect(resultA).toBe('Why hello there');
            expect(resultB).toBe('Why hello there');
        });

        it('Executes a rejected promise function twice, recycling the promise itself', async () => {
            const func = testFunctionBuilder('a', { isResolved: false });
            const funcSpy = vi.fn(func);
            const recyclableFunc = recycle(funcSpy);
            const [promiseA, promiseB] = await Promise.allSettled([
                recyclableFunc('lorem', 'ipsum', 'dolor sit amet'),
                recyclableFunc('lorem', 'ipsum', 'dolor sit amet'),
            ]);
            expect(funcSpy).toHaveBeenCalledOnce();
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
            const func = () => {
                return new Promise(resolve => {
                    const hmmm = ('' as unknown as Record<number, Record<number, unknown>>)[0][0];
                    resolve(hmmm);
                });
            };
            const spy = vi.fn(func);
            const recyclableFunc = recycle(spy);
            await expect(recyclableFunc()).rejects.toThrow();
            expect(recyclableFunc.pendingCount).toBe(0);
        });

        it('Handles promises that throw an unhandled rejection error', async () => {
            const err = new Error('Something went wrong!');
            const func = () => {
                return new Promise(() => {
                    throw err;
                });
            };
            const spy = vi.fn(func);
            const recyclableFunc = recycle(spy);
            await expect(recyclableFunc()).rejects.toThrow(err);
            expect(recyclableFunc.pendingCount).toBe(0);
        });

        it('Handles async functions that throw an unhandled rejection error', async () => {
            const err = new Error('Something went wrong!');
            const func = async () => {
                throw err;
            };
            const spy = vi.fn(func);
            const recyclableFunc = recycle(spy);
            await expect(recyclableFunc()).rejects.toThrow(err);
            expect(recyclableFunc.pendingCount).toBe(0);
        });
    });

    describe('Key builders', () => {

        it('Supports custom key builder functions', async () => {
            const spy = vi.fn(testFunctionBuilder('a'));
            const recyclableFunc = recycle(spy, {
                keyBuilder: (_func, ...args) => args[0] as string
            });
            // Two concurrent calls that resolve to the same key should be recycled
            const [r1, r2] = await Promise.all([
                recyclableFunc('lorem', 'ipsum', 'dolor sit amet'),
                recyclableFunc('lorem', 'ipsum', 'dolor sit amet'),
            ]);
            expect(spy).toHaveBeenCalledOnce();
            expect(recyclableFunc.pendingCount).toBe(0);
            expect(r1).toBe('Why hello there');
            expect(r2).toBe('Why hello there');
        });

        it('Supports a fixed key value', async () => {
            const spy = vi.fn(testFunctionBuilder('a'));
            const recyclableFunc = recycle(spy, { keyBuilder: 'toothbrush' });
            const result = await recyclableFunc('lorem', 'ipsum', 'dolor sit amet');
            expect(recyclableFunc.pendingCount).toBe(0);
            expect(spy).toHaveBeenCalledOnce();
            expect(spy).toHaveBeenCalledWith('lorem', 'ipsum', 'dolor sit amet');
            expect(result).toBe('Why hello there');
        });

        it('Works with anonymous functions', async () => {
            const innerFunc = testFunctionBuilder('');
            const spy = vi.fn(innerFunc);
            Object.defineProperty(spy, 'name', { value: innerFunc.name });
            const recyclableFunc = recycle(spy);
            const result = await recyclableFunc('lorem');
            expect(recyclableFunc.pendingCount).toBe(0);
            expect(spy).toHaveBeenCalledOnce();
            expect(spy).toHaveBeenCalledWith('lorem');
            expect(result).toBe('Why hello there');
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

        it('Removes a never-settling promise from the registry after TTL elapses', () => {
            vi.useFakeTimers();
            const neverSettles = vi.fn(() => new Promise(() => {}));
            const recyclableFunc = recycle(neverSettles, { ttl: 500 });

            recyclableFunc(); // fire and forget
            expect(recyclableFunc.pendingCount).toBe(1);

            vi.advanceTimersByTime(499);
            expect(recyclableFunc.pendingCount).toBe(1); // not yet

            vi.advanceTimersByTime(1);
            expect(recyclableFunc.pendingCount).toBe(0); // evicted
        });

        it('Does not remove a promise that settles before the TTL', async () => {
            vi.useFakeTimers();
            const func = vi.fn(testFunctionBuilder('a', { delay: 100 }));
            const recyclableFunc = recycle(func, { ttl: 500 });

            const promise = recyclableFunc();
            expect(recyclableFunc.pendingCount).toBe(1);

            // Advance past the promise resolution (100ms) but before TTL (500ms)
            await vi.advanceTimersByTimeAsync(200);
            expect(recyclableFunc.pendingCount).toBe(0); // settled naturally, not by TTL
            expect(func).toHaveBeenCalledOnce();
            await promise; // should already be resolved
        });

        it('After TTL eviction, a subsequent call creates a fresh promise', () => {
            vi.useFakeTimers();
            const neverSettles = vi.fn(() => new Promise(() => {}));
            const recyclableFunc = recycle(neverSettles, { ttl: 500, keyBuilder: 'key' });

            recyclableFunc();
            expect(neverSettles).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(500); // TTL fires, evicts from registry
            expect(recyclableFunc.pendingCount).toBe(0);

            recyclableFunc(); // should trigger a brand-new call
            expect(neverSettles).toHaveBeenCalledTimes(2);
            expect(recyclableFunc.pendingCount).toBe(1);
        });

        it('Without a TTL, a never-settling promise stays in the registry indefinitely', () => {
            vi.useFakeTimers();
            const neverSettles = vi.fn(() => new Promise(() => {}));
            const recyclableFunc = recycle(neverSettles); // no TTL

            recyclableFunc();
            expect(recyclableFunc.pendingCount).toBe(1);

            vi.advanceTimersByTime(60_000); // advance 1 minute
            expect(recyclableFunc.pendingCount).toBe(1); // still there
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
