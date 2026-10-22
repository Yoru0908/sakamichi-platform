import test from 'node:test';
import assert from 'node:assert/strict';

import { byMonth, dayAndShowCount, eventGroupYear, filterCards, isPastCard, markKey, toCards, yearsOf } from './events-data.ts';

const day = (id, date, title, extra = {}) => ({ id, date, title, kind: 'ライブ', category: 'attend', shows: [], members: [], wholeGroup: false,
  sourceUrl: `https://example.com/${id}`, venue: null, ...extra });
const venue = (name, prefecture = null) => ({ id: 1, name, prefecture });

test('a stage run and a tour are one card each; every venue keeps its own dates (real 2019 Hinatazaka / 民王 shapes)', () => {
  const cards = toCards([
    day('s1', '2019-09-05', '舞台「サザエさん」', { venue: venue('明治座', '東京都') }),
    day('s2', '2019-09-06', '舞台「サザエさん」', { venue: venue('明治座', '東京都') }),
    day('s3', '2019-09-28', '舞台「サザエさん」', { venue: venue('博多座', '福岡県') }),   // 22 days later at another theatre: a new run
    day('t2', '2026-10-12', '民王', { venue: venue('梅田芸術劇場'), members: [{ id: '1', name: '林 瑠奈' }] }),
    day('t1', '2026-10-06', '民王', { members: [{ id: '1', name: '林 瑠奈' }] }),
  ]);
  assert.deepEqual(cards.map((c) => [c.title, c.days.map((d) => d.date)]), [
    ['舞台「サザエさん」', ['2019-09-05', '2019-09-06']],
    ['舞台「サザエさん」', ['2019-09-28']],
    ['民王', ['2026-10-06', '2026-10-12']],
  ]);
  assert.deepEqual(cards[2].venues, [{ name: null, prefecture: null, dates: ['2026-10-06'] }, { name: '梅田芸術劇場', prefecture: null, dates: ['2026-10-12'] }]);
  assert.deepEqual(cards[2].members, [{ id: '1', name: '林 瑠奈' }]);   // members once per card
});

test('the same title much later is another event (個別握手会 at the same hall, months apart)', () => {
  const t = '個別握手会：パシフィコ横浜(神奈川)';
  const cards = toCards([day('a', '2019-05-04', t), day('b', '2019-06-02', t), day('c', '2019-08-24', t), day('d', '2019-08-31', t)]);
  assert.deepEqual(cards.map((c) => c.days.length), [1, 1, 2]);
  assert.equal(new Set(cards.map((c) => c.key)).size, 3);   // React keys stay unique
});

test('in person and online of one title stay apart; filters by category and text (title, venue, member)', () => {
  const cards = toCards([
    day('m1', '2026-10-04', 'ミート＆グリート', { venue: venue('幕張メッセ', '千葉県'), members: [{ id: '2', name: '中西 アルノ' }] }),
    day('m2', '2026-10-05', 'ミート＆グリート', { category: 'online' }),
  ]);
  assert.equal(cards.length, 2);
  assert.deepEqual(filterCards(cards, 'online', '').map((c) => c.category), ['online']);
  assert.equal(filterCards(cards, 'all', '幕張').length, 1);
  assert.equal(filterCards(cards, 'all', 'アルノ').length, 1);
  assert.equal(filterCards(cards, 'attend', 'nothing').length, 0);
  assert.deepEqual(byMonth(cards).map(([m, cs]) => [m, cs.length]), [['2026-10', 2]]);
});

test('years from next year down to the group\'s first official year', () => {
  const now = new Date('2026-12-31T16:00:00Z');   // already 2027-01-01 in JST
  assert.deepEqual(yearsOf('hinatazaka', now).slice(0, 2), [2028, 2027]);
  assert.equal(yearsOf('hinatazaka', now).at(-1), 2019);
  assert.equal(yearsOf('nogizaka', now).at(-1), 2011);
});

test('記録済み keeps cards with a marked day; labels and past split follow today (坂ログ rules)', () => {
  const cards = toCards([
    day('a', '2026-10-20', 'A', { shows: [{ label: '昼', start: '13:00' }, { label: '夜', start: '18:00' }] }),
    day('b1', '2026-10-21', 'B'), day('b2', '2026-10-24', 'B'),
  ]);
  assert.deepEqual(filterCards(cards, 'mine', '', new Set(['b2'])).map((c) => c.title), ['B']);
  assert.deepEqual(filterCards(cards, 'mine', '').length, 0);
  const today = '2026-10-22';
  assert.deepEqual(cards.map((c) => isPastCard(c, today)), [true, false]);   // B runs 10/21–10/24: still これから
  assert.equal(markKey('2026-10-24', false, today), 'events.mark.go');
  assert.equal(markKey('2026-10-24', true, today), 'events.mark.going');
  assert.equal(markKey('2026-10-22', false, today), 'events.mark.attended_q');   // the day itself counts as 参加
  assert.equal(markKey('2026-10-20', true, today), 'events.mark.attended');
  assert.deepEqual(dayAndShowCount(cards), { days: 3, shows: 4 });
});

test('?event= ids name their group and year', () => {
  assert.deepEqual(eventGroupYear('n_107229:2026-10-20'), { grp: 'nogizaka', year: 2026 });
  assert.deepEqual(eventGroupYear('h_5355:2021-10-20'), { grp: 'hinatazaka', year: 2021 });
  assert.deepEqual(eventGroupYear('1234:2025-03-01'), { grp: 'sakurazaka', year: 2025 });
  assert.equal(eventGroupYear('x_1:2025-03-01'), null);
});
