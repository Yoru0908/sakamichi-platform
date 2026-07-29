import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMiguriCdPriceYen } from './miguri-cd-prices.ts';
import {
  aggregateMiguriDashboard,
  buildPendingMeguriDraft,
  countPendingDraftRecords,
  groupEntriesByDateAndSlot,
  inferEventState,
  resolveFortuneMeetsSource,
  resolveMiguriEntryLostSpend,
  resolveMiguriEntrySpend,
  sortEventsForDisplay,
  summarizeEntries,
} from './meguri-helpers.ts';

test('resolveFortuneMeetsSource keeps lottery analysis on the selected group and single', () => {
  assert.deepEqual(
    resolveFortuneMeetsSource('nogizaka', '乃木坂46 42ndシングル『是非に及ばず』発売記念'),
    { artist: 'nogizaka46', event: '42nd' },
  );
  assert.deepEqual(
    resolveFortuneMeetsSource('sakurazaka', '櫻坂46 １５th Single'),
    { artist: 'sakurazaka46', event: '15th' },
  );
  assert.deepEqual(
    resolveFortuneMeetsSource('hinatazaka', '日向坂46 16thシングル'),
    { artist: 'hinatazaka46', event: '16th' },
  );
  assert.equal(resolveFortuneMeetsSource('nogizaka', '乃木坂46 イベント'), null);
});

test('resolveMiguriCdPriceYen follows the reference release-price catalog', () => {
  assert.equal(
    resolveMiguriCdPriceYen(
      'sakurazaka',
      '櫻坂46 15th Single「Lonesome rabbit / What\'s “KAZOKU”?」発売記念',
    ),
    2000,
  );
  assert.equal(resolveMiguriCdPriceYen('nogizaka', '33rd「おひとりさま天国」'), 1900);
  assert.equal(resolveMiguriCdPriceYen('nogizaka', '5thアルバム「My respect」'), 22000);
  assert.equal(resolveMiguriCdPriceYen('hinatazaka', '価格未登録の映像作品'), 0);
});

test('inferEventState returns active when a window is currently open', () => {
  const now = new Date('2026-04-26T12:30:00');
  const state = inferEventState([
    {
      label: '第1次受付',
      start: '2026年4月26日（日）10:00',
      end: '2026年4月26日（日）14:00',
    },
  ], '2026-05-31', now);

  assert.equal(state, 'active');
});

test('inferEventState returns waiting when windows are closed but event dates remain', () => {
  const now = new Date('2026-04-26T03:00:00.000Z');
  const state = inferEventState([
    {
      label: '第1次受付',
      start: '2026年4月20日（月）10:00',
      end: '2026年4月21日（火）14:00',
    },
  ], '2026-05-31', now);

  assert.equal(state, 'waiting');
});

test('summarizeEntries counts tickets, slots, members, and dates', () => {
  const summary = summarizeEntries([
    { id: '1', member: '小坂菜緒', date: '2026-05-31', slot: 1, tickets: 3, status: 'paid' },
    { id: '2', member: '正源司陽子', date: '2026-05-31', slot: 1, tickets: 2, status: 'planned' },
    { id: '3', member: '小坂菜緒', date: '2026-06-07', slot: 2, tickets: 1, status: 'won' },
  ]);

  assert.deepEqual(summary, {
    totalTickets: 6,
    totalSlots: 3,
    uniqueMembers: 2,
    uniqueDates: 2,
  });
});

test('groupEntriesByDateAndSlot groups entries into nested date and slot buckets', () => {
  const grouped = groupEntriesByDateAndSlot([
    { id: '1', member: '小坂菜緒', date: '2026-05-31', slot: 2, tickets: 3, status: 'paid' },
    { id: '2', member: '正源司陽子', date: '2026-05-31', slot: 2, tickets: 2, status: 'planned' },
    { id: '3', member: '藤嶌果歩', date: '2026-06-07', slot: 1, tickets: 1, status: 'won' },
  ]);

  assert.equal(grouped['2026-05-31'][2].length, 2);
  assert.equal(grouped['2026-06-07'][1][0].member, '藤嶌果歩');
});

test('aggregateMiguriDashboard builds next stop, category totals, and per-slot ticket counts', () => {
  const dashboard = aggregateMiguriDashboard([
    {
      id: '1',
      member: '山川宇衣',
      date: '2026-08-02',
      slot: 1,
      tickets: 10,
      status: 'won',
      category: 'リアミ',
      venue: '京都パルスプラザ',
    },
    {
      id: '2',
      member: '山川宇衣',
      date: '2026-08-02',
      slot: 2,
      tickets: 18,
      status: 'won',
      category: 'リアミ',
      venue: '京都パルスプラザ',
    },
    {
      id: '3',
      member: '山川宇衣',
      date: '2026-08-02',
      slot: 0,
      tickets: 3,
      status: 'won',
      category: 'サイン会',
      venue: '京都パルスプラザ',
    },
    {
      id: '4',
      member: '山川宇衣',
      date: '2026-09-12',
      slot: 4,
      tickets: 6,
      status: 'paid',
      category: '個別ミーグリ',
      venue: null,
    },
    {
      id: '5',
      member: '山川宇衣',
      date: '2026-09-12',
      slot: 5,
      tickets: 20,
      status: 'lost',
      source: 'fortunemusic',
      category: '個別ミーグリ',
      venue: null,
    },
  ], '2026-07-29');

  assert.equal(dashboard.totalTickets, 37);
  assert.equal(dashboard.upcomingDates, 2);
  assert.equal(dashboard.nextStops[0].date, '2026-08-02');
  assert.deepEqual(dashboard.nextStops[0].venues, ['京都パルスプラザ']);
  assert.equal(dashboard.nextStops[0].rows[0].tickets, 28);
  assert.deepEqual(dashboard.nextStops[0].rows[0].slots, [
    { slot: 1, tickets: 10 },
    { slot: 2, tickets: 18 },
  ]);
  assert.deepEqual(dashboard.nextStops[0].rows[1].slots, [
    { slot: 0, tickets: 3 },
  ]);
  assert.deepEqual(
    dashboard.categoryBreakdown.map(({ label, tickets }) => ({ label, tickets })),
    [
      { label: 'リアミ', tickets: 28 },
      { label: '個別ミーグリ', tickets: 6 },
      { label: 'サイン会', tickets: 3 },
    ],
  );
});

test('aggregateMiguriDashboard excludes lost Meets cost from overview totals', () => {
  const dashboard = aggregateMiguriDashboard([
    {
      id: 'music-won',
      member: '山川宇衣',
      date: '2026-09-12',
      slot: 1,
      tickets: 6,
      status: 'won',
      source: 'fortunemusic',
      category: '個別ミーグリ',
      appliedTickets: 10,
      wonTickets: 6,
      unitPriceYen: 2000,
      spendYen: 12000,
      applicationRound: '第1次',
      sourceSyncedAt: '2026-07-29T00:00:00.000Z',
    },
    {
      id: 'sign-lost',
      member: '山川宇衣',
      date: '2026-08-02',
      slot: 0,
      tickets: 3,
      status: 'lost',
      source: 'fortunemeets',
      category: 'サイン会',
      group: 'sakurazaka',
      eventTitle: '櫻坂46 15th Single「Lonesome rabbit / What\'s “KAZOKU”?」発売記念',
      appliedTickets: 12,
      wonTickets: 0,
      signLots: 3,
      unitPriceYen: 2000,
      spendYen: 24000,
      applicationRound: 'sakurazaka46-16th',
      sourceSyncedAt: '2026-07-29T00:00:00.000Z',
    },
    {
      id: 'real-won',
      member: '小田倉麗奈',
      date: '2026-08-02',
      slot: 0,
      tickets: 4,
      status: 'won',
      source: 'fortunemeets',
      category: 'リアミ',
      group: 'sakurazaka',
      eventTitle: '櫻坂46 15th Single「Lonesome rabbit / What\'s “KAZOKU”?」発売記念',
      appliedTickets: 4,
      wonTickets: 4,
      unitPriceYen: 2000,
      spendYen: 8000,
      applicationRound: 'sakurazaka46-16th',
      sourceSyncedAt: '2026-07-29T00:00:00.000Z',
    },
  ], '2026-07-29');

  assert.equal(dashboard.totalSpendYen, 15200);
  assert.equal(dashboard.lostSpendYen, 24000);
  assert.equal(dashboard.totalPaidSpendYen, 39200);
  assert.equal(dashboard.totalApplied, 14);
  assert.equal(dashboard.totalWon, 10);
  assert.equal(dashboard.winRate, 10 / 14);
  assert.equal(dashboard.topMember.name, '小田倉麗奈');
  assert.equal(dashboard.topMember.spendYen, 8000);
  assert.equal(
    dashboard.categoryBreakdown.find((item) => item.label === 'サイン会').spendYen,
    0,
  );
  assert.equal(dashboard.nextStops[0].rows.some((row) => row.category === 'サイン会'), false);
});

test('resolveMiguriEntrySpend includes lost Meets applications only when requested', () => {
  const entry = {
    id: 'lost-meets',
    member: '山川宇衣',
    date: '2026-08-02',
    slot: 0,
    tickets: 12,
    status: 'lost',
    source: 'fortunemeets',
    group: 'sakurazaka',
    category: 'サイン会',
    eventTitle: '櫻坂46 15th Single「Lonesome rabbit / What\'s “KAZOKU”?」発売記念',
    appliedTickets: 12,
    wonTickets: 0,
  };
  assert.equal(resolveMiguriEntrySpend(entry).spendYen, 0);
  assert.equal(resolveMiguriEntrySpend(entry, 0, true).spendYen, 24000);
  assert.equal(resolveMiguriEntrySpend(entry, 20, true).spendYen, 19200);
});

test('resolveMiguriEntrySpend charges a 33口 × 3-CD sign event as 99 CDs', () => {
  const entry = {
    id: 'sign-won',
    member: '山川宇衣',
    date: '2026-08-02',
    slot: 0,
    tickets: 99,
    status: 'won',
    source: 'fortunemeets',
    group: 'sakurazaka',
    category: 'サイン会',
    eventTitle: '櫻坂46 15th Single「Lonesome rabbit / What\'s “KAZOKU”?」発売記念',
    appliedTickets: 99,
    wonTickets: 99,
    signLots: 33,
  };
  assert.equal(resolveMiguriEntrySpend(entry).spendYen, 198000);
  assert.equal(resolveMiguriEntrySpend(entry, 20).spendYen, 158400);

  const lostEntry = {
    ...entry,
    id: 'sign-lost',
    status: 'lost',
    wonTickets: 0,
  };
  assert.equal(resolveMiguriEntrySpend(lostEntry).spendYen, 0);
  assert.equal(resolveMiguriEntryLostSpend(lostEntry), 198000);
  assert.equal(resolveMiguriEntryLostSpend(lostEntry, 20), 158400);
});

test('aggregateMiguriDashboard estimates current single spend for legacy won entries', () => {
  const dashboard = aggregateMiguriDashboard([
    {
      id: 'legacy-won',
      member: '山川宇衣',
      date: '2026-09-12',
      slot: 1,
      tickets: 116,
      status: 'won',
      source: 'manual',
      category: '個別ミーグリ',
      eventTitle: '櫻坂46 Lonesome rabbit / What’s “KAZOKU”? 発売記念',
    },
    {
      id: 'legacy-planned',
      member: '金村美玖',
      date: '2026-08-09',
      slot: 2,
      tickets: 66,
      status: 'planned',
      source: 'manual',
      category: '個別ミーグリ',
      eventTitle: '日向坂46 Kind of love 発売記念',
    },
  ], '2026-07-29');

  assert.equal(dashboard.totalTickets, 182);
  assert.equal(dashboard.totalApplied, 116);
  assert.equal(dashboard.totalWon, 116);
  assert.equal(dashboard.totalSpendYen, 139200);
  assert.equal(dashboard.estimatedSpendYen, 139200);
  assert.equal(dashboard.estimatedSpendEntries, 1);
  assert.equal(dashboard.unpricedWonTickets, 0);
  assert.equal(dashboard.costPerWinYen, 1200);
  assert.equal(dashboard.topMember.name, '山川宇衣');
  assert.equal(dashboard.topMember.share, 1);
});

test('aggregateMiguriDashboard prices Meets winners from the reference catalog', () => {
  const dashboard = aggregateMiguriDashboard([
    {
      id: 'meets-retail-estimate',
      member: '山川宇衣',
      date: '2026-08-02',
      slot: 0,
      tickets: 2,
      status: 'won',
      source: 'fortunemeets',
      category: 'リアミ',
      group: 'sakurazaka',
      wonTickets: 2,
      eventTitle: '櫻坂46 15th Single「Lonesome rabbit / What\'s “KAZOKU”?」発売記念',
    },
    {
      id: 'meets-hmv-exact',
      member: '小田倉麗奈',
      date: '2026-08-02',
      slot: 0,
      tickets: 3,
      status: 'paid',
      source: 'fortunemeets',
      category: 'サイン会',
      group: 'sakurazaka',
      paidTickets: 3,
      unitPriceYen: 1800,
      spendYen: 5400,
      eventTitle: 'HMV online 櫻坂46 15th Single「Lonesome rabbit / What\'s “KAZOKU”?」購入者応募抽選企画',
    },
  ], '2026-07-29');

  assert.equal(dashboard.totalSpendYen, 10000);
  assert.equal(dashboard.estimatedSpendYen, 10000);
  assert.equal(dashboard.categoryBreakdown.find((item) => item.label === 'リアミ').spendYen, 4000);
  assert.equal(dashboard.categoryBreakdown.find((item) => item.label === 'サイン会').spendYen, 6000);
});

test('aggregateMiguriDashboard applies the limited-edition discount only to Meets', () => {
  const dashboard = aggregateMiguriDashboard([
    {
      id: 'music-fixed',
      member: '山川宇衣',
      date: '2026-09-12',
      slot: 1,
      tickets: 1,
      status: 'won',
      source: 'fortunemusic',
      category: '個別ミーグリ',
      wonTickets: 1,
      unitPriceYen: 2100,
      spendYen: 2100,
    },
    {
      id: 'meets-discounted',
      member: '小田倉麗奈',
      date: '2026-08-02',
      slot: 0,
      tickets: 2,
      status: 'won',
      source: 'fortunemeets',
      category: 'リアミ',
      group: 'sakurazaka',
      eventTitle: '櫻坂46 15th Single「Lonesome rabbit / What\'s “KAZOKU”?」発売記念',
      wonTickets: 2,
      unitPriceYen: 2000,
      spendYen: 4000,
    },
  ], '2026-07-29', 10);

  assert.equal(dashboard.totalSpendYen, 4800);
  assert.equal(dashboard.lostSpendYen, 0);
  assert.equal(dashboard.totalPaidSpendYen, 4800);
  assert.equal(
    dashboard.categoryBreakdown.find((item) => item.label === '個別ミーグリ').spendYen,
    1200,
  );
  assert.equal(
    dashboard.categoryBreakdown.find((item) => item.label === 'リアミ').spendYen,
    3600,
  );
  assert.equal(dashboard.costPerWinYen, 1600);
});

test('aggregateMiguriDashboard fixes Music CDs at ¥1,200 and reports unknown legacy prices', () => {
  const dashboard = aggregateMiguriDashboard([
    {
      id: 'exact',
      member: '山川宇衣',
      date: '2026-09-12',
      slot: 1,
      tickets: 3,
      status: 'paid',
      source: 'fortunemusic',
      category: '個別ミーグリ',
      paidTickets: 3,
      unitPriceYen: 2100,
      spendYen: 6300,
      eventTitle: 'future release',
    },
    {
      id: 'unknown-album',
      member: '金村美玖',
      date: '2026-09-13',
      slot: 2,
      tickets: 2,
      status: 'won',
      category: 'その他',
      eventTitle: '特別アルバム 発売記念',
    },
  ], '2026-07-29');

  assert.equal(dashboard.totalSpendYen, 3600);
  assert.equal(dashboard.estimatedSpendYen, 0);
  assert.equal(dashboard.unpricedWonTickets, 2);
});

test('sortEventsForDisplay places events with later event dates first', () => {
  const sorted = sortEventsForDisplay([
    {
      slug: 'nogizaka_202604',
      group: 'nogizaka',
      title: '乃木坂46',
      sourceUrl: '',
      saleType: '抽選販売',
      windows: [],
      dates: ['2026-06-01'],
      members: [],
      slots: [],
      syncedAt: '2026-04-26T14:00:00.000Z',
    },
    {
      slug: 'hinatazaka_202605',
      group: 'hinatazaka',
      title: '日向坂46',
      sourceUrl: '',
      saleType: '抽選販売',
      windows: [],
      dates: ['2026-08-09'],
      members: [],
      slots: [],
      syncedAt: '2026-04-26T14:00:00.000Z',
    },
    {
      slug: 'sakurazaka_202603',
      group: 'sakurazaka',
      title: '櫻坂46',
      sourceUrl: '',
      saleType: '抽選販売',
      windows: [],
      dates: ['2026-05-01'],
      members: [],
      slots: [],
      syncedAt: '2026-04-26T14:00:00.000Z',
    },
  ]);

  assert.deepEqual(sorted.map((event) => event.slug), [
    'hinatazaka_202605',
    'nogizaka_202604',
    'sakurazaka_202603',
  ]);
});

test('buildPendingMeguriDraft creates one member-specific draft with normalized slots', () => {
  const draft = buildPendingMeguriDraft({
    eventSlug: 'hinatazaka_202605',
    date: '2026-05-31',
    slots: [2, 1, 2],
    member: ' 宮地すみれ ',
    tickets: 0,
    status: 'planned',
  }, () => 'draft-1');

  assert.deepEqual(draft, {
    id: 'draft-1',
    eventSlug: 'hinatazaka_202605',
    date: '2026-05-31',
    slots: [1, 2],
    member: '宮地すみれ',
    tickets: 1,
    status: 'planned',
  });
});

test('countPendingDraftRecords sums slot counts across pending drafts', () => {
  const total = countPendingDraftRecords([
    {
      id: 'draft-1',
      eventSlug: 'hinatazaka_202605',
      date: '2026-05-31',
      slots: [1, 2],
      member: '下田衣珠季',
      tickets: 1,
      status: 'planned',
    },
    {
      id: 'draft-2',
      eventSlug: 'hinatazaka_202605',
      date: '2026-06-07',
      slots: [4],
      member: '宮地すみれ',
      tickets: 3,
      status: 'won',
    },
  ]);

  assert.equal(total, 3);
});
