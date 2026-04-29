import test from 'node:test';
import assert from 'node:assert/strict';

import { syncMiguri } from './sync-miguri.mjs';

test('syncMiguri builds payload from Fortune events and posts it to the manage sync endpoint', async () => {
  let called = null;

  const result = await syncMiguri({
    endpoint: 'https://api.46log.com/api/manage/miguri/sync',
    secret: 'test-secret',
    loadEvents: async () => [
      {
        slug: 'hinatazaka_202605',
        group: 'hinatazaka',
        title: '日向坂46 17th ミーグリ',
        sourceUrl: 'https://fortunemusic.jp/hinatazaka_202605/',
        saleType: '抽選販売',
        windows: [
          {
            label: '第1次受付',
            start: '2026年4月8日（水）14:00',
            end: '2026年4月9日（木）14:00',
          },
        ],
        dates: ['2026-06-07', '2026-05-31'],
        slots: [
          {
            slotNumber: 2,
            receptionStart: '12:15',
            startTime: '12:30',
            receptionEnd: '13:15',
            endTime: '13:30',
          },
          {
            slotNumber: 1,
            receptionStart: '10:45',
            startTime: '11:00',
            receptionEnd: '11:45',
            endTime: '12:00',
          },
        ],
        members: ['正源司陽子', '小坂菜緒', '小坂菜緒'],
      },
    ],
    fetchImpl: async (url, init) => {
      called = { url, init };
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.equal(called.url, 'https://api.46log.com/api/manage/miguri/sync');
  assert.equal(called.init.method, 'POST');
  assert.equal(called.init.headers['x-miguri-sync-secret'], 'test-secret');

  const body = JSON.parse(called.init.body);
  assert.equal(body.events.length, 1);
  assert.deepEqual(body.events[0].dates, ['2026-05-31', '2026-06-07']);
  assert.deepEqual(
    body.events[0].slots.map((slot) => slot.slotNumber),
    [1, 2],
  );
  assert.deepEqual(body.events[0].members, ['小坂菜緒', '正源司陽子']);
  assert.equal(result.posted, true);
});

test('syncMiguri dry run returns payload without posting', async () => {
  let posted = false;

  const result = await syncMiguri({
    dryRun: true,
    loadEvents: async () => [],
    fetchImpl: async () => {
      posted = true;
      return new Response('should not post', { status: 200 });
    },
  });

  assert.equal(posted, false);
  assert.equal(result.posted, false);
  assert.deepEqual(result.payload, { events: [] });
});
