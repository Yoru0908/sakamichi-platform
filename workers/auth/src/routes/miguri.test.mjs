import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGoogleCalendarUrl, buildIcsCalendar, normalizeMiguriPayload } from './miguri.ts';

test('normalizeMiguriPayload expands dates slots and members into syncable records', () => {
  const normalized = normalizeMiguriPayload({
    events: [
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
        dates: ['2026-05-31'],
        slots: [
          {
            slotNumber: 1,
            receptionStart: '10:45',
            startTime: '11:00',
            receptionEnd: '11:45',
            endTime: '12:00',
          },
        ],
        members: ['小坂菜緒', '正源司陽子'],
      },
    ],
  });

  assert.equal(normalized.events.length, 1);
  assert.equal(normalized.windows.length, 1);
  assert.equal(normalized.slots.length, 1);
  assert.equal(normalized.slotMembers.length, 2);
  assert.equal(normalized.slotMembers[0].memberName, '小坂菜緒');
});

test('buildGoogleCalendarUrl creates a prefilled Google Calendar event link', () => {
  const url = buildGoogleCalendarUrl({
    title: '日向坂46 ミーグリ',
    description: '第1部 小坂菜緒 3枚',
    location: 'Fortune Music Online',
    startAt: '2026-05-31T11:00:00+09:00',
    endAt: '2026-05-31T12:00:00+09:00',
  });

  assert.ok(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
  assert.ok(url.includes('text='));
  assert.ok(url.includes('dates='));
});

test('buildIcsCalendar renders valid VCALENDAR content', () => {
  const ics = buildIcsCalendar([
    {
      uid: 'entry-1',
      title: '日向坂46 ミーグリ',
      description: '第1部 小坂菜緒 3枚',
      location: 'Fortune Music Online',
      startAt: '2026-05-31T11:00:00+09:00',
      endAt: '2026-05-31T12:00:00+09:00',
    },
  ]);

  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(ics.includes('SUMMARY:日向坂46 ミーグリ'));
  assert.ok(ics.includes('END:VCALENDAR'));
});
