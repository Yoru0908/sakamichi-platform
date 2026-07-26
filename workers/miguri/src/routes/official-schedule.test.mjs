import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIcsCalendar } from '../utils/ics.ts';
import {
  handleGetCompleteGroupCalendar,
  handleGetOfficialScheduleCalendar,
} from './calendar-feeds.ts';
import {
  fetchOfficialScheduleMonth,
  officialScheduleMonths,
  parseHinatazakaSchedule,
  parseNogizakaSchedule,
  parseSakurazakaSchedule,
  scheduleTiming,
} from './official-schedule.ts';

test('Nogizaka JSONP supports timed, after-midnight and all-day schedule items', () => {
  const events = parseNogizakaSchedule(`res({"data":[
    {"code":"tv-1","title":"深夜番組","date":"2026/07/01","start_time":"25:00","end_time":"27:00","cate":"tv","link":"https://example.com/tv"},
    {"code":"book-1","title":"雑誌発売","date":"2026/07/02","start_time":"","end_time":"","cate":"book","link":"https://example.com/book"}
  ]});`);

  assert.equal(events.length, 2);
  assert.equal(events[0].startAt, '2026-07-01T16:00:00.000Z');
  assert.equal(events[0].endAt, '2026-07-01T18:00:00.000Z');
  assert.equal(events[1].allDay, true);
  assert.equal(events[1].startAt, '2026-07-02');
  assert.equal(events[1].endAt, '2026-07-03');
});

test('Sakurazaka modal payload keeps category, members and stable source URL', () => {
  const html = `
    <div class="module-modal js-schedule-detail count_11820_01">
      <div class="cate-media">
        <p class="date wf-a">2026.07.01&nbsp;&nbsp;23:10～23:40</p>
        <p class="type">テレビ</p>
        <h2 class="title">朝日放送テレビ「これ余談なんですけど・・・」</h2>
        <ul class="members fx"><li><a href="/artist/55">大沼 晶保</a></li></ul>
      </div>
    </div>
  `;
  const [event] = parseSakurazakaSchedule(html);

  assert.equal(event.title, '朝日放送テレビ「これ余談なんですけど・・・」');
  assert.match(event.description, /種別：テレビ/);
  assert.match(event.description, /メンバー：大沼 晶保/);
  assert.equal(event.startAt, '2026-07-01T14:10:00.000Z');
  assert.match(event.url, /dy=202607#count_11820_01$/);
});

test('Hinatazaka server-rendered list produces official detail links', () => {
  const html = `
    <div class="p-schedule__list-group">
      <div class="c-schedule__date--list"><span>2</span><b>木</b></div>
      <ul>
        <li class="p-schedule__item">
          <a href="/s/official/media/detail/11486?ima=0000">
            <div class="c-schedule__category category_media">ラジオ</div>
            <div class="c-schedule__time--list">24:00～</div>
            <p class="c-schedule__text">日向坂46のラジオ</p>
          </a>
        </li>
      </ul>
    </div>
  `;
  const [event] = parseHinatazakaSchedule(html, '202607');

  assert.equal(event.title, '日向坂46のラジオ');
  assert.equal(event.startAt, '2026-07-02T15:00:00.000Z');
  assert.equal(event.endAt, '2026-07-02T16:00:00.000Z');
  assert.equal(event.url, 'https://www.hinatazaka46.com/s/official/media/detail/11486?ima=0000');
});

test('all-day events use DATE values in ICS instead of midnight timestamps', () => {
  const timing = scheduleTiming('2026-07-03', '');
  const ics = buildIcsCalendar([{
    uid: 'all-day-test@46log.com',
    title: '雑誌発売',
    description: '公式スケジュール',
    location: '公式サイト',
    ...timing,
  }]);

  assert.match(ics, /DTSTART;VALUE=DATE:20260703/);
  assert.match(ics, /DTEND;VALUE=DATE:20260704/);
  assert.doesNotMatch(ics, /DTSTART:20260703T/);
});

test('month window is calculated in JST and crosses year boundaries', () => {
  assert.deepEqual(
    officialScheduleMonths(new Date('2026-01-01T00:30:00Z'), -1, 3),
    ['202512', '202601', '202602'],
  );
});

test('official month requests are aborted when an upstream stalls', async () => {
  const stalledFetch = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  });

  await assert.rejects(
    fetchOfficialScheduleMonth('nogizaka', '202607', stalledFetch, 5),
    (error) => error?.name === 'AbortError',
  );
});

test('official and complete feeds stay separate while complete feed merges Miguri windows', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`res({"data":[{
    "code":"official-1",
    "title":"公式ライブ",
    "date":"2026/08/01",
    "start_time":"18:00",
    "end_time":"20:00",
    "cate":"live",
    "link":"https://www.nogizaka46.com/live"
  }]});`, { status: 200 });

  const db = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async all() {
          return {
            results: [{
              slug: 'nogizaka_202608',
              group_id: 'nogizaka',
              title: '乃木坂46 ミーグリ',
              source_url: 'https://fortunemusic.jp/nogizaka_202608/',
              sale_type: '抽選販売',
              updated_at: '2026-07-26 05:00:00',
              label: '第1次受付',
              start_at: '2026年7月27日（月）14:00',
              end_at: '2026年7月28日（火）14:00',
            }],
          };
        },
      };
    },
  };

  try {
    const officialResponse = await handleGetOfficialScheduleCalendar(
      new Request('https://api.46log.com/api/miguri/calendar/official/nogizaka.ics'),
      { MIGURI_DB: db },
      'nogizaka',
    );
    const officialIcs = await officialResponse.text();
    assert.match(officialIcs, /UID:official:nogizaka:official-1/);
    assert.doesNotMatch(officialIcs, /UID:miguri-window:/);

    const completeResponse = await handleGetCompleteGroupCalendar(
      new Request('https://api.46log.com/api/miguri/calendar/complete/nogizaka.ics'),
      { MIGURI_DB: db },
      'nogizaka',
    );
    const completeIcs = await completeResponse.text();
    assert.match(completeIcs, /X-WR-CALNAME:乃木坂46 全部日程/);
    assert.match(completeIcs, /UID:official:nogizaka:official-1/);
    assert.match(completeIcs, /UID:miguri-window:nogizaka_202608:第1次受付@46log\.com/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
