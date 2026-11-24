// Real frontend/backend compatibility smoke test.
// The frontend is served by nginx and every API assertion is against the
// downloaded official Sub2API process (never a fixture or a production URL).
import assert from 'node:assert/strict';

const gateway = process.env.SMOKE_URL || 'http://127.0.0.1:8080';
const backend = process.env.BACKEND_URL || 'http://127.0.0.1:18081';
const timeout = Number(process.env.SMOKE_TIMEOUT_MS || 10000);

async function request(base, path, options = {}) {
  return fetch(new URL(path, base), {
    ...options,
    signal: AbortSignal.timeout(timeout),
    headers: { Accept: 'application/json, text/html, */*', ...(options.headers || {}) },
  });
}

async function json(base, path) {
  const response = await request(base, path);
  assert.equal(response.status, 200, `${base}${path} status`);
  assert.match(response.headers.get('content-type') || '', /json/i, `${base}${path} content type`);
  return response.json();
}

async function html(path) {
  const response = await request(gateway, path);
  assert.equal(response.status, 200, `SPA route ${path}`);
  assert.match(response.headers.get('content-type') || '', /html/i, `SPA route ${path} content type`);
  const body = await response.text();
  assert.match(body, /id="root"/, `SPA root ${path}`);
  assert.ok(!body.includes('__CSP_NONCE_VALUE__'), `unexpanded nonce ${path}`);
  return body;
}

const directHealth = await json(backend, '/health');
const proxiedHealth = await json(gateway, '/health');
assert.equal(typeof directHealth, 'object', 'direct health JSON');
assert.equal(typeof proxiedHealth, 'object', 'proxied health JSON');

const directSettings = await json(backend, '/api/v1/settings/public');
const proxiedSettings = await json(gateway, '/api/v1/settings/public');
assert.equal(typeof directSettings, 'object', 'direct public settings JSON');
assert.equal(typeof proxiedSettings, 'object', 'proxied public settings JSON');
const directKeys = Object.keys(directSettings).sort();
const proxiedKeys = Object.keys(proxiedSettings).sort();
assert.deepEqual(proxiedKeys, directKeys, 'proxy must preserve public settings shape');

const routes = [
  '/', '/index.html', '/dashboard', '/admin/ops', '/setup',
  '/auth/callback', '/auth/oidc/callback?state=smoke',
];
let entryAsset;
for (const path of routes) {
  const body = await html(path);
  const asset = body.match(/<script[^>]+src="(\/assets\/[^" ]+\.js)"/)?.[1];
  assert.ok(asset, `real JS reference ${path}`);
  entryAsset ??= asset;
}
assert.ok(entryAsset, 'entry asset');
const asset = await request(gateway, entryAsset);
assert.equal(asset.status, 200, `entry asset ${entryAsset}`);
assert.match(asset.headers.get('content-type') || '', /javascript/i, 'entry asset content type');
const assetBody = await asset.text();
assert.ok(assetBody.length > 1000, 'entry asset is non-empty');

const missingAsset = await request(gateway, '/assets/this-file-must-not-exist.js');
assert.equal(missingAsset.status, 404, 'missing asset must not fall back to SPA');

console.log(JSON.stringify({
  ok: true,
  backend,
  gateway,
  checks: ['direct health', 'proxied health', 'direct public settings', 'proxied public settings', 'SPA routes', 'real JS asset'],
  entry_asset: entryAsset,
}));
