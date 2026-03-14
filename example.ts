import http from 'node:http';

import recycle, { PromiseTimeoutError } from './src/index.js';

const log = console.log;

// ---------------------------------------------------------------------------
// A simple HTTP server that takes 1200 ms to respond
// ---------------------------------------------------------------------------

const server = http.createServer((_req, res) => {
    log('[server] Incoming request... delaying response by 1200 ms.');
    setTimeout(() => {
        log('[server] Responding!');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ foo: 'bar' }));
    }, 1200);
});

async function get(): Promise<string> {
    return new Promise((resolve, reject) => {
        log('[client] Fetching...');
        http.get('http://localhost:8000', res => {
            let data = '';
            res.on('data', chunk => {
                data += chunk;
            });
            res.on('end', () => {
                log('[client] Received response:', data);
                resolve(data);
            });
        }).on('error', err => {
            log('[client] An error occurred!', err);
            reject(err);
        });
    });
}

server.listen(8000);

(async function () {
    // ---------------------------------------------------------------------------
    // Example 1: Basic recycling — 1000 concurrent callers, one HTTP request
    // ---------------------------------------------------------------------------
    log('\n[example 1] Wrapping the get() function with recycle()...');
    const recyclableGet = recycle(get, { keyBuilder: 'get-foo-bar' });

    log('[example 1] Calling recyclable function 1000 times concurrently...');
    log('[example 1] pendingCount before:', recyclableGet.pendingCount); // 0

    console.time('1000 promises');
    const promise = Promise.all(Array.from({ length: 1000 }, () => recyclableGet()));
    log('[example 1] pendingCount during:', recyclableGet.pendingCount); // 1 — only one in-flight entry
    const responses = await promise;
    console.timeEnd('1000 promises');

    log('[example 1] pendingCount after:', recyclableGet.pendingCount); // 0
    log('[example 1] Distinct responses:', new Set(responses).size, '(all identical)');

    // ---------------------------------------------------------------------------
    // Example 2: TTL — all in-flight callers are rejected with PromiseTimeoutError
    // ---------------------------------------------------------------------------
    log('\n[example 2] Demonstrating TTL rejection...');

    const neverSettles = recycle(
        () => new Promise<string>(() => { /* intentionally never resolves */ }),
        { keyBuilder: 'stuck', ttl: 500 }
    );

    log('[example 2] pendingCount before call:', neverSettles.pendingCount); // 0

    try {
        const p = neverSettles();
        log('[example 2] pendingCount during call:', neverSettles.pendingCount); // 1
        await p; // rejects with PromiseTimeoutError after 500 ms
    } catch (err) {
        if (err instanceof PromiseTimeoutError) {
            log('[example 2] Caught PromiseTimeoutError — TTL elapsed while promise was pending.');
            log('[example 2] pendingCount after TTL:', neverSettles.pendingCount); // 0 — evicted
        }
    }

    server.close();
})();
