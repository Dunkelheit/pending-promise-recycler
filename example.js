'use strict';

const http = require('http');

const recycle = require('./index');

const log = console.log;

const server = http.createServer((req, res) => {
    log('[server] Incoming request... delaying response by 1200 ms.');
    setTimeout(() => {
        log('[server] Responding!');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ foo: 'bar' }));
    }, 1200);
});

async function get() {
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

(async function() {
    const recyclableGet = recycle(get, {
        keyBuilder: 'get-foo-bar'
    });
    log('[test]   Calling recyclable function 1000 times...');
    console.time('1000 promises');
    const responses = await Promise.all(Array(1000).fill(recyclableGet()));
    console.timeEnd('1000 promises');
    log('[test]   Results', responses);
    server.close();
})();
