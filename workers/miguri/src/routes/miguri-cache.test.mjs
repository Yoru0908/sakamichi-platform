import assert from 'node:assert/strict';
import test from 'node:test';
import { cacheSyncedEventResponse, loadEventResponse, normalizeMiguriPayload } from './miguri.ts';
import { persistMiguriSyncPayload } from './manage-miguri.ts';

function fixture(t, { kv = true, failRead = false, failWrite = false } = {}) {
  const oldCaches = globalThis.caches;
  const stats = { reads: 0, kvWrites: 0, edgeReads: 0 };
  let edge = Response.json([{ slug: 'stale-other-colo' }]);
  let payload = null;
  globalThis.caches = { default: {
    async match() { stats.edgeReads++; return edge?.clone(); },
    async put(_key, value) { edge = value.clone(); },
  } };
  t.after(() => {
    if (oldCaches === undefined) delete globalThis.caches;
    else globalThis.caches = oldCaches;
  });
  const normalized = normalizeMiguriPayload({ events: [{
    slug: 'event-1', group: 'sakurazaka', title: 'ミーグリ', sourceUrl: 'https://fortunemusic.jp/event-1/',
    saleType: 'lottery', windows: [{ label: '第1次', start: 'start', end: 'end' }],
    dates: ['2026-09-12', '2026-09-05'],
    slots: [{ slotNumber: 2, startTime: '12:00', endTime: '13:00', receptionStart: '11:45', receptionEnd: '12:45' }],
    members: ['山川 宇衣', '的野美青', '山川宇衣'],
  }] });
  const syncedAt = '2026-09-05T00:00:00Z';
  const env = { MIGURI_DB: { prepare(sql) { return { async all() {
    stats.reads++;
    if (sql.includes('FROM miguri_events')) return { results: normalized.events.map(e => ({
      slug: e.slug, group_id: e.group, title: e.title, source_url: e.sourceUrl,
      sale_type: e.saleType, synced_at: syncedAt, raw_payload: JSON.stringify(e),
    })) };
    if (sql.includes('FROM miguri_event_windows')) return { results: normalized.windows.map(w => ({
      event_slug: w.eventSlug, label: w.label, start_at: w.start, end_at: w.end,
    })) };
    if (sql.includes('FROM miguri_event_slots')) return { results: normalized.slots.map(s => ({
      event_slug: s.eventSlug, event_date: s.eventDate, slot_number: s.slotNumber,
      start_time: s.startTime, end_time: s.endTime, reception_start: s.receptionStart, reception_end: s.receptionEnd,
    })) };
    if (sql.includes('FROM miguri_slot_members')) return { results: normalized.slotMembers
      .toSorted((a, b) => a.memberName < b.memberName ? -1 : a.memberName > b.memberName ? 1 : 0)
      .map(m => ({ event_slug: m.eventSlug, event_date: m.eventDate, slot_number: m.slotNumber, member_name: m.memberName })) };
    throw new Error(sql);
  } }; } } };
  if (kv) env.MIGURI_CACHE = {
    async get() { if (failRead) throw new Error('KV offline'); return payload && JSON.parse(payload); },
    async put(key, value, options) {
      assert.equal(key, 'public:event-response:v3');
      assert.equal(options.expirationTtl, 3600);
      if (failWrite) throw new Error('KV offline');
      stats.kvWrites++;
      payload = value;
    },
  };
  return { env, stats, normalized, syncedAt, clearEdge() { edge = null; } };
}

test('KV miss ignores another colo\'s stale edge snapshot; concurrent cold requests read D1 only once', async t => {
  const { env, stats } = fixture(t);
  const results = await Promise.all(Array.from({ length: 10 }, () => loadEventResponse(env)));
  assert.equal(stats.reads, 4);
  assert.equal(stats.kvWrites, 1);
  assert.equal(stats.edgeReads, 0);
  for (const result of results) assert.equal(result[0].slug, 'event-1');
  await loadEventResponse(env);
  assert.equal(stats.reads, 4);
});

test('source-sync snapshot matches D1 output and warms KV without any additional DB reads', async t => {
  const { env, stats, normalized, syncedAt } = fixture(t);
  const expected = await loadEventResponse(env);
  const reads = stats.reads;
  await cacheSyncedEventResponse(env, normalized, syncedAt);
  assert.deepEqual(await loadEventResponse(env), expected);
  assert.equal(stats.reads, reads);
  // A later sync overwrites old events, including those no longer present.
  await cacheSyncedEventResponse(env, normalizeMiguriPayload({ events: [] }), syncedAt);
  assert.deepEqual(await loadEventResponse(env), []);
  assert.equal(stats.reads, reads);
});

test('KV read failure falls back to D1, never the stale edge snapshot', async t => {
  const { env, stats } = fixture(t, { failRead: true });
  assert.equal((await loadEventResponse(env))[0].slug, 'event-1');
  assert.equal(stats.reads, 4);
  assert.equal(stats.edgeReads, 0);
});

test('cache write failure does not fail source sync or discard a successful D1 response', async t => {
  const { env, normalized, syncedAt } = fixture(t, { failWrite: true });
  await cacheSyncedEventResponse(env, normalized, syncedAt);
  assert.equal((await loadEventResponse(env))[0].slug, 'event-1');
});

test('a rejected cold read does not poison subsequent retries', async t => {
  const { env, stats } = fixture(t);
  const originalPrepare = env.MIGURI_DB.prepare;
  env.MIGURI_DB.prepare = () => ({ async all() { throw new Error('D1 temporarily unavailable'); } });
  await assert.rejects(loadEventResponse(env), /D1 temporarily unavailable/);
  env.MIGURI_DB.prepare = originalPrepare;
  assert.equal((await loadEventResponse(env))[0].slug, 'event-1');
  assert.equal(stats.reads, 4);
});

test('failed source writes never publish a partial snapshot', async t => {
  const { env, stats, normalized } = fixture(t);
  env.MIGURI_DB = {
    prepare(sql) {
      return { sql, bind() { return this; }, async all() { return { results: [] }; } };
    },
    async batch(statements) {
      if (statements.some(s => s.sql.includes('INSERT INTO miguri_slot_members'))) {
        throw new Error('member batch failed');
      }
      return statements.map(() => ({ success: true }));
    },
  };
  await assert.rejects(persistMiguriSyncPayload(env, { events: normalized.events }), /member batch failed/);
  assert.equal(stats.kvWrites, 0);
});

test('deployments without a KV binding retain edge caching', async t => {
  const { env, stats, clearEdge } = fixture(t, { kv: false });
  clearEdge();
  const first = await loadEventResponse(env);
  assert.deepEqual(await loadEventResponse(env), first);
  assert.equal(stats.reads, 4);
  assert.equal(stats.edgeReads, 2);
});
