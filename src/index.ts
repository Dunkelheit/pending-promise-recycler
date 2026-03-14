import { createHash } from 'node:crypto';

export type RecyclableFunction<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

export type KeyBuilderFunction = (func: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) => string;

export interface RecycleOptions {
    keyBuilder?: KeyBuilderFunction | string;
    ttl?: number;
    /**
     * Maximum number of concurrent in-flight entries the registry may hold.
     * When a new key would exceed this limit the oldest (first-inserted) entry
     * is evicted before the new one is added, acting as a FIFO safety valve
     * against unbounded memory growth.  Must be a positive integer; a
     * {@link RangeError} is thrown at wrap time otherwise.
     */
    maxSize?: number;
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

/**
 * Returns true for any value that JSON.stringify would silently misrepresent,
 * causing two different arguments to produce the same serialised form:
 *
 * - NaN, Infinity, -Infinity → all become the JSON literal `null`
 * - -0                       → becomes the string `"0"`, colliding with 0
 * - undefined, function, symbol → omitted or replaced by `null` in arrays
 *
 * Throwing from inside the JSON.stringify replacer propagates the error out of
 * JSON.stringify and into the surrounding try/catch, where it is re-thrown as
 * the standard descriptive user-facing error.
 */
function isNonSerializable(value: unknown): boolean {
    if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
        return true;
    }
    // NaN, Infinity, and -Infinity are all numbers that JSON.stringify converts
    // to null.  isFinite already excludes NaN (which is never finite).
    if (typeof value === 'number' && !Number.isFinite(value)) {
        return true;
    }
    // -0 serialises to "0", making it indistinguishable from 0.
    if (Object.is(value, -0)) {
        return true;
    }
    return false;
}

function defaultKeyBuilder(func: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]): string {
    const name = func.name || 'anonymous';
    try {
        const serialized = JSON.stringify(args, (_key, value: unknown) => {
            if (isNonSerializable(value)) {
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
    const { keyBuilder = defaultKeyBuilder, ttl, maxSize } = options;

    if (ttl !== undefined && (!Number.isFinite(ttl) || ttl < 0)) {
        throw new RangeError(
            `pending-promise-recycler: ttl must be a non-negative finite number, got ${ttl}`
        );
    }

    if (maxSize !== undefined && (!Number.isInteger(maxSize) || maxSize < 1)) {
        throw new RangeError(
            `pending-promise-recycler: maxSize must be a positive integer, got ${maxSize}`
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

        // Evict the oldest (first-inserted) entry when the registry is at capacity.
        // Map preserves insertion order, so Map.keys().next() always yields the
        // oldest key without any additional bookkeeping.
        if (maxSize !== undefined && registry.size >= maxSize) {
            const oldest = registry.keys().next().value as string;
            registry.delete(oldest);
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
