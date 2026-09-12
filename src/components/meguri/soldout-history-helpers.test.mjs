import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterSoldOutHistory, formatSoldOutCapture } from './soldout-history-helpers.ts';

const events = [
  { slug: 'new', group: 'nogizaka', title: '42nd', archived: false, roundCount: 3, lastCapturedAt: '2026-09-01' },
  { slug: 'old', group: 'hinatazaka', title: '17th Kind of love', archived: true, roundCount: 9, lastCapturedAt: '2026-07-01' },
  { slug: 'missing', group: 'sakurazaka', title: '14th', archived: true, roundCount: 0, lastCapturedAt: null },
];
const defaults = { group: 'all', scope: 'recorded', query: '' };

test('recorded history includes ended events without treating unsampled events as zero sales', () => {
  assert.deepEqual(filterSoldOutHistory(events, defaults).map((e) => e.slug), ['old', 'new']);
  assert.deepEqual(filterSoldOutHistory(events, { ...defaults, scope: 'archived' }).map((e) => e.slug), ['old']);
  assert.equal(filterSoldOutHistory(events, { ...defaults, scope: 'all' }).length, 3);
  assert.equal(events[0].slug, 'new', 'Do not mutate API catalogue');
});

test('group/title search handles whitespace, full-width digits and case', () => {
  for (const query of ['１７', 'KIND OF LOVE', 'kindoflove', '日向坂']) {
    assert.deepEqual(filterSoldOutHistory(events, { ...defaults, query }).map((e) => e.slug), ['old']);
  }
  assert.equal(filterSoldOutHistory(events, { ...defaults, group: 'nogizaka', query: '17' }).length, 0);
});

test('capture timestamps are JST regardless of browser timezone and preserve missing values', () => {
  assert.match(formatSoldOutCapture('2026-07-15 05:00:12'), /14:00:12 JST$/);
  assert.equal(formatSoldOutCapture(null), '未采集');
  assert.equal(formatSoldOutCapture('bad'), '时间未知');
});

test('history is reachable even when manager has no current events; desktop/mobile/sidebar links and real island are wired', () => {
  const read = (path) => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
  assert.match(read('src/pages/miguri.astro'), /<BaseLayout/);
  assert.doesNotMatch(read('src/pages/miguri.astro'), /个握历史完售 ·|排队监控 ·/);
  assert.match(read('src/pages/miguri/history.astro'), /<SoldOutHistory client:load/);
  assert.equal((read('src/utils/navigation.ts').match(/href: '\/miguri\/history'/g) || []).length, 3);
  assert.equal((read('src/components/meguri/MeguriPrototype.tsx').match(/href="\/miguri\/history"/g) || []).length, 2);
});
