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

function defaultKeyBuilder(func: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]): string {
    try {
        return `${func.name || 'anonymous'}-${createHash('sha256').update(JSON.stringify(args)).digest('hex')}`;
    } catch {
        const name = func.name || 'anonymous';
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

    async function recyclable(...args: TArgs): Promise<TResult> {
        const keyBuilder = options.keyBuilder ?? defaultKeyBuilder;
        const identifier = typeof keyBuilder === 'function'
            ? keyBuilder(func as (...args: unknown[]) => Promise<unknown>, ...args) : keyBuilder;

        if (registry.has(identifier)) {
            return registry.get(identifier) as Promise<TResult>;
        }

        const res = func(...args);
        registry.set(identifier, res);

        let ttlTimer: ReturnType<typeof setTimeout> | undefined;
        if (options.ttl !== undefined) {
            ttlTimer = setTimeout(() => {
                if (registry.get(identifier) === res) {
                    registry.delete(identifier);
                }
            }, options.ttl);
        }

        try {
            await res;
        } finally {
            clearTimeout(ttlTimer);
            if (registry.get(identifier) === res) {
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
