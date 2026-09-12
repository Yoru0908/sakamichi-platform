import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { parseEventDetailHtml } from '../../../../src/utils/fortune-music.ts';
import { persistMiguriSyncPayload } from './manage-miguri.ts';
import { handleGetMiguriSoldOut } from './miguri.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const event = {
  slug: 'hinatazaka_test', group: 'hinatazaka', title: '18th', sourceUrl: 'https://fortunemusic.jp/hinatazaka_202609/', saleType: 'lottery',
  windows: [{ label: '第1次受付', start: '2026-09-01', end: '2026-09-02' }],
  ...parseEventDetailHtml(read('../../../../src/utils/fixtures/fortune-additional-date.html')),
};

async function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(read('../../../auth/src/db/migrations/005_miguri.sql'));
  db.exec(read('../../../auth/src/db/migrations/006_miguri_soldout.sql'));
  const env = { writes: [], cache: [], fail: false, MIGURI_CACHE: { async put(_key, value) { env.cache.push(JSON.parse(value)); } }, MIGURI_DB: {
    prepare(sql) {
      const statement = { sql, args: [], bind(...args) { this.args = args; return this; },
        async all() { return { results: db.prepare(sql).all(...this.args) }; },
        async first() { return db.prepare(sql).get(...this.args) || null; },
        async run() {
          assert.doesNotMatch(sql, /(?:INSERT INTO|DELETE FROM|UPDATE) miguri_(?:soldout|user_entries)/, 'Metadata sync must not alter observation/private tables');
          if (env.fail && sql.includes('INSERT INTO miguri_slot_members')) throw new Error('Injected insert failure');
          db.prepare(sql).run(...this.args); return { success: true };
        } };
      return statement;
    },
    async batch(statements) {
      env.writes.push(statements);
      db.exec('BEGIN');
      try { const result = []; for (const stmt of statements) result.push(await stmt.run()); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  } };
  await persistMiguriSyncPayload(env, { events: [event, { ...event, slug: 'archive-me' }] });
  db.exec(`INSERT INTO miguri_soldout_snapshots (event_slug,round_number,window_label,member_count,cell_count) VALUES ('hinatazaka_test',1,'第1次',1,1);
    INSERT INTO miguri_soldout_cells (event_slug,round_number,event_date,slot_number,member_name) VALUES ('hinatazaka_test',1,'2026-10-04',1,'小坂菜緒');
    INSERT INTO miguri_user_entries (id,user_id,event_slug,member_name,event_date,slot_number,tickets) VALUES ('private-entry','user','hinatazaka_test','森本茉莉','2026-11-29',4,1);`);
  env.writes = []; env.cache = [];
  const dump = () => JSON.stringify(['miguri_events','miguri_event_windows','miguri_event_slots','miguri_slot_members','miguri_soldout_snapshots','miguri_soldout_cells','miguri_user_entries'].map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  return { db, env, dump };
}

test('failed replacement rolls back archive/metadata/deletions across all tables and never publishes cache', async (t) => {
  const { env, dump } = await fixture(t);
  const before = dump(); env.fail = true;
  await assert.rejects(persistMiguriSyncPayload(env, { events: [{ ...event, title: 'changed' }] }), /Injected insert failure/);
  assert.equal(dump(), before);
  assert.equal(env.writes.length, 1);
  assert.equal(env.cache.length, 0);
});

test('duplicate slot or invalid special-date members is rejected before any write', async (t) => {
  const { env, dump } = await fixture(t); const before = dump();
  const invalid = { ...event, slots: [...event.slots, { ...event.slots[3], startTime: '16:01' }] };
  await assert.rejects(persistMiguriSyncPayload(env, { events: [invalid] }), /部次无效或重复/);
  await assert.rejects(persistMiguriSyncPayload(env, { events: [{ ...event, dateSchedules: [{ ...event.dateSchedules[0], members: ['未知成员'] }] }] }), /特殊日程成员/);
  assert.equal(env.writes.length, 0); assert.equal(dump(), before);
});

test('special date survives storage/cache/detail, preserves observations and can be synced repeatedly', async (t) => {
  const { db, env } = await fixture(t);
  const result = await persistMiguriSyncPayload(env, { events: [event] });
  assert.equal(result.slotCount, 40); assert.equal(result.slotMemberCount, 76);
  assert.equal(env.writes.length, 1);
  assert.equal(db.prepare("SELECT status FROM miguri_events WHERE slug='archive-me'").get().status, 'archived');
  const special = db.prepare("SELECT * FROM miguri_event_slots WHERE event_slug=? AND event_date='2026-11-29' ORDER BY slot_number").all(event.slug);
  assert.equal(special.length, 4); assert.equal(special[3].start_time, '15:30');
  assert.equal(db.prepare("SELECT start_time FROM miguri_event_slots WHERE event_slug=? AND event_date='2026-10-04' AND slot_number=4").get(event.slug).start_time, '16:00');
  const cached = env.cache.at(-1)[0].slots.filter((slot) => slot.date === '2026-11-29');
  assert.equal(cached.length, 4); assert.deepEqual(cached[3].members, ['森本茉莉']);
  const response = await handleGetMiguriSoldOut(new Request('https://api.46log.com/api/miguri/soldout?event='+event.slug), env);
  const { data } = await response.json();
  assert.equal(data.structureAvailable, true); assert.equal(data.dates.length, 7);
  assert.deepEqual(data.slotsByDate['2026-11-29'], [1,2,3,4]);
  assert.equal(data.memberTotals['小坂菜緒'], 36); assert.equal(data.memberTotals['森本茉莉'], 40);
  assert.ok(!data.memberSlotKeys['小坂菜緒'].includes('2026-11-29::1'));
  await persistMiguriSyncPayload(env, { events: [event] });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM miguri_soldout_cells').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM miguri_soldout_snapshots').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM miguri_user_entries').get().n, 1);
});

test('large rosters use a bounded, atomic JSON batch instead of thousands of independently committed statements', async (t) => {
  const { db, env } = await fixture(t);
  const large = { ...event, members: Array.from({ length: 300 }, (_, i) => `成员${i}`), dateSchedules: undefined };
  const result = await persistMiguriSyncPayload(env, { events: [large] });
  assert.equal(result.slotMemberCount, 12600);
  assert.equal(env.writes.length, 1);
  assert.ok(env.writes[0].length < 20);
  assert.ok(env.writes[0].every((stmt) => stmt.args.length < 100));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM miguri_slot_members WHERE event_slug=?').get(event.slug).n, 12600);
});
