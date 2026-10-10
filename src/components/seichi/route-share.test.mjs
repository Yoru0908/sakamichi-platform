import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeRoute, decodeRoute, buildShareUrl, routeLetter, ROUTE_PARAM } from './route-share.ts';

test('encode → decode keeps order, mode and non-ASCII keys', () => {
  const keys = ['fumi-article:60086133:蔦温泉', 'abc:139.123456,35.654321', 'yamakawa-ui/あらあらかしこ'];
  assert.deepEqual(decodeRoute(encodeRoute(keys, 'walking')), { keys, mode: 'walking' });
});

test('the encoded value is URL safe', () => {
  assert.match(encodeRoute(['日本語/?&=+ keys'], 'transit'), /^[A-Za-z0-9_-]+$/);
});

test('garbage, wrong version, unknown mode and oversize input → null, never throws', () => {
  for (const bad of [null, undefined, '', '!!!', 'e30', 'a'.repeat(5000), encodeRoute([], 'transit')]) {
    assert.equal(decodeRoute(bad), null);
  }
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  assert.equal(decodeRoute(b64({ v: 2, m: 'transit', k: ['a'] })), null);
  assert.equal(decodeRoute(b64({ v: 1, m: 'rocket', k: ['a'] })), null);
  assert.equal(decodeRoute(b64({ v: 1, m: 'transit', k: 'a' })), null);
});

test('non-string / empty / overlong / duplicate keys are dropped and the list is capped', () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const k = ['a', 1, '', 'x'.repeat(201), 'a', null, 'b'];
  assert.deepEqual(decodeRoute(b64({ v: 1, m: 'driving', k })), { keys: ['a', 'b'], mode: 'driving' });
  const many = Array.from({ length: 30 }, (_, i) => `k${i}`);
  assert.equal(decodeRoute(b64({ v: 1, m: 'transit', k: many }), 12).keys.length, 12);
});

test('share URL carries only the route param on the given path', () => {
  const url = new URL(buildShareUrl('https://46log.com', '/seichi/sakurazaka', ['a'], 'transit'));
  assert.equal(url.pathname, '/seichi/sakurazaka');
  assert.deepEqual([...url.searchParams.keys()], [ROUTE_PARAM]);
});

test('letters A.. then numbers after Z', () => {
  assert.equal(routeLetter(0), 'A');
  assert.equal(routeLetter(7), 'H');
  assert.equal(routeLetter(26), '27');
});
