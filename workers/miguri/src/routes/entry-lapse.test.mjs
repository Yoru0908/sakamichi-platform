// 失効: runs the real upsert SQL on SQLite with the production migrations (005, 010, 011, 012).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { UPSERT_ENTRY_SQL, normalizeImportRecord } from './entry-import.ts';

const MIGRATIONS = ['005_miguri.sql', '010_miguri_entry_import.sql', '011_miguri_entry_analytics.sql', '012_miguri_entry_lapsed.sql'];
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
    r.category, r.venue, r.title, r.group, r.appliedTickets, r.wonTickets, r.paidTickets, r.unitPriceYen, r.spendYen, r.signLots, r.applicationRound, r.sourceSyncedAt);
  return db.prepare('SELECT won_tickets AS won, lapsed_tickets AS lapsed, status, spend_yen AS spend FROM miguri_user_entries').get();
}

test('失効 page: extension zeroes wonTickets, lotteryWon is the reduced count', () => {
  const r = normalizeImportRecord(music({ wonTickets: 0, spendYen: 0, resultStatus: 'lost', lotteryWon: 2, lotteryReviewRequired: true }));
  assert.equal(r.wonTickets, 2); assert.equal(r.spendYen, 2400); assert.equal(r.status, 'won');
});
test('re-import after an unpaid win lapsed keeps the lottery result and records lapsed tickets', () => {
  const db = database();
  assert.deepEqual({ ...save(db, music()) }, { won: 3, lapsed: 0, status: 'won', spend: 3600 });
  const lapsed = music({ wonTickets: 0, spendYen: 0, resultStatus: 'lost', lotteryWon: 2, lotteryReviewRequired: true });
  assert.deepEqual({ ...save(db, lapsed) }, { won: 3, lapsed: 1, status: 'won', spend: 2400 });
  assert.deepEqual({ ...save(db, lapsed) }, { won: 3, lapsed: 1, status: 'won', spend: 2400 });
  const allLapsed = music({ wonTickets: 0, spendYen: 0, resultStatus: 'lost', lotteryWon: 0, lotteryReviewRequired: true });
  assert.deepEqual({ ...save(db, allLapsed) }, { won: 3, lapsed: 3, status: 'won', spend: 0 });
});
test('a different applied count or a first import is taken as read', () => {
  const db = database();
  save(db, music());
  assert.deepEqual({ ...save(db, music({ appliedTickets: 6, lotteryApplied: 6, wonTickets: 2, spendYen: 2400 })) }, { won: 2, lapsed: 0, status: 'won', spend: 2400 });
  const fresh = database();
  assert.deepEqual({ ...save(fresh, music({ wonTickets: 0, lotteryWon: 1, lotteryReviewRequired: true })) }, { won: 1, lapsed: 0, status: 'won', spend: 1200 });
});
