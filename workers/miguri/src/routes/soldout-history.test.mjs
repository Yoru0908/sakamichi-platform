import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../index.ts';
import { handleGetMiguriSoldOut } from './miguri.ts';
import { handleGetMiguriSoldOutHistory } from './soldout-history.ts';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE miguri_events (slug TEXT PRIMARY KEY, group_id TEXT, title TEXT, source_url TEXT, status TEXT, raw_payload TEXT);
    CREATE TABLE miguri_event_slots (event_slug TEXT, event_date TEXT, slot_number INTEGER);
    CREATE TABLE miguri_slot_members (event_slug TEXT, event_date TEXT, slot_number INTEGER, member_name TEXT);
    CREATE TABLE miguri_soldout_snapshots (event_slug TEXT, round_number INTEGER, captured_at TEXT, window_label TEXT, member_count INTEGER, cell_count INTEGER);
    CREATE TABLE miguri_soldout_cells (event_slug TEXT, round_number INTEGER, event_date TEXT, slot_number INTEGER, member_name TEXT);
    INSERT INTO miguri_events VALUES
      ('old', 'hinatazaka', '17th Kind &amp; love', 'https://fortunemusic.jp/old/', 'archived', '{}'),
      ('new', 'nogizaka', '42nd', 'https://fortunemusic.jp/new/', 'active', '{"dates":["2026-11-15","2026-08-16"]}'),
      ('missing', 'sakurazaka', '14th', 'https://fortunemusic.jp/missing/', 'archived', 'invalid json');
    INSERT INTO miguri_soldout_snapshots VALUES
      ('old', 1, '2026-05-01 05:00:00', '第1次', 1, 1),
      ('old', 3, '2026-05-15 05:00:00', '第3次', 1, 1),
      ('new', 2, '2026-09-10 05:00:00', '第2次', 1, 1);
    INSERT INTO miguri_event_slots VALUES ('old', '2026-05-31', 1), ('old', '2026-06-07', 1);
    INSERT INTO miguri_slot_members VALUES ('old', '2026-05-31', 1, '小坂菜緒'), ('old', '2026-06-07', 1, '小坂菜緒');
    INSERT INTO miguri_soldout_cells VALUES ('old', 1, '2026-05-31', 1, '小坂菜緒'), ('new', 2, '2026-08-16', 1, '井上和');
  `);
  const reads = [];
  return {
    reads,
    CORS_ORIGIN: 'https://46log.com',
    get DB() { throw new Error('Catalogue must not read account data'); },
    MIGURI_DB: {
      prepare(sql) {
        assert.match(sql.trim(), /^SELECT/i, 'Public history endpoints must be read-only');
        reads.push(sql);
        const stmt = db.prepare(sql);
        let args = [];
        return {
          bind(...values) { args = values; return this; },
          async all() { return { results: stmt.all(...args) }; },
          async first() { return stmt.get(...args) || null; },
        };
      },
    },
  };
}
const request = () => new Request('https://api.46log.com/api/miguri/soldout-history');

test('real SQLite catalogue retains archived/no-snapshot events, distinguishes counts from last round, decodes titles and falls back to raw dates', async (t) => {
  const env = fixture(t);
  const response = await handleGetMiguriSoldOutHistory(request(), env);
  const { data } = await response.json();
  assert.equal(data.events.length, 3);
  const old = data.events.find((event) => event.slug === 'old');
  assert.equal(old.archived, true);
  assert.equal(old.roundCount, 2);
  assert.equal(old.latestRound, 3);
  assert.equal(old.title, '17th Kind & love');
  assert.equal(old.firstDate, '2026-05-31');
  const current = data.events.find((event) => event.slug === 'new');
  assert.equal(current.firstDate, '2026-08-16');
  assert.equal(current.lastDate, '2026-11-15');
  const missing = data.events.find((event) => event.slug === 'missing');
  assert.equal(missing.roundCount, 0);
  assert.equal(missing.latestRound, null);
  assert.equal(missing.lastCapturedAt, null);
  assert.equal(missing.firstDate, null);
  assert.equal(env.reads.length, 1);
  assert.doesNotMatch(env.reads[0], /miguri_user_entries|miguri_slot_members|miguri_soldout_cells/);
  assert.equal('raw_payload' in old, false);
});

test('public cache is shared across cookie/query variations and does not store CORS or personal data', async (t) => {
  const env = fixture(t);
  const original = globalThis.caches;
  t.after(() => { if (original === undefined) delete globalThis.caches; else globalThis.caches = original; });
  let stored;
  let key;
  globalThis.caches = { default: {
    async match(req) { if (stored) assert.equal(req.url, key); return stored?.clone(); },
    async put(req, res) { key = req.url; stored = res.clone(); },
  } };
  await handleGetMiguriSoldOutHistory(request(), env);
  const response = await handleGetMiguriSoldOutHistory(new Request(request().url + '?event=other', { headers: { Cookie: 'access_token=private' } }), env);
  assert.equal(env.reads.length, 1);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300');
  assert.equal(response.headers.get('Vary'), 'Origin');
  assert.equal(response.headers.has('Set-Cookie'), false);
  assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
});

test('cache outage falls back to D1 without failing the catalogue', async (t) => {
  const env = fixture(t);
  const original = globalThis.caches;
  t.after(() => { if (original === undefined) delete globalThis.caches; else globalThis.caches = original; });
  globalThis.caches = { default: { async match() { throw Error('unavailable'); }, async put() { throw Error('unavailable'); } } };
  assert.equal((await handleGetMiguriSoldOutHistory(request(), env)).status, 200);
});

test('Worker wires unauthenticated GET, CORS and read-only method boundary', async (t) => {
  const env = fixture(t);
  const response = await worker.fetch(new Request(request(), { headers: { Origin: 'https://46log.com' } }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://46log.com');
  assert.equal((await response.json()).data.events.length, 3);
  assert.equal((await worker.fetch(new Request(request(), { method: 'POST' }), env)).status, 404);
});

test('archived detail stays available; missing slot structure is explicitly flagged, without changing saved cells', async (t) => {
  const env = fixture(t);
  const read = async (slug) => (await (await handleGetMiguriSoldOut(new Request(`https://api.46log.com/api/miguri/soldout?event=${slug}`), env)).json()).data;
  const old = await read('old');
  assert.equal(old.rounds.length, 2);
  assert.equal(old.cells.length, 1);
  assert.equal(old.structureAvailable, true);
  assert.equal(old.memberTotals['小坂菜緒'], 2);
  const current = await read('new');
  assert.equal(current.structureAvailable, false);
  assert.equal(current.cells.length, 1);
  assert.equal(current.cells[0].member, '井上和');
});
