'use strict';

const crypto = require('crypto');

const registry = new Map();

function defaultKeyBuilder(func, ...args) {
    return `${func.name || 'anonymous'}-${crypto.createHash('sha256').update(JSON.stringify(args)).digest('hex')}`;
}

const defaultOptions = {
    keyBuilder: defaultKeyBuilder
};

module.exports = function recycle(func, options = {}) {
    return async function (...args) {
        options = { ...defaultOptions, ...options };
        const identifier = typeof options.keyBuilder === 'function'
            ? options.keyBuilder(func, ...args) : options.keyBuilder;
        if (registry.has(identifier)) {
            return registry.get(identifier);
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
};
