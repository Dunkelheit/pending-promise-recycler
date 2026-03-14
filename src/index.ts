import { createHash } from 'node:crypto';

export type RecyclableFunction<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

export type KeyBuilderFunction = (func: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) => string;

export interface RecycleOptions {
    keyBuilder?: KeyBuilderFunction | string;
    ttl?: number;
}

export type RecyclableWrappedFunction<TArgs extends unknown[], TResult> = RecyclableFunction<TArgs, TResult> & {
    readonly pendingCount: number;
};

export class PromiseTimeoutError extends Error {
    constructor(ms: number) {
        super(`pending-promise-recycler: promise timed out after ${ms}ms`);
        this.name = 'PromiseTimeoutError';
    }
}

function defaultKeyBuilder(func: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]): string {
    const name = func.name || 'anonymous';
    try {
        const serialized = JSON.stringify(args, (_key, value: unknown) => {
            if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
                // Throwing here propagates out of JSON.stringify and into the catch
                // below, producing the same descriptive error as a circular reference.
                throw new TypeError('non-serializable argument');
            }
            return value;
        });
        return `${name}-${createHash('sha256').update(serialized).digest('hex')}`;
    } catch {
        throw new Error(
            `pending-promise-recycler: failed to serialize arguments for "${name}". Provide a custom keyBuilder.`
        );
    }
}

export default function recycle<TArgs extends unknown[], TResult>(
    func: RecyclableFunction<TArgs, TResult>,
    options: RecycleOptions = {}
): RecyclableWrappedFunction<TArgs, TResult> {
    const registry = new Map<string, Promise<unknown>>();
    const { keyBuilder = defaultKeyBuilder, ttl } = options;

    if (ttl !== undefined && (!Number.isFinite(ttl) || ttl < 0)) {
        throw new RangeError(
            `pending-promise-recycler: ttl must be a non-negative finite number, got ${ttl}`
        );
    }

    async function recyclable(...args: TArgs): Promise<TResult> {
        const identifier = typeof keyBuilder === 'function'
            ? keyBuilder(func as (...args: unknown[]) => Promise<unknown>, ...args) : keyBuilder;

        if (registry.has(identifier)) {
            return registry.get(identifier) as Promise<TResult>;
        }

        const res = func(...args);
        let cancelTtl: () => void = () => {};
        // `tracked` is `let` so the timer callback below can close over the
        // variable and read its final value (the race promise) when it fires.
        let tracked: Promise<TResult> = res;

        if (ttl !== undefined) {
            const ttlPromise = new Promise<never>((_, reject) => {
                const timer = setTimeout(() => {
                    if (registry.get(identifier) === tracked) {
                        registry.delete(identifier);
                    }
                    reject(new PromiseTimeoutError(ttl));
                }, ttl);
                cancelTtl = () => clearTimeout(timer);
            });
            tracked = Promise.race([res, ttlPromise]);
        }

        registry.set(identifier, tracked);

        try {
            await tracked;
        } finally {
            cancelTtl();
            if (registry.get(identifier) === tracked) {
                registry.delete(identifier);
            }
        }

        return res;
    }

    Object.defineProperty(recyclable, 'pendingCount', {
        get: () => registry.size,
        enumerable: true,
    });

    return recyclable as RecyclableWrappedFunction<TArgs, TResult>;
}
