// 失効: runs the real upsert SQL on SQLite with the production migrations (005, 010, 011, 012).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { UPSERT_ENTRY_SQL, normalizeImportRecord } from './entry-import.ts';

const MIGRATIONS = ['005_miguri.sql', '010_miguri_entry_import.sql', '011_miguri_entry_analytics.sql', '012_miguri_entry_lapsed.sql', '016_miguri_entry_rescue.sql'];
function database() {
  const db = new DatabaseSync(':memory:');
  for (const name of MIGRATIONS) db.exec(readFileSync(new URL(`../../../auth/src/db/migrations/${name}`, import.meta.url), 'utf8'));
  return db;
}
const music = (overrides = {}) => ({
  source: 'fortunemusic', sourceKey: 'app-1/m77/2026-10-18/1', category: '個別ミーグリ', member: '山川宇衣',
  date: '2026-10-18', slot: 1, appliedTickets: 5, wonTickets: 3, paidTickets: 0, unitPriceYen: 1200, spendYen: 3600,
  signLots: 0, applicationRound: '第1次', sourceSyncedAt: '2026-09-28T00:00:00.000Z', eventSlug: '', title: 't', venue: '',
  group: 'sakurazaka', resultStatus: 'won', lotteryApplied: 5, lotteryWon: 3, lotteryReviewRequired: false, ...overrides,
});
function save(db, raw) {
  const r = normalizeImportRecord(raw);
  db.prepare(UPSERT_ENTRY_SQL).run('id-' + Math.random(), 'user-1', '', r.member, r.date, r.slot, r.tickets, r.status, r.source, r.sourceKey,
    r.category, r.venue, r.title, r.group, r.appliedTickets, r.wonTickets, r.paidTickets, r.unitPriceYen, r.spendYen, r.signLots, r.applicationRound, r.sourceSyncedAt,
    r.rescueTickets, r.rescueWonTickets, r.lapsedTickets);
  return db.prepare('SELECT won_tickets AS won, lapsed_tickets AS lapsed, status, spend_yen AS spend FROM miguri_user_entries').get();
}

test('失効 page: the whole application is void, the page still lists the original 当選数', () => {
  const r = normalizeImportRecord(music({ wonTickets: 0, spendYen: 0, resultStatus: 'lost', lotteryWon: 3, lotteryReviewRequired: true }));
  assert.equal(r.wonTickets, 3); assert.equal(r.lapsedTickets, 3); assert.equal(r.spendYen, 0); assert.equal(r.status, 'won');
  assert.equal(normalizeImportRecord(music()).lapsedTickets, 0);
});
test('first import of a 失効 application stores the lottery result with every ticket lapsed', () => {
  const db = database();
  const lapsed = music({ wonTickets: 0, spendYen: 0, resultStatus: 'lost', lotteryWon: 3, lotteryReviewRequired: true });
  assert.deepEqual({ ...save(db, lapsed) }, { won: 3, lapsed: 3, status: 'won', spend: 0 });
  assert.deepEqual({ ...save(db, lapsed) }, { won: 3, lapsed: 3, status: 'won', spend: 0 });
});
test('an application imported as held and later seen as 失効 becomes lapsed', () => {
  const db = database();
  assert.deepEqual({ ...save(db, music()) }, { won: 3, lapsed: 0, status: 'won', spend: 3600 });
  const lapsed = music({ wonTickets: 0, spendYen: 0, resultStatus: 'lost', lotteryWon: 3, lotteryReviewRequired: true });
  assert.deepEqual({ ...save(db, lapsed) }, { won: 3, lapsed: 3, status: 'won', spend: 0 });
});
test('a reduced count on a normal page still records the gap as lapsed', () => {
  const db = database();
  save(db, music());
  assert.deepEqual({ ...save(db, music({ wonTickets: 2, lotteryWon: 2, spendYen: 2400 })) }, { won: 3, lapsed: 1, status: 'won', spend: 2400 });
});
test('a different applied count is taken as read', () => {
  const db = database();
  save(db, music());
  assert.deepEqual({ ...save(db, music({ appliedTickets: 6, lotteryApplied: 6, wonTickets: 2, spendYen: 2400 })) }, { won: 2, lapsed: 0, status: 'won', spend: 2400 });
});

// Meets 保障 (R serials): 15th 全国 第3部 had 3 bought + 14 保障 applications (4 保障 wins).
const meets = (overrides = {}) => ({
  source: 'fortunemeets', sourceKey: 'sakurazaka46:15th-online-0712-3', category: '全国ミーグリ', member: '山川宇衣',
  date: '2026-07-12', slot: 3, appliedTickets: 17, wonTickets: 7, paidTickets: 9, unitPriceYen: 2000, spendYen: 18000,
  signLots: 0, applicationRound: '15th', sourceSyncedAt: '2026-10-25T00:00:00.000Z', eventSlug: '', title: 't', venue: '',
  group: 'sakurazaka', resultStatus: 'won', ...overrides,
});
const rescueRow = (db) => ({ ...db.prepare('SELECT rescue_tickets AS rescue, rescue_won_tickets AS rescueWon FROM miguri_user_entries').get() });
test('保障 counts are optional, validated leniently, and kept when an older extension re-syncs', () => {
  assert.equal(normalizeImportRecord(meets()).rescueTickets, null);
  assert.equal(normalizeImportRecord(meets({ rescueTickets: 18 })).rescueTickets, null);
  assert.equal(normalizeImportRecord(meets({ rescueTickets: 14, rescueWonTickets: 8 })).rescueWonTickets, null);
  assert.ok(normalizeImportRecord(meets({ rescueTickets: 'x' })));
  const db = database();
  save(db, meets());
  assert.deepEqual(rescueRow(db), { rescue: null, rescueWon: null });
  save(db, meets({ rescueTickets: 14, rescueWonTickets: 4 }));
  assert.deepEqual(rescueRow(db), { rescue: 14, rescueWon: 4 });
  save(db, meets());
  assert.deepEqual(rescueRow(db), { rescue: 14, rescueWon: 4 });
  save(db, meets({ rescueTickets: 14, rescueWonTickets: null }));
  assert.deepEqual(rescueRow(db), { rescue: 14, rescueWon: null });
});
