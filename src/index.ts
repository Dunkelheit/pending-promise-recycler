import { createHash } from 'node:crypto';

export type RecyclableFunction<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

export type KeyBuilderFunction = (func: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) => string;

export interface RecycleOptions {
    keyBuilder?: KeyBuilderFunction | string;
}

const registry = new Map<string, Promise<unknown>>();

function defaultKeyBuilder(func: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]): string {
    return `${func.name || 'anonymous'}-${createHash('sha256').update(JSON.stringify(args)).digest('hex')}`;
}

export { registry as _registry };

export default function recycle<TArgs extends unknown[], TResult>(
    func: RecyclableFunction<TArgs, TResult>,
    options: RecycleOptions = {}
): RecyclableFunction<TArgs, TResult> {
    return async function (...args: TArgs): Promise<TResult> {
        const keyBuilder = options.keyBuilder ?? defaultKeyBuilder;
        const identifier = typeof keyBuilder === 'function'
            ? keyBuilder(func as (...args: unknown[]) => Promise<unknown>, ...args) : keyBuilder;
        if (registry.has(identifier)) {
            return registry.get(identifier) as Promise<TResult>;
        }
        const res = func(...args);
        registry.set(identifier, res);
        try {
            await res;
        } finally {
            registry.delete(identifier);
        }
        return res;
    };
}
