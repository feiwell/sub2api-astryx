// Exercise the built image against a loopback fixture, without a Sub2API account.
// Usage: node deploy/smoke.mjs [frontend-port] [fixture-port]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';

const frontend = 'http://127.0.0.1:' + (process.argv[2] || '8080');
const fixturePort = Number(process.argv[3] || '18081');
const qpsPath = '/api/v1/admin/ops/ws/qps';
const adminProtocol = 'sub2api-admin';
const websocketProtocols = [adminProtocol, 'routing-check'];
const streamPath = '/v1/chat/completions?stream=1';
const get = (path, options) => fetch(frontend + path, { signal: AbortSignal.timeout(5000), ...options });
let finishStream;

const backend = createServer(async (req, res) => {
    if (req.url === streamPath) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: ready\n\n');
        finishStream = () => res.end('data: done\n\n');
        return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    res.writeHead(req.url === '/api/v1/missing' ? 404 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        url: req.url,
        method: req.method,
        body: Buffer.concat(chunks).toString(),
        signature: req.headers['stripe-signature'],
    }));
});

backend.on('upgrade', (req, socket) => {
    const offered = req.headers['sec-websocket-protocol']?.split(/\s*,\s*/);
    if (req.url !== qpsPath || offered?.join(',') !== websocketProtocols.join(',')) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
    }
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(['HTTP/1.1 101 Switching Protocols', 'Connection: Upgrade', 'Upgrade: websocket',
        'Sec-WebSocket-Accept: ' + accept, 'Sec-WebSocket-Protocol: ' + adminProtocol, '', ''].join('\r\n'));
    socket.end(Buffer.from([0x81, 2, 0x6f, 0x6b, 0x88, 0])); // Text frame “ok”, then close.
});

backend.listen(fixturePort, '127.0.0.1');
await once(backend, 'listening');
try {
    const nonces = new Set();
    let assetPath;
    const spaRoutes = [
        '/', '/', // Consecutive requests to the same URL must get different nonces.
        '/index.html', '/dashboard', '/admin/ops', '/setup',
        '/auth/callback', '/auth/oidc/callback?state=example', '/auth/wechat/payment/callback',
        '/payment/result', '/payment/airwallex', '/oauth/mcp/authorize',
    ];
    for (const route of spaRoutes) {
        const response = await get(route);
        assert.equal(response.status, 200, route);
        assert.equal(response.headers.get('cache-control'), 'no-store', route);
        const html = await response.text();
        assert.match(html, /id="root"/, route);
        assert.ok(!html.includes('__CSP_NONCE_VALUE__'), route);
        const nonce = html.match(/<script\b[^>]*\bnonce="([A-Za-z0-9+/]+={0,2})"/)?.[1];
        assert.ok(nonce && Buffer.from(nonce, 'base64').length === 16, route);
        assert.ok(!nonces.has(nonce), 'Nonce reused for ' + route);
        nonces.add(nonce);
        const csp = response.headers.get('content-security-policy') || '';
        assert.ok(csp.includes("'nonce-" + nonce + "'"), route);
        assert.ok(csp.includes(frontend.replace('http:', 'ws:')), route);
        assetPath = html.match(/\bsrc="(\/assets\/[^" ]+\.js)"/)?.[1];
    }
    assert.ok(assetPath, 'Entry module URL');
    const module = await get(assetPath);
    assert.equal(module.status, 200);
    assert.match(module.headers.get('content-type'), /javascript/);
    assert.match(module.headers.get('cache-control'), /immutable/);
    await module.body.cancel();
    for (const path of ['/licenses/', '/licenses/THIRD_PARTY_NOTICES.md', '/licenses/bundled-dependencies.md']) {
        const document = await get(path);
        assert.equal(document.status, 200, path);
        await document.body.cancel();
    }
    const notice = await get('/licenses/licenses/astryx-MIT.txt');
    assert.equal(notice.status, 200);
    assert.match(await notice.text(), /MIT License|Permission is hereby granted/i);
    for (const path of ['/assets/missing.js', '/missing.svg', '/licenses/missing']) {
        assert.equal((await get(path)).status, 404, path);
    }

    const backendPaths = [
        '/api/v1/settings/public', '/api/v1/auth/oauth/oidc/callback?code=example',
        '/api/v1/auth/oauth/google/callback?code=example', '/setup/status', '/health',
        '/.well-known/oauth-protected-resource/api/v1/mcp', '/v1/models', '/v1beta/models',
        '/backend-api/codex/models', '/antigravity/models', '/responses', '/models/example',
        '/images/generations', '/v3/contents/generations/tasks',
    ];
    for (const path of backendPaths) {
        assert.equal((await (await get(path)).json()).url, path, path);
    }
    const webhook = '/api/v1/payment/webhook/stripe?event=example';
    const body = '{ "example": true }\n';
    const signature = 'routing-check';
    const posted = await get(webhook, {
        method: 'POST', body, headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature },
    });
    assert.deepEqual(await posted.json(), { url: webhook, method: 'POST', body, signature });
    const missing = await get('/api/v1/missing');
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).url, '/api/v1/missing');

    const stream = await get(streamPath, { method: 'POST' });
    const reader = stream.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /data: ready/);
    finishStream();
    finishStream = undefined;
    await reader.cancel();

    const ws = new WebSocket(frontend.replace('http:', 'ws:') + qpsPath, websocketProtocols);
    const [message] = await once(ws, 'message', { signal: AbortSignal.timeout(5000) });
    assert.equal(ws.protocol, adminProtocol);
    assert.equal(message.data, 'ok');
    console.log('Passed SPA, nonce, cache, assets, notices, backend, callbacks, streaming and WebSocket checks.');
} finally {
    finishStream?.();
    backend.close();
    backend.closeAllConnections();
}
