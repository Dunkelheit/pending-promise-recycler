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
 * Returns true for values JSON.stringify silently misrepresents: undefined /
 * function / symbol (omitted or null-coerced), non-finite numbers (→ null), -0 (→ "0").
 */
function isNonSerializable(value: unknown): boolean {
    return (
        typeof value === 'undefined' ||
        typeof value === 'function' ||
        typeof value === 'symbol' ||
        (typeof value === 'number' && !Number.isFinite(value)) ||
        Object.is(value, -0)
    );
}

function defaultKeyBuilder(func: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]): string {
    const name = func.name || 'anonymous';
    try {
        const serialized = JSON.stringify(args, (_key, value: unknown) => {
            if (isNonSerializable(value)) {
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
            ? keyBuilder(func as (...args: unknown[]) => Promise<unknown>, ...args)
            : keyBuilder;

        if (registry.has(identifier)) {
            return registry.get(identifier) as Promise<TResult>;
        }

        const raw = func(...args);
        let cancelTtl: (() => void) | undefined;
        // `let` so the timer callback closes over the variable, not its initial value.
        let tracked: Promise<TResult> = raw;

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
            tracked = Promise.race([raw, ttlPromise]);
        }

        // Evict the oldest (first-inserted) entry when the registry is at capacity.
        // Map preserves insertion order, so the first key is always the oldest.
        if (maxSize !== undefined && registry.size >= maxSize) {
            const [oldest] = registry.keys();
            registry.delete(oldest!);
        }

        registry.set(identifier, tracked);

        try {
            return await tracked;
        } finally {
            cancelTtl?.();
            if (registry.get(identifier) === tracked) {
                registry.delete(identifier);
            }
        }
    }

    Object.defineProperty(recyclable, 'pendingCount', {
        get: () => registry.size,
        enumerable: true,
    });

    return recyclable as RecyclableWrappedFunction<TArgs, TResult>;
}
