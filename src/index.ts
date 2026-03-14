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
        let hasLossyValue = false;
        const serialized = JSON.stringify(args, (_key, value: unknown) => {
            if (
                typeof value === 'undefined' ||
                typeof value === 'function' ||
                typeof value === 'symbol'
            ) {
                hasLossyValue = true;
            }
            return value;
        });
        if (hasLossyValue) {
            throw new TypeError('arguments contain a non-JSON-serializable value');
        }
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
    const keyBuilder = options.keyBuilder ?? defaultKeyBuilder;
    const ttl = options.ttl;

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
        let tracked: Promise<TResult> = res;

        if (ttl !== undefined) {
            tracked = Promise.race([
                res,
                new Promise<never>((_, reject) => {
                    const timer = setTimeout(() => {
                        if (registry.get(identifier) === tracked) {
                            registry.delete(identifier);
                        }
                        reject(new PromiseTimeoutError(ttl));
                    }, ttl);
                    cancelTtl = () => clearTimeout(timer);
                }),
            ]);
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
