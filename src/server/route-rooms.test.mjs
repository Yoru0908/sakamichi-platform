import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleRouteRooms, ROOM_SCHEMA } from './route-rooms.ts';

// node:sqlite を D1 の形に包む（prepare/bind/first/run）。
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(ROOM_SCHEMA);
  return {
    raw: db,
    prepare: (sql) => ({
      bind: (...v) => ({
        first: async () => db.prepare(sql).get(...v) ?? null,
        run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...v).changes) } }),
      }),
    }),
  };
}
const req = (method, body) => new Request('https://x.test/api/route-rooms', { method, body: body === undefined ? undefined : JSON.stringify(body) });
const call = async (db, method, sub, body, opts) => { const r = await handleRouteRooms(req(method, body), db, sub, opts); return [r.status, await r.json()]; };

test('no database → 503 (frontend hides the feature)', async () => {
  const [status] = await call(undefined, 'GET', '/_');
  assert.equal(status, 503);
});

test('create → get → update bumps the version', async () => {
  const db = d1();
  const [s1, created] = await call(db, 'POST', '', { keys: ['a', 'b'], mode: 'walking', title: ' 鎌倉 ' });
  assert.equal(s1, 201);
  assert.match(created.id, /^[a-z2-9]{10}$/);
  const [, got] = await call(db, 'GET', `/${created.id}`);
  assert.deepEqual([got.keys, got.mode, got.title, got.version], [['a', 'b'], 'walking', '鎌倉', 1]);
  const [s2, upd] = await call(db, 'PUT', `/${created.id}`, { keys: ['b', 'a', 'c'], mode: 'transit', baseVersion: 1 });
  assert.equal(s2, 200);
  assert.equal(upd.version, 2);
});

test('stale baseVersion → 409 with the current room, nothing overwritten', async () => {
  const db = d1();
  const [, { id }] = await call(db, 'POST', '', { keys: ['a'], mode: 'transit' });
  await call(db, 'PUT', `/${id}`, { keys: ['a', 'b'], mode: 'transit', baseVersion: 1 });
  const [status, body] = await call(db, 'PUT', `/${id}`, { keys: ['z'], mode: 'transit', baseVersion: 1 });
  assert.equal(status, 409);
  assert.deepEqual([body.keys, body.version], [['a', 'b'], 2]);
});

test('rejects bad input and unknown ids', async () => {
  const db = d1();
  for (const body of [{}, { keys: [], mode: 'transit' }, { keys: ['a', 'a'], mode: 'transit' }, { keys: ['a'], mode: 'rocket' }, { keys: [1], mode: 'transit' }, { keys: Array.from({ length: 13 }, (_, i) => `k${i}`), mode: 'transit' }]) {
    assert.equal((await call(db, 'POST', '', body))[0], 400, JSON.stringify(body));
  }
  assert.equal((await call(db, 'GET', '/short'))[0], 404);
  assert.equal((await call(db, 'GET', '/abcdefghjk'))[0], 404);
  assert.equal((await call(db, 'PUT', '/abcdefghjk', { keys: ['a'], mode: 'transit', baseVersion: 1 }))[0], 404);
});

test('stops cap is per site and rooms expire lazily', async () => {
  const db = d1();
  const many = Array.from({ length: 20 }, (_, i) => `k${i}`);
  assert.equal((await call(db, 'POST', '', { keys: many, mode: 'transit' }))[0], 400);
  assert.equal((await call(db, 'POST', '', { keys: many, mode: 'transit' }, { maxStops: 30 }))[0], 201);
  db.raw.exec('UPDATE route_rooms SET updated_at = 0');
  await call(db, 'POST', '', { keys: ['a'], mode: 'transit' });
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM route_rooms').get().n, 1);
});
