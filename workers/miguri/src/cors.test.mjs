import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './index.ts';

const env = { CORS_ORIGIN: 'https://46log.com,https://www.46log.com' };
const memoUrl = 'https://api.46log.com/api/miguri/sakamichi-events/memos/12161_18%3A2026-10-18';
const preflight = origin => new Request(memoUrl, { method: 'OPTIONS', headers: {
  Origin: origin,
  'Access-Control-Request-Method': 'PATCH',
  'Access-Control-Request-Headers': 'Content-Type',
} });

test('worker entrypoint permits credentialed memo PATCH preflight only for allowed origins', async () => {
  const allowed = await worker.fetch(preflight('https://46log.com'), env);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://46log.com');
  assert.equal(allowed.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert(allowed.headers.get('Access-Control-Allow-Methods').split(/,\s*/).includes('PATCH'));
  assert(allowed.headers.get('Access-Control-Allow-Headers').toLowerCase().split(/,\s*/).includes('content-type'));

  const blocked = await worker.fetch(preflight('https://untrusted.example'), env);
  assert.notEqual(blocked.headers.get('Access-Control-Allow-Origin'), 'https://untrusted.example');
  assert.notEqual(blocked.headers.get('Access-Control-Allow-Origin'), '*');
  const formWrite = await worker.fetch(new Request(memoUrl, { method: 'PATCH', headers: {
    Origin: 'https://untrusted.example', 'Content-Type': 'text/plain',
  }, body: '{}' }), env);
  assert.equal(formWrite.status, 403);
});
