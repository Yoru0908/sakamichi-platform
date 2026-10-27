// ミーグリ共有画像 (2026-10-26): the card counts exactly what the dashboard shows for the chosen 期間,
// is always Japanese, and never carries future dates, venues or account info.
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateMiguriDashboard } from './meguri-helpers.ts';
import { buildMiguriShareCard, inMiguriPeriod, miguriShareText, miguriYears } from './miguri-share.ts';
import { miguriMessages, miguriTranslator } from '../../i18n/miguri.ts';

const music = (id, member, date, applied, won, extra = {}) => ({
  id, member, date, slot: 1, tickets: won || applied, status: won ? 'won' : 'lost', source: 'fortunemusic',
  category: '個別ミーグリ', group: 'sakurazaka', appliedTickets: applied, wonTickets: won, eventTitle: '櫻坂46 13thシングル', ...extra,
});
const entries = [
  music('a', '山川宇衣', '2025-11-02', 10, 4),
  music('b', '山川宇衣', '2026-02-14', 12, 5),
  music('c', '山川宇衣', '2026-05-03', 8, 0),
  music('d', '村井優', '2026-05-03', 6, 2),
  music('e', '的野美青', '2026-09-12', 4, 1),
  music('f', '山下瞳月', '2026-09-12', 3, 3),
  { ...music('g', '山川宇衣', '2026-12-20', 5, 5), category: 'リアミ', venue: '京都パルスプラザ', source: 'fortunemeets', unitPriceYen: 2000 },
  { ...music('h', '山川宇衣', '', 2, 2), date: '' }, // no date: only under 全期間
];
const TODAY = '2026-10-26';
const card = (period, list = inMiguriPeriod(entries, period), extra = {}) =>
  buildMiguriShareCard({ entries: list, dashboard: aggregateMiguriDashboard(list, TODAY), period, group: 'all', category: null, today: TODAY, ...extra });

test('years come from the records, newest first; undated records count only under 全期間', () => {
  assert.deepEqual(miguriYears(entries), [2026, 2025]);
  assert.deepEqual(inMiguriPeriod(entries, 2026).map((entry) => entry.id), ['b', 'c', 'd', 'e', 'f', 'g']);
  assert.equal(inMiguriPeriod(entries, 'all').length, entries.length);
  assert.deepEqual(inMiguriPeriod(entries, 2024), []);
});

test('2026 card: the dashboard totals for that year, ranking by 当選枚数, Japanese title', () => {
  const year = card(2026);
  const own = inMiguriPeriod(entries, 2026);
  assert.equal(year.applied, own.reduce((n, e) => n + e.appliedTickets, 0));
  assert.equal(year.won, own.reduce((n, e) => n + e.wonTickets, 0));
  assert.equal(year.applied, 38);
  assert.equal(year.won, 16);
  assert.deepEqual(year.title, ['2026年', 'ミーグリまとめ']);
  assert.equal(year.range, '2026.02.14 – 2026.09.12'); // 12-20 is still ahead: counted, never shown
  assert.equal(year.scope, '櫻坂46'); // the only group in the records
  assert.deepEqual(year.ranking, [{ name: '山川宇衣', won: 10 }, { name: '山下瞳月', won: 3 }, { name: '村井優', won: 2 }]);
  assert.equal(year.wonDays, 4); // 02-14, 05-03, 09-12, 12-20
  assert.equal(year.wonMembers, 4); // 的野美青 and 山下瞳月 too; 0-win members are not counted
  assert.ok(year.spendYen > 0);
  assert.ok(['単推し', '本命あり', '箱推し', 'DD'].includes(year.oshiType));
  assert.equal(card('all').title.join(''), 'これまでのミーグリ');
  assert.equal(card('all').won, 22);
});

test('the card never carries venues, future schedule or account data', () => {
  const text = JSON.stringify(card(2026));
  for (const [date] of text.matchAll(/\d{4}\.\d{2}\.\d{2}/g)) assert.ok(date.replaceAll('.', '-') <= TODAY, date);
  assert.equal(card(2026, [music('z', '山川宇衣', '2026-12-24', 3, 1)]).range, null); // only upcoming dates → no range
  assert.doesNotMatch(text, /京都|パルスプラザ|venue|nextStop|email|@/);
  assert.equal(card(2026, inMiguriPeriod(entries, 2026), { group: 'sakurazaka', category: 'リアミ' }).scope, '櫻坂46 · リアミ');
});

test('no prices → no 推しタイプ guess; empty period → zero card', () => {
  const unpriced = [{ id: 'x', member: '山川宇衣', date: '2026-03-01', slot: 1, tickets: 2, status: 'won', category: 'その他' }];
  const c = card(2026, unpriced);
  assert.equal(c.spendYen, 0);
  assert.equal(c.oshiType, '—');
  assert.equal(c.top, null);
  const empty = card(2024, []);
  assert.equal(empty.applied, 0);
  assert.equal(empty.rate, null);
  assert.deepEqual(empty.ranking, []);
});

test('post text is Japanese; the amount only when 金額を載せる is on', () => {
  const year = card(2026);
  const withSpend = miguriShareText(year, true), without = miguriShareText(year, false);
  assert.match(withSpend, /^2026年ミーグリまとめ\n応募 38枚 → 当選 16枚（当選率 42%）\n支払総額 ¥[\d,]+\n/);
  assert.doesNotMatch(without, /¥/);
  assert.doesNotMatch(without, /支出の/);
  assert.match(withSpend, /支出の \d+% が /);
  assert.match(without, /#ミーグリまとめ\nhttps:\/\/46log\.com\/miguri$/);
});

test('dashboard dictionary: placeholders fill in; en has its own text', () => {
  const ja = miguriTranslator('ja'), zh = miguriTranslator('zh'), en = miguriTranslator('en');
  assert.equal(ja('periodYear', { year: 2026 }), '2026年');
  assert.equal(ja('autoBody', { n: 30 }), '30分ごとに確認します。ログインが切れたら一時停止してお知らせし、1回が10分を超えたら自動で片付けて再試行します。');
  assert.equal(zh('autoBody', { n: 30 }), '每 30 分钟检查一次；登录失效时暂停并提示，单轮超过 10 分钟会自动清理并重试。');
  assert.equal(en('paid'), 'Amount paid');
  assert.equal(Object.keys(miguriMessages.en).length, Object.keys(miguriMessages.zh).length);
});
