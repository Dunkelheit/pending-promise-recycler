'use strict';

/**
 * @module pending-promise-recycler
 */

const registry = new Map();

/**
 * Build a default registry key for a given function and its arguments.
 *
 * @param {function} func - The function.
 * @param {...*} args - Arguments to <code>func</code>.
 * @returns {string} A registry key.
 */
function defaultKeyBuilder(func, ...args) {
    return `${func.name || 'anonymous'}-${args.join('-')}`;
}

/**
 * Default set of options.
 *
 * @type {object}
 * @property {function} [keyBuilder={@link module:pending-promise-recycler~defaultKeyBuilder}] - Function to build
 * registry keys.
 */
const defaultOptions = {
    keyBuilder: defaultKeyBuilder
};

/**
 * Magic happens here.
 *
 * @param {function} func - Any function to recycle.
 * @param {object} [options={@link module:pending-promise-recycler~defaultOptions}] - Options.
 * @returns {function(...*): Promise<*>}
 */
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
