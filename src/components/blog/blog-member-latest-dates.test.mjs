import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectLatestMemberDateLabels,
  collectLatestMemberDatesFromBlogs,
  countMembersMissingLatestDates,
} from './blog-member-latest-dates.ts';

test('collectLatestMemberDatesFromBlogs keeps the newest post per member', () => {
  const labels = collectLatestMemberDatesFromBlogs([
    { member: '村井優', publish_date: '2026/04/24 21:10:00' },
    { member: '村井優', publish_date: '2026/04/25 00:15:00' },
    { member: ' 的野美青 ', publish_date: '2026/04/23 09:30:00' },
  ]);

  assert.equal(labels.get('村井優'), '04.25 00:15 更新');
  assert.equal(labels.get('的野美青'), '04.23 09:30 更新');
});

test('collectLatestMemberDateLabels falls back to blog data when API omits lastPostDates', () => {
  const labels = collectLatestMemberDateLabels(
    {
      generations: [
        {
          name: '三期生',
          members: ['村井優', '的野美青'],
        },
      ],
      graduated: [],
    },
    [
      { member: '村井優', publish_date: '2026/04/25 00:15:00' },
      { member: '的野美青', publish_date: '2026/04/23 09:30:00' },
    ]
  );

  assert.equal(labels.get('村井優'), '04.25 00:15 更新');
  assert.equal(labels.get('的野美青'), '04.23 09:30 更新');
});

test('collectLatestMemberDateLabels preserves API data and fills only missing members from blogs', () => {
  const labels = collectLatestMemberDateLabels(
    {
      generations: [
        {
          name: '三期生',
          members: ['村井優', '的野美青'],
          lastPostDates: {
            村井優: '2026/04/24 23:59:00',
          },
        },
      ],
      graduated: [],
    },
    [
      { member: '村井優', publish_date: '2026/04/25 00:15:00' },
      { member: '的野美青', publish_date: '2026/04/23 09:30:00' },
    ]
  );

  assert.equal(labels.get('村井優'), '04.24 23:59 更新');
  assert.equal(labels.get('的野美青'), '04.23 09:30 更新');
});

test('countMembersMissingLatestDates counts active members without API latest dates', () => {
  const missing = countMembersMissingLatestDates({
    generations: [
      {
        name: '三期生',
        members: ['村井優', '的野美青', '小島凪紗'],
        lastPostDates: {
          村井優: '2026/04/24 23:59:00',
        },
      },
    ],
    graduated: ['小島凪紗'],
  });

  assert.equal(missing, 1);
});
