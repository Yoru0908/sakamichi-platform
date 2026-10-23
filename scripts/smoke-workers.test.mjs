import assert from 'node:assert/strict';
import test from 'node:test';
import { checks, inspectResponse } from './smoke-workers.mjs';

test('smoke refuses parked HTML 200, challenge responses and wrong JSON shapes', async () => {
  const works = checks.find(check => check.name === 'community works');
  assert.equal((await inspectResponse(new Response('<html>parking</html>', { headers: { 'Content-Type': 'text/html' } }), works)).ok, false);
  const challenge = await inspectResponse(new Response('<html>challenge</html>', { status: 403, headers: { 'Content-Type': 'text/html', 'cf-mitigated': 'challenge' } }), works);
  assert(challenge.issues.includes('Cloudflare challenge; API result not verified'));
  for (const body of [{}, { success: true }, { success: true, data: {} }, { success: false, data: { works: [] } }]) {
    assert.equal((await inspectResponse(Response.json(body), works)).ok, false);
  }
  assert.equal((await inspectResponse(Response.json({ success: true, data: { works: [] } }), works)).ok, true);
});

test('smoke requires the expected unauthenticated response and sends JSON for write probes', async () => {
  const sync = checks.find(check => check.name === 'discord sync no auth');
  assert.equal(sync.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(sync.init.body), {});
  assert.equal((await inspectResponse(Response.json({ success: false, error: 'unauthorized' }, { status: 401 }), sync)).ok, true);
  assert.equal((await inspectResponse(Response.json({ success: false, error: 'json required' }, { status: 415 }), sync)).ok, false);
  assert.equal((await inspectResponse(Response.json({ success: false }, { status: 401 }), sync)).ok, false);
});
