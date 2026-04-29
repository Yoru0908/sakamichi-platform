import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPendingMeguriDraft,
  countPendingDraftRecords,
  groupEntriesByDateAndSlot,
  inferEventState,
  sortEventsForDisplay,
  summarizeEntries,
} from './meguri-helpers.ts';

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
