// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMiguriRecapCard, countAttendedLives, miguriRecapText, talkSecondsPerTicket } from './miguri-recap.ts';

const TODAY = '2026-10-26';
const LIVES = Array.from({ length: 7 }, (_, i) => ({ id: `l${i}`, date: `2026-0${i + 2}-10`, title: 'ライブ' }));
const online = (id, date, applied, won, extra = {}) => ({ id, member: '山川宇衣', date, slot: 1, tickets: won || applied, status: won ? 'won' : 'lost', source: 'fortunemusic', category: '個別ミーグリ', group: 'sakurazaka', eventSlug: 'e1', appliedTickets: applied, wonTickets: won, ...extra });
const real = (id, date, venue, applied, won) => ({ ...online(id, date, applied, won, { source: 'fortunemeets', category: 'リアミ', venue, eventSlug: 'e2' }) });
const entries = [
  online('a', '2026-03-02', 10, 3), // 27 s
  online('b', '2026-03-02', 4, 0), // lost
  real('c', '2026-05-09', '京都パルスプラザ', 4, 2), // 16 s
  real('d', '2026-06-20', '東京ビッグサイト', 8, 5), // 30 s
  { ...online('s', '2026-07-01', 0, 0), category: 'サイン会', signLots: 2, status: 'won', tickets: 2, eventSlug: 'sign1' },
  { ...online('s2', '2026-07-01', 0, 0), category: 'サイン会', signLots: 1, status: 'won', tickets: 1, eventSlug: 'sign1', member: '金村美玖' },
  online('f', '2026-12-20', 5, 5), // still ahead: counted in 当選, not in days or minutes
  online('g', '2025-11-02', 5, 5),
];

test('talk seconds: online 9, in person Tokyo 6 / Kyoto 8', () => {
  assert.equal(talkSecondsPerTicket(entries[0]), 9);
  assert.equal(talkSecondsPerTicket(entries[2]), 8);
  assert.equal(talkSecondsPerTicket(entries[3]), 6);
  assert.equal(talkSecondsPerTicket({ ...entries[3], venue: null }), 6);
});

test('recap card: days, sign events and minutes stop at today; 当選 counts the whole year', () => {
  const card = buildMiguriRecapCard({ entries, year: 2026, lives: LIVES, today: TODAY });
  assert.equal(card.onlineDays, 1);
  assert.equal(card.realDays, 2);
  assert.equal(card.signEvents, 1); // two rows, one event on one day
  assert.equal(card.won, 15); // 3 + 2 + 5 + 5 (the 12-20 win is still ahead but is a win of the year)
  assert.equal(card.applied, 31);
  assert.equal(card.minutes, 5); // (27 + 16 + 30) s = 1.2 min, plus 2 signings (two members) × 2 min = 4 min
  assert.equal(card.live, 7);
  assert.deepEqual(card.topMember, { name: '山川宇衣', won: 15 });
  assert.equal(card.topGroup, 'sakurazaka');
  assert.equal(card.months.length, 12);
  assert.deepEqual(card.months.slice(2, 3), [{ label: '3月', won: 3, live: 1 }]);
  assert.equal(card.months[11].won, 0); // the 12-20 win is still ahead
  assert.equal(buildMiguriRecapCard({ entries, year: 2026, lives: null, today: TODAY }).months[2].live, null);
});

test('lives come from 参加ログ: marked, attended, that year, not 握手会 / サイン会', () => {
  const records = [
    { id: '1', date: '2026-02-01', title: '桜坂46 ライブ' },
    { id: '2', date: '2026-08-10', title: '真夏の全国ツアー' },
    { id: '3', date: '2026-09-01', title: '個別ミーグリ' },
    { id: '4', date: '2026-12-24', title: 'クリスマスライブ' },
    { id: '5', date: '2025-12-24', title: '去年のライブ' },
    { id: '1', date: '2026-02-01', title: '桜坂46 ライブ' },
  ];
  assert.equal(countAttendedLives(records, 2026, TODAY), 2);
});

test('recap post: no amounts, no dates', () => {
  const text = miguriRecapText(buildMiguriRecapCard({ entries, year: 2026, lives: LIVES, today: TODAY }));
  assert.match(text, /^2026年の推し活 振り返り\n\nライブ 7本\nミーグリ 3日 \/ 当選 15枚\nサイン会 1回\n推しと話した時間 約5分\nいちばん当たったのは .+（\d+枚）\n\n#2026年ミーグリ振り返り #ミーグリ\n/);
  assert.doesNotMatch(text, /¥|\d{4}-\d{2}/);
  assert.match(miguriRecapText(buildMiguriRecapCard({ entries, year: 2026, lives: null, today: TODAY })), /^2026年の推し活 振り返り\n\nミーグリ 3日/);
});

test('失効 tickets stay a 当選 but add no day and no talk time', () => {
  const lapsedAll = online('x', '2026-04-01', 4, 4, { lapsedTickets: 4 });
  const lapsedSome = online('y', '2026-04-02', 12, 12, { lapsedTickets: 2 });
  const card = buildMiguriRecapCard({ entries: [lapsedAll, lapsedSome], year: 2026, lives: null, today: TODAY });
  assert.equal(card.won, 16);
  assert.equal(card.onlineDays, 1); // only 04-02 had tickets left to use
  assert.equal(card.minutes, 2); // 10 held × 9 s = 90 s (the 4 lapsed and 2 lapsed add nothing)
});
