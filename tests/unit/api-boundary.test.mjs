// Verifies the API returns explicit 503 codes for unconfigured integrations,
// and serves the public catalog endpoints. Dependency-free (node:http only).
import http from 'node:http';
import assert from 'node:assert';
import { createApp } from '../../services/api/src/server.mjs';

const unconfigured = { ready: { database: false, auth: false, payments: false, livestream: false }, port: 0 };
const app = createApp(unconfigured);

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
}

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); fail++; }
}

const srv = app.listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const port = srv.address().port;

console.log('ZOVARA api-boundary tests');
await test('healthz ok', async () => { const r = await get(port, '/healthz'); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.ok, true); });
await test('payments -> 503 PAYMENTS_NOT_CONFIGURED', async () => { const r = await get(port, '/api/payments/create'); assert.strictEqual(r.status, 503); assert.strictEqual(r.body.code, 'PAYMENTS_NOT_CONFIGURED'); });
await test('live -> 503 LIVE_NOT_CONFIGURED', async () => { const r = await get(port, '/api/live/token'); assert.strictEqual(r.status, 503); assert.strictEqual(r.body.code, 'LIVE_NOT_CONFIGURED'); });
await test('gifts catalog served (>=100)', async () => { const r = await get(port, '/api/gifts'); assert.strictEqual(r.status, 200); assert.ok(r.body.gifts.length >= 100); });
await test('recharge packages served (7)', async () => { const r = await get(port, '/api/recharge/packages'); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.packages.length, 7); });
await test('unknown route -> 404', async () => { const r = await get(port, '/api/nope'); assert.strictEqual(r.status, 404); });

srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
