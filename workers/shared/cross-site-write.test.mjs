import assert from 'node:assert/strict';
import test from 'node:test';
import { isCrossSiteWrite } from './response.ts';

const env = { CORS_ORIGIN: 'https://46log.com' };
const req = (method, origin, type) => new Request('https://api.46log.com/api/x', {
  method, headers: { ...(origin ? { Origin: origin } : {}), ...(type ? { 'Content-Type': type } : {}) }, ...(method === 'GET' ? {} : { body: 'x' }),
});

test('cross-site forms and body-less posts from foreign origins are refused', () => {
  for (const type of [null, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x'])
    assert.equal(isCrossSiteWrite(req('POST', 'https://evil.example', type), env), true, String(type));
});

test('our pages, JSON callers, server callers and reads pass', () => {
  assert.equal(isCrossSiteWrite(req('POST', 'https://46log.com', 'multipart/form-data; boundary=x'), env), false);
  assert.equal(isCrossSiteWrite(req('POST', 'https://abc.sakamichi-platform-test.pages.dev', 'text/plain'), env), false);
  assert.equal(isCrossSiteWrite(req('POST', 'chrome-extension://abcdef', 'application/json'), env), false);
  assert.equal(isCrossSiteWrite(req('POST', null, 'text/plain'), env), false);
  assert.equal(isCrossSiteWrite(req('GET', 'https://evil.example', null), env), false);
});
