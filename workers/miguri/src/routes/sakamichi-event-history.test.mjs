import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { signAccessToken } from '../../../shared/jwt.ts';
import { handleGetSakamichiHistory, handleSakamichiEventMemo, handleSakamichiEventProfile, handleGetSakamichiRanking, handleSetSakamichiEventMark } from './sakamichi-events.ts';
const now = new Date('2026-10-23T00:00:00Z'), secret = 'history-test-secret';
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['014_sakamichi_event_marks.sql', '015_sakamichi_event_history.sql']) sqlite.exec(readFileSync(new URL(`../../../auth/src/db/migrations/${name}`, import.meta.url), 'utf8'));
  const db = { prepare(sql) {
    let values = []; const statement = { bind(...args) { values = args; return statement; },
      async first() { const row = sqlite.prepare(sql).get(...values); return row ? { ...row } : null; },
      async all() { return { results: sqlite.prepare(sql).all(...values).map(row => ({ ...row })) }; },
      async run() { return sqlite.prepare(sql).run(...values); } }; return statement;
  } };
  return { sqlite, MIGURI_DB: db, JWT_SECRET: secret, EVENTS_READ_TOKEN: 'read-only', SAKA46LOG: { fetch: async () => { throw Error('History must not call the source'); } } };
}
const id = '12161_18:2026-10-18';
function insert(env, user, event = id, date = '2026-10-18') { env.sqlite.prepare('INSERT OR IGNORE INTO sakamichi_event_marks VALUES(?,?,?,?,?,?)').run(user, event, event.startsWith('h_') ? 'hinatazaka' : 'sakurazaka', date, 'Saved official title', now.getTime()); }
async function request(user, method = 'GET', body, path = '') { return new Request(`https://api.46log.com/api/miguri/sakamichi-events${path}`, { method, headers: { ...(user ? { Cookie: `access_token=${await signAccessToken(user, 'member', secret)}` } : {}), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
const memo = async (env, user, method = 'GET', body, event = id) => handleSakamichiEventMemo(await request(user, method, body), env, encodeURIComponent(event), now);
const profile = async (env, user, body) => handleSakamichiEventProfile(await request(user, body ? 'PUT' : 'GET', body), env, now);
const ranking = async (env, query = '') => handleGetSakamichiRanking(await request(null, 'GET', undefined, `/ranking${query}`), env, now);

test('all personal endpoints require authentication and scopes come from the signed token', async () => {
  const env = setup(); insert(env, 'a');
  assert.equal((await handleGetSakamichiHistory(await request(null), env, now)).status, 401);
  assert.equal((await memo(env, null)).status, 401);
  assert.equal((await memo(env, null, 'PATCH', { note: 'private', cost: {} })).status, 401);
  assert.equal((await profile(env, null, { public: true, name: 'x' })).status, 401);
  assert.equal((await memo(env, 'b', 'PATCH', { note: 'foreign', cost: {}, expectedUpdatedAt: null })).status, 404);
  assert.deepEqual((await (await handleGetSakamichiHistory(await request('b', 'GET', undefined, '/history?user_id=a'), env, now)).json()).data.records, []);
});
test('owner memo saves and reads back, remains private, and survives cancellation and re-add', async () => {
  const env = setup(); insert(env, 'a'); insert(env, 'b');
  const value = { note: '  私的な感想  ', cost: { ticket: 9800, travel: 0 }, expectedUpdatedAt: null };
  assert.equal((await memo(env, 'a', 'PATCH', value)).status, 200);
  const got = await (await memo(env, 'a')).json();
  assert.deepEqual(got.data.memo, { note: '私的な感想', cost: { ticket: 9800, travel: 0 } });
  assert.deepEqual((await (await memo(env, 'b')).json()).data.memo, { note: '', cost: {} });
  await handleSetSakamichiEventMark(await request('a', 'DELETE'), env, encodeURIComponent(id), false, now);
  assert.equal((await (await memo(env, 'a')).json()).data.marked, false);
  assert.equal((await memo(env, 'a', 'PATCH', { note: 'not marked', cost: {}, expectedUpdatedAt: got.data.updatedAt })).status, 404);
  insert(env, 'a');
  assert.equal((await (await memo(env, 'a')).json()).data.memo.note, '私的な感想');
  const response = await handleGetSakamichiHistory(await request('a'), env, now);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const history = (await response.json()).data;
  assert.equal(history.records[0].title, 'Saved official title');
  assert.equal(history.records[0].sourceStatus, 'saved-snapshot');
  assert.equal(history.summary.totalYen, 9800);
});
test('invalid input, oversized body, unknown fields and bad ids cannot mutate a memo', async () => {
  const env = setup(); insert(env, 'a');
  for (const value of [{ note: 'x'.repeat(4001), cost: {} }, { note: '', cost: { ticket: -1 } }, { note: '', cost: { ticket: 1.2 } }, { note: '', cost: { ticket: '100' } }, { note: '', cost: {}, user_id: 'b' }]) assert.equal((await memo(env, 'a', 'PATCH', { ...value, expectedUpdatedAt: null })).status, 400);
  assert.equal((await memo(env, 'a', 'PATCH', { note: 'x'.repeat(21000), cost: {}, expectedUpdatedAt: null })).status, 400);
  assert.equal((await memo(env, 'a', 'GET', undefined, 'invalid')).status, 400);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM sakamichi_event_memos').get().n, 0);
});
test('ranking is opt-in by construction, counts unique dates, excludes plans and removes opted-out users immediately', async () => {
  const env = setup(); insert(env, 'private'); insert(env, 'a'); insert(env, 'a', 'h_10:2026-10-18'); insert(env, 'a', '999:2026-10-24', '2026-10-24'); insert(env, 'b');
  assert.deepEqual((await (await profile(env, 'a')).json()).data, { public: false, name: '' });
  assert.deepEqual((await (await ranking(env)).json()).data.ranking, []);
  assert.equal((await profile(env, 'a', { public: true, name: '' })).status, 400);
  await profile(env, 'a', { public: true, name: '公開A' }); await profile(env, 'b', { public: true, name: '公開B' });
  await memo(env, 'a', 'PATCH', { note: 'never public', cost: { ticket: 10000 }, expectedUpdatedAt: null });
  let response = await ranking(env); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const data = (await response.json()).data.ranking;
  assert.deepEqual(data, [{ rank: 1, name: '公開A', days: 1, events: 2 }, { rank: 1, name: '公開B', days: 1, events: 1 }]);
  assert(!JSON.stringify(data).includes('never public')); assert(!JSON.stringify(data).includes('user_id'));
  // Per group: only that group's events count; a group nobody attended is an empty list, an unknown group is refused.
  assert.deepEqual((await (await ranking(env, '?grp=hinatazaka')).json()).data.ranking, [{ rank: 1, name: '公開A', days: 1, events: 1 }]);
  assert.deepEqual((await (await ranking(env, '?grp=sakurazaka')).json()).data.ranking, [{ rank: 1, name: '公開A', days: 1, events: 1 }, { rank: 1, name: '公開B', days: 1, events: 1 }]);
  assert.deepEqual((await (await ranking(env, '?grp=nogizaka')).json()).data.ranking, []);
  for (const bad of ['?grp=', '?grp=keyakizaka', '?grp=__proto__']) assert.equal((await ranking(env, bad)).status, 400, bad);
  await profile(env, 'a', { public: false, name: '公開A' });
  assert.deepEqual((await (await ranking(env)).json()).data.ranking.map(r => r.name), ['公開B']);
  assert.deepEqual((await (await ranking(env, '?grp=hinatazaka')).json()).data.ranking, []);
});

test('stale editors cannot overwrite newer notes or costs, including two updates in the same millisecond', async () => {
  const env = setup(); insert(env, 'a');
  const initial = await (await memo(env, 'a', 'PATCH', { note: 'original', cost: { ticket: 100 }, expectedUpdatedAt: null })).json();
  const version = initial.data.updatedAt;
  assert.equal(version, now.getTime());
  const first = await (await memo(env, 'a', 'PATCH', { note: 'editor A new note', cost: { ticket: 100 }, expectedUpdatedAt: version })).json();
  assert.equal(first.data.updatedAt, version + 1, 'same-ms update still advances the version');
  const second = await memo(env, 'a', 'PATCH', { note: 'original', cost: { ticket: 200 }, expectedUpdatedAt: version });
  assert.equal(second.status, 409); assert.equal((await second.json()).error, 'memo_conflict');
  const kept = (await (await memo(env, 'a')).json()).data;
  assert.deepEqual(kept.memo, { note: 'editor A new note', cost: { ticket: 100 } });
  assert.equal(kept.updatedAt, version + 1);
  const merged = await (await memo(env, 'a', 'PATCH', { note: kept.memo.note, cost: { ticket: 200 }, expectedUpdatedAt: kept.updatedAt })).json();
  assert.equal(merged.data.updatedAt, version + 2);
  assert.deepEqual(merged.data.memo, { note: 'editor A new note', cost: { ticket: 200 } });
});

test('concurrent first saves with null version create exactly one memo, and numeric versions never create missing memos', async () => {
  const env = setup(); insert(env, 'a');
  assert.equal((await memo(env, 'a', 'PATCH', { note: 'missing', cost: {}, expectedUpdatedAt: 123 })).status, 409);
  const replies = await Promise.all(['first', 'second'].map(note => memo(env, 'a', 'PATCH', { note, cost: {}, expectedUpdatedAt: null })));
  assert.deepEqual(replies.map(res => res.status).sort(), [200, 409]);
  const winner = await replies.find(res => res.status === 200).json();
  const after = (await (await memo(env, 'a')).json()).data;
  assert.deepEqual(after.memo, winner.data.memo);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM sakamichi_event_memos').get().n, 1);
  assert.equal((await memo(env, 'a', 'PATCH', { note: 'third', cost: {}, expectedUpdatedAt: null })).status, 409);
});

test('transport version is required and strictly validated without changing the portable memo contract', async () => {
  const env = setup(); insert(env, 'a');
  for (const value of [undefined, '123', -1, 1.5, Number.MAX_SAFE_INTEGER, {}, []]) {
    assert.equal((await memo(env, 'a', 'PATCH', { note: 'x', cost: {}, expectedUpdatedAt: value })).status, 400);
  }
  assert.equal((await memo(env, 'a', 'PATCH', { note: 'x', cost: {}, expectedUpdatedAt: null, user_id: 'b' })).status, 400);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) n FROM sakamichi_event_memos').get().n, 0);
});
test('history pagination preserves all records and summary is for the full history, not just the page', async () => {
  const env = setup();
  for (let i = 0; i < 104; i++) insert(env, 'a', `${i}:2026-10-18`);
  const first = (await (await handleGetSakamichiHistory(await request('a'), env, now)).json()).data;
  assert.equal(first.records.length, 100); assert.equal(first.nextOffset, 100); assert.equal(first.summary.records, 104); assert.equal(first.summary.attendedDays, 1);
  const last = (await (await handleGetSakamichiHistory(await request('a', 'GET', undefined, '/history?offset=100'), env, now)).json()).data;
  assert.equal(last.records.length, 4); assert.equal(last.nextOffset, null);
  assert.equal(new Set([...first.records, ...last.records].map(r => r.id)).size, 104);
});
