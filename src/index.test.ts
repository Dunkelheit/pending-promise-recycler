import { describe, it, expect, afterEach, vi } from 'vitest';
import { format } from 'node:util';

import recycle, { _registry as registry } from './index.js';

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
    });

    describe('Basic usage', () => {

        it('Executes a promise function once', async () => {
            function beforeResolving() {
                expect(registry.has('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37')).toBe(true);
                expect(registry.size).toBe(1);
                const p = registry.get('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37');
                expect(p).toBeInstanceOf(Promise);
                expect(format('%s', p)).toBe('Promise { <pending> }');
            }
            function afterResolving() {
                expect(registry.has('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37')).toBe(true);
                expect(registry.size).toBe(1);
                const p = registry.get('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37');
                expect(p).toBeInstanceOf(Promise);
                expect(format('%s', p)).toBe('Promise { \'Why hello there\' }');
            }
            const spy = vi.fn(testFunctionBuilder('a', { beforeResolving, afterResolving }));
            const cachedFunc = recycle(spy);
            const result = await cachedFunc('lorem', 'ipsum', 'dolor sit amet');
            expect(registry.size).toBe(0);
            expect(spy).toHaveBeenCalledOnce();
            expect(spy).toHaveBeenCalledWith('lorem', 'ipsum', 'dolor sit amet');
            expect(result).toBe('Why hello there');
        });

        it('Executes a fulfilled promise function twice, recycling the promise itself', async () => {
            const registryGetSpy = vi.spyOn(registry, 'get');
            const func = testFunctionBuilder('a');
            const funcSpy = vi.fn(func);
            const cachedFunc = recycle(funcSpy);
            const [promiseA, promiseB] = await Promise.all([
                cachedFunc('lorem', 'ipsum', 'dolor sit amet'),
                cachedFunc('lorem', 'ipsum', 'dolor sit amet'),
            ]);
            expect(registryGetSpy).toHaveBeenCalledOnce();
            expect(funcSpy).toHaveBeenCalledOnce();
            expect(registry.size).toBe(0);
            expect(promiseA).toBe('Why hello there');
            expect(promiseB).toBe('Why hello there');
        });

        it('Executes a rejected promise function twice, recycling the promise itself', async () => {
            const registryGetSpy = vi.spyOn(registry, 'get');
            const func = testFunctionBuilder('a', { isResolved: false });
            const funcSpy = vi.fn(func);
            const cachedFunc = recycle(funcSpy);
            const [promiseA, promiseB] = await Promise.allSettled([
                cachedFunc('lorem', 'ipsum', 'dolor sit amet'),
                cachedFunc('lorem', 'ipsum', 'dolor sit amet'),
            ]);
            expect(registryGetSpy).toHaveBeenCalledOnce();
            expect(funcSpy).toHaveBeenCalledOnce();
            expect(registry.size).toBe(0);
            expect(promiseA).toHaveProperty('status', 'rejected');
            expect(promiseA).toHaveProperty('reason', 'Why hello there');
            expect(promiseB).toHaveProperty('status', 'rejected');
            expect(promiseB).toHaveProperty('reason', 'Why hello there');
        });
    });

    describe('Error handling', () => {

        it('Handles rejected promises, making sure the registry stays clean', async () => {
            function beforeResolving() {
                expect(registry.has('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37')).toBe(true);
                expect(registry.size).toBe(1);
                const p = registry.get('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37');
                expect(p).toBeInstanceOf(Promise);
                expect(format('%s', p)).toBe('Promise { <pending> }');
            }
            function afterResolving() {
                expect(registry.has('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37')).toBe(true);
                expect(registry.size).toBe(1);
                const p = registry.get('a-91f967512ad54d194006a3cacf3a94d7f9c4ded44bb194c1e9e0fb1c21cb9a37');
                expect(p).toBeInstanceOf(Promise);
            }
            const spy = vi.fn(testFunctionBuilder('a', {
                isResolved: false,
                result: new Error('Ruh-roh'),
                beforeResolving,
                afterResolving
            }));
            const cachedFunc = recycle(spy);
            await expect(cachedFunc('lorem', 'ipsum', 'dolor sit amet')).rejects.toThrow('Ruh-roh');
            expect(registry.size).toBe(0);
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
            const cachedFunc = recycle(spy);
            await expect(cachedFunc()).rejects.toThrow();
            expect(registry.size).toBe(0);
        });

        it('Handles promises that throw an unhandled rejection error', async () => {
            const err = new Error('Something went wrong!');
            const func = () => {
                return new Promise(() => {
                    throw err;
                });
            };
            const spy = vi.fn(func);
            const cachedFunc = recycle(spy);
            await expect(cachedFunc()).rejects.toThrow(err);
            expect(registry.size).toBe(0);
        });

        it('Handles async functions that throw an unhandled rejection error', async () => {
            const err = new Error('Something went wrong!');
            const func = async () => {
                throw err;
            };
            const spy = vi.fn(func);
            const cachedFunc = recycle(spy);
            await expect(cachedFunc()).rejects.toThrow(err);
            expect(registry.size).toBe(0);
        });
    });

    describe('Key builders', () => {

        it('Supports custom key builder functions', async () => {
            function beforeResolving() {
                expect(registry.has('lorem')).toBe(true);
                expect(registry.size).toBe(1);
            }
            const spy = vi.fn(testFunctionBuilder('a', { beforeResolving }));
            const cachedFunc = recycle(spy, {
                keyBuilder: (_func, ...args) => {
                    return args[0] as string;
                }
            });
            const result = await cachedFunc('lorem', 'ipsum', 'dolor sit amet');
            expect(registry.size).toBe(0);
            expect(spy).toHaveBeenCalledOnce();
            expect(spy).toHaveBeenCalledWith('lorem', 'ipsum', 'dolor sit amet');
            expect(result).toBe('Why hello there');
        });

        it('Supports a fixed key value', async () => {
            function beforeResolving() {
                expect(registry.has('toothbrush')).toBe(true);
                expect(registry.size).toBe(1);
            }
            const spy = vi.fn(testFunctionBuilder('a', { beforeResolving }));
            const cachedFunc = recycle(spy, { keyBuilder: 'toothbrush' });
            const result = await cachedFunc('lorem', 'ipsum', 'dolor sit amet');
            expect(registry.size).toBe(0);
            expect(spy).toHaveBeenCalledOnce();
            expect(spy).toHaveBeenCalledWith('lorem', 'ipsum', 'dolor sit amet');
            expect(result).toBe('Why hello there');
        });

        it('Works with anonymous functions', async () => {
            function beforeResolving() {
                expect(registry.has(
                    'anonymous-0d0491105dd08721e0911939ca184e9e5a6f924b00dce27a4163ca333049bf20'
                )).toBe(true);
                expect(registry.size).toBe(1);
            }
            const innerFunc = testFunctionBuilder('', { beforeResolving });
            const spy = vi.fn(innerFunc);
            Object.defineProperty(spy, 'name', { value: innerFunc.name });
            const cachedFunc = recycle(spy);
            const result = await cachedFunc('lorem');
            expect(registry.size).toBe(0);
            expect(spy).toHaveBeenCalledOnce();
            expect(spy).toHaveBeenCalledWith('lorem');
            expect(result).toBe('Why hello there');
        });
    });
});
