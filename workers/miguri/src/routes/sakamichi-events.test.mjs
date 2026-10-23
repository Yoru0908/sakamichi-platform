import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { signAccessToken } from '../../../shared/jwt.ts';
import { SAKAMICHI_EVENTS_CACHE_REVISION } from '../../../shared/sakamichi-events-cache.ts';
import {
  eventsQuery, handleGetMySakamichiEventMarks, handleGetSakamichiEventCounts, handleGetSakamichiEvents, handleSetSakamichiEventMark, markTarget,
} from './sakamichi-events.ts';

const now = new Date('2026-10-22T12:00:00Z');
const row = {
  id: 'n_107229:2026-10-20', date: '2026-10-20', title: 'リアルミート＆グリート', kind: 'ミート＆グリート', category: 'attend',
  shows: [{ label: '', start: '18:30' }], members: [{ id: '55395', name: '中西 アルノ' }], wholeGroup: false,
  sourceUrl: 'https://www.nogizaka46.com/s/n46/media/detail/107229', venue: { id: 71, name: 'TACHIKAWA STAGE GARDEN', prefecture: '東京都' },
  attendees: 12,
};
function env(respond = () => Response.json({ ok: true, data: { events: [row] } })) {
  const calls = [];
  return { calls, EVENTS_READ_TOKEN: 'read-token', SAKA46LOG: { fetch: async (url, init) => { calls.push({ url, auth: new Headers(init?.headers).get('Authorization') }); return respond(); } } };
}
const get = (q, e, at = now) => handleGetSakamichiEvents(new Request(`https://api.46log.com/api/miguri/sakamichi-events?${q}`), e, at);

test('query: known groups from their first official year to next year only', () => {
  const q = s => eventsQuery(new URL(`https://x/?${s}`), now);
  assert.deepEqual(q('grp=nogizaka&year=2011'), { grp: 'nogizaka', year: 2011 });
  assert.deepEqual(q('grp=hinatazaka&year=2027'), { grp: 'hinatazaka', year: 2027 });
  for (const bad of ['grp=hinatazaka&year=2018', 'grp=sakurazaka&year=2019', 'grp=nogizaka&year=2028', 'grp=keyakizaka&year=2026',
    'grp=__proto__&year=2026', 'grp=toString&year=2026', 'grp=nogizaka&year=2026.5', 'grp=nogizaka', 'year=2026']) assert.equal(q(bad), null, bad);
});

test('reads one group-year through the binding with the read token; only public fields, never 坂ログ attendee counts', async () => {
  const e = env(), res = await get('grp=nogizaka&year=2026', e);
  assert.equal(res.status, 200);
  assert.deepEqual(e.calls, [{ url: 'https://saka46log.com/internal/events?grp=nogizaka&year=2026', auth: 'Bearer read-token' }]);
  const { data } = await res.json(), [ev] = data.events;
  assert.deepEqual([data.grp, data.year, data.events.length], ['nogizaka', 2026, 1]);
  assert.equal('attendees' in ev, false);
  assert.deepEqual(ev.venue, row.venue);
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=600');
  assert.equal((await get('grp=nogizaka&year=2016', env())).headers.get('Cache-Control'), 'public, max-age=600');   // partial backfills can change old years
  const empty = env(() => Response.json({ ok: true, data: { events: [] } }));
  assert.equal((await get('grp=nogizaka&year=2016', empty)).headers.get('Cache-Control'), 'public, max-age=60');   // not backfilled yet
});

test('versioned public cache ignores old 24-hour entries, reuses the new snapshot, and refreshes within 10 minutes', async t => {
  const entries = new Map(), oldUrl = 'https://api.46log.com/api/miguri/sakamichi-events?grp=nogizaka&year=2012';
  let time = 0, source = [{ ...row, id: 'n_1:2012-01-01', date: '2012-01-01' }];
  entries.set(oldUrl, { response: Response.json({ success: true, data: { events: [] } }, { headers: { 'Cache-Control': 'public, max-age=86400' } }), expiry: 86400 });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    async match(key) { const item = entries.get(key.url); return item && item.expiry > time ? item.response.clone() : undefined; },
    async put(key, response) { entries.set(key.url, { response: response.clone(), expiry: time + Number(response.headers.get('Cache-Control').match(/max-age=(\d+)/)[1]) }); },
  } } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'caches', original); else delete globalThis.caches; });
  const e = env(() => Response.json({ data: { events: source } }));
  const first = await get('grp=nogizaka&year=2012&revision=untrusted', e);
  assert.equal((await first.json()).data.events.length, 1, 'must not read the old 86400-second entry');
  assert(entries.has(`${oldUrl}&revision=${SAKAMICHI_EVENTS_CACHE_REVISION}`));
  source = [...source, { ...row, id: 'n_2:2012-04-01', date: '2012-04-01' }];
  time = 599;
  assert.equal((await (await get('grp=nogizaka&year=2012', e)).json()).data.events.length, 1);
  assert.equal(e.calls.length, 1, 'same group-year reuses the bounded cache despite caller query noise');
  time = 600;
  assert.equal((await (await get('grp=nogizaka&year=2012', e)).json()).data.events.length, 2);
  assert.equal(e.calls.length, 2);
  assert.equal((await get('grp=hinatazaka&year=2020', e)).headers.get('Cache-Control'), 'public, max-age=600');
  assert.equal((await get('grp=sakurazaka&year=2020', e)).headers.get('Cache-Control'), 'public, max-age=600');
});

test('bad query 400 (no upstream call), unconfigured 503, upstream failure 502', async () => {
  const e = env();
  assert.equal((await get('grp=nogizaka&year=2010', e)).status, 400);
  assert.equal(e.calls.length, 0);
  assert.equal((await get('grp=nogizaka&year=2026', { SAKA46LOG: e.SAKA46LOG })).status, 503);
  assert.equal((await get('grp=nogizaka&year=2026', env(() => new Response('no', { status: 401 })))).status, 502);
});

// D1 stand-in on node:sqlite with the real migration (014), so the SQL itself is under test.
function miguriDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../../auth/src/db/migrations/014_sakamichi_event_marks.sql', import.meta.url), 'utf8'));
  const plain = (r) => ({ ...r });
  return {
    db,
    prepare(sql) {
      let args = [];
      const st = { bind: (...a) => { args = a; return st; }, all: async () => ({ results: db.prepare(sql).all(...args).map(plain) }),
        first: async () => { const r = db.prepare(sql).get(...args); return r ? plain(r) : null; }, run: async () => db.prepare(sql).run(...args) };
      return st;
    },
  };
}
const SECRET = 'test-secret';
async function as(userId) { return `access_token=${await signAccessToken(userId, 'member', SECRET)}`; }
function marksEnv() { return { ...env(), MIGURI_DB: miguriDb(), JWT_SECRET: SECRET }; }
const call = (handler, path, e, cookie, ...rest) => handler(new Request(`https://api.46log.com/api/miguri/sakamichi-events${path}`, { headers: cookie ? { Cookie: cookie } : {} }), e, ...rest, now);
const mark = (e, cookie, id, on = true) => call(handleSetSakamichiEventMark, `/marks/${encodeURIComponent(id)}`, e, cookie, encodeURIComponent(id), on);

test('event ids map to their group and year; anything else is refused', () => {
  assert.deepEqual(markTarget('n_107229%3A2026-10-20', now), { id: 'n_107229:2026-10-20', grp: 'nogizaka', year: 2026 });
  assert.deepEqual(markTarget('h_5355:2021-10-20', now), { id: 'h_5355:2021-10-20', grp: 'hinatazaka', year: 2021 });
  assert.deepEqual(markTarget('1234:2025-03-01', now), { id: '1234:2025-03-01', grp: 'sakurazaka', year: 2025 });
  assert.deepEqual(markTarget('12161_18%3A2026-10-18', now), { id: '12161_18:2026-10-18', grp: 'sakurazaka', year: 2026 });
  for (const bad of ['x/1:2026-01-01', `${'1'.repeat(33)}:2026-01-01`, '1234:2019-05-01', 'h_1:2018-01-01', 'n_1:2028-01-01', 'n_1', 'n_1:2026-1-1', "n_1:2026-01-01' OR 1", '%E0%A4%A']) assert.equal(markTarget(bad, now), null, bad);
});

test('real Sakurazaka count_day id saves, survives a fresh read, and deletes without affecting another user', async () => {
  const source = { ...row, id: '12161_18:2026-10-18', date: '2026-10-18' };
  const e = { ...marksEnv(), ...env(() => Response.json({ data: { events: [source] } })) };
  const a = await as('user-a'), b = await as('user-b');
  assert.equal((await mark(e, a, source.id)).status, 200);
  assert.equal((await mark(e, b, source.id)).status, 200);
  const mine = async cookie => (await (await call(handleGetMySakamichiEventMarks, '/marks?grp=sakurazaka&year=2026', e, cookie)).json()).data.mine;
  assert.deepEqual(await mine(a), [source.id]);
  assert.equal(e.MIGURI_DB.db.prepare('SELECT grp FROM sakamichi_event_marks WHERE user_id=?').get('user-a').grp, 'sakurazaka');
  assert.equal((await mark(e, a, '12161_19:2026-10-19')).status, 404);
  assert.equal((await mark(e, a, source.id, false)).status, 200);
  assert.deepEqual(await mine(a), []);
  assert.deepEqual(await mine(b), [source.id]);
});

test('marks need a 46log login (401, so the client refreshes its token)', async () => {
  const e = marksEnv();
  assert.equal((await call(handleGetMySakamichiEventMarks, '/marks?grp=nogizaka&year=2026', e)).status, 401);
  assert.equal((await mark(e, null, row.id)).status, 401);
  assert.equal((await mark(e, null, row.id, false)).status, 401);
  assert.equal(e.MIGURI_DB.db.prepare('SELECT COUNT(*) n FROM sakamichi_event_marks').get().n, 0);
});

test('mark a published day (twice is harmless), count it across users, unmark it', async () => {
  const e = marksEnv(), a = await as('user-a'), b = await as('user-b');
  assert.equal((await mark(e, a, row.id)).status, 200);
  assert.equal((await mark(e, a, row.id)).status, 200);
  assert.equal((await mark(e, b, row.id)).status, 200);
  const mine = async (cookie) => (await (await call(handleGetMySakamichiEventMarks, '/marks?grp=nogizaka&year=2026', e, cookie)).json()).data.mine;
  assert.deepEqual(await mine(a), [row.id]);
  const counts = await call(handleGetSakamichiEventCounts, '/counts?grp=nogizaka&year=2026', e);
  assert.deepEqual((await counts.json()).data.counts, { [row.id]: 2 });
  assert.equal(counts.headers.get('Cache-Control'), 'public, max-age=60');
  // The title is kept with the mark (history survives a renamed official row); the other year and group see nothing.
  assert.equal(e.MIGURI_DB.db.prepare('SELECT title FROM sakamichi_event_marks WHERE user_id=?').get('user-a').title, row.title);
  assert.deepEqual((await (await call(handleGetSakamichiEventCounts, '/counts?grp=nogizaka&year=2025', e)).json()).data.counts, {});
  assert.deepEqual((await (await call(handleGetSakamichiEventCounts, '/counts?grp=hinatazaka&year=2026', e)).json()).data.counts, {});
  assert.equal((await mark(e, a, row.id, false)).status, 200);
  assert.deepEqual(await mine(a), []);
  assert.deepEqual(await mine(b), [row.id]);
});

test('only days in the published list can be marked: bad id 400, unknown day 404, source down 502', async () => {
  const e = marksEnv(), a = await as('user-a');
  assert.equal((await mark(e, a, 'n_1:2010-01-01')).status, 400);
  assert.equal((await mark(e, a, 'n_999:2026-10-20')).status, 404);
  assert.equal((await mark(e, a, 'h_1:2026-10-20')).status, 404);   // a Nogizaka row never counts as a Hinatazaka id
  assert.equal(e.calls.at(-1).url, 'https://saka46log.com/internal/events?grp=hinatazaka&year=2026');
  const down = { ...marksEnv(), ...env(() => new Response('no', { status: 500 })) };
  assert.equal((await mark(down, a, row.id)).status, 502);
  assert.equal(e.MIGURI_DB.db.prepare('SELECT COUNT(*) n FROM sakamichi_event_marks').get().n, 0);
});
