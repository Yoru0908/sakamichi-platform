import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { signAccessToken } from '../../../shared/jwt.ts';
import * as miguriRoutes from './miguri.ts';
import * as manageMiguriRoutes from './manage-miguri.ts';
import { buildGoogleCalendarUrl, buildIcsCalendar, normalizeMiguriPayload } from './miguri.ts';
import { decodeHtmlEntities, normalizeCalendarDate } from '../utils/ics.ts';
import { diffArchivedEventSlugs, handleMiguriSync } from './manage-miguri.ts';

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
  assert.ok(ics.includes('STATUS:CONFIRMED'));
  assert.ok(ics.includes('END:VCALENDAR'));
  for (const line of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `ICS line exceeds 75 octets: ${line}`);
  }
});

test('calendar helpers normalize Fortune Music dates and HTML entities', () => {
  assert.equal(
    normalizeCalendarDate('2026年7月22日（水）14:00'),
    '2026-07-22T14:00:00+09:00',
  );
  assert.equal(decodeHtmlEntities('What&#039;s &amp; More'), "What's & More");
});

test('handleGetMiguriEvents prepends oshi member ahead of account favorites', async () => {
  const token = await signAccessToken('user-1', 'member', 'test-secret');

  class FakeStatement {
    constructor(db, sql) {
      this.db = db;
      this.sql = sql;
      this.args = [];
    }

    bind(...args) {
      this.args = args;
      return this;
    }

    async all() {
      return this.db.all(this.sql, this.args);
    }

    async first() {
      return this.db.first(this.sql, this.args);
    }
  }

  class FakeMainDb {
    prepare(sql) {
      return new FakeStatement(this, sql);
    }

    async first(sql) {
      if (sql.includes('SELECT oshi_member FROM users')) {
        return { oshi_member: '小坂菜緒' };
      }

      throw new Error(`Unexpected first() SQL: ${sql}`);
    }

    async all(sql) {
      if (sql.includes('FROM user_favorites')) {
        return {
          results: [
            { member_name: '正源司陽子', member_group: 'hinatazaka', added_at: '2026-04-01T00:00:00Z' },
            { member_name: '藤嶌果歩', member_group: 'hinatazaka', added_at: '2026-04-02T00:00:00Z' },
          ],
        };
      }

      if (sql.includes('FROM user_followed_members')) {
        return {
          results: [
            { member_name: '小坂菜緒', member_group: 'hinatazaka' },
          ],
        };
      }

      throw new Error(`Unexpected all() SQL: ${sql}`);
    }
  }

  class FakeMiguriDb {
    prepare(sql) {
      return new FakeStatement(this, sql);
    }

    async all(sql) {
      if (sql.includes('FROM miguri_events')) return { results: [] };
      if (sql.includes('FROM miguri_event_windows')) return { results: [] };
      if (sql.includes('FROM miguri_event_slots')) return { results: [] };
      if (sql.includes('FROM miguri_slot_members')) return { results: [] };
      if (sql.includes('FROM miguri_user_entries e')) return { results: [] };

      throw new Error(`Unexpected all() SQL: ${sql}`);
    }
  }

  const req = new Request('https://api.46log.com/api/miguri/events', {
    method: 'GET',
    headers: {
      cookie: `access_token=${token}`,
    },
  });

  const res = await miguriRoutes.handleGetMiguriEvents(req, {
    DB: new FakeMainDb(),
    MIGURI_DB: new FakeMiguriDb(),
    JWT_SECRET: 'test-secret',
  });
  const json = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(json.data.favorites, ['小坂菜緒', '正源司陽子', '藤嶌果歩']);
});

test('handleGetMiguriEvents returns oshi member when user_favorites is empty', async () => {
  const token = await signAccessToken('user-1', 'member', 'test-secret');

  class FakeStatement {
    constructor(db, sql) {
      this.db = db;
      this.sql = sql;
      this.args = [];
    }

    bind(...args) {
      this.args = args;
      return this;
    }

    async all() {
      return this.db.all(this.sql, this.args);
    }

    async first() {
      return this.db.first(this.sql, this.args);
    }
  }

  class FakeMainDb {
    prepare(sql) {
      return new FakeStatement(this, sql);
    }

    async first(sql) {
      if (sql.includes('SELECT oshi_member FROM users')) {
        return { oshi_member: '山川宇衣' };
      }
      throw new Error(`Unexpected first() SQL: ${sql}`);
    }

    async all(sql) {
      if (sql.includes('FROM user_favorites')) {
        return { results: [] };
      }
      throw new Error(`Unexpected all() SQL: ${sql}`);
    }
  }

  class FakeMiguriDb {
    prepare(sql) {
      return new FakeStatement(this, sql);
    }

    async all(sql) {
      if (sql.includes('FROM miguri_events')) {
        return { results: [] };
      }
      if (sql.includes('FROM miguri_event_windows')) {
        return { results: [] };
      }
      if (sql.includes('FROM miguri_event_slots')) {
        return { results: [] };
      }
      if (sql.includes('FROM miguri_slot_members')) {
        return { results: [] };
      }
      if (sql.includes('FROM miguri_user_entries')) {
        return { results: [] };
      }
      throw new Error(`Unexpected all() SQL: ${sql}`);
    }

    async first() {
      return null;
    }
  }

  const req = new Request('https://api.46log.com/api/miguri/events', {
    headers: { cookie: `access_token=${token}` },
  });

  const res = await miguriRoutes.handleGetMiguriEvents(req, {
    DB: new FakeMainDb(),
    MIGURI_DB: new FakeMiguriDb(),
    JWT_SECRET: 'test-secret',
  });
  const json = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(json.data.favorites, ['山川宇衣']);
});

test('handleCreateMiguriEntries rejects invalid member-slot combinations in multi-entry mode', async () => {
  const token = await signAccessToken('user-1', 'member', 'test-secret');

  class FakeStatement {
    constructor(db, sql) {
      this.db = db;
      this.sql = sql;
      this.args = [];
    }

    bind(...args) {
      this.args = args;
      return this;
    }

    async all() {
      return this.db.all(this.sql, this.args);
    }

    async first() {
      return this.db.first(this.sql, this.args);
    }

    async run() {
      return this.db.run(this.sql, this.args);
    }
  }

  class FakeMiguriDb {
    constructor() {
      this.inserted = [];
      this.slots = new Set([
        'hinatazaka_202605__2026-05-24__2',
        'hinatazaka_202605__2026-05-24__3',
      ]);
      this.slotMembers = new Set([
        'hinatazaka_202605__2026-05-24__2__正源司陽子',
      ]);
    }

    prepare(sql) {
      return new FakeStatement(this, sql);
    }

    async first(sql, args) {
      if (sql.includes('SELECT 1 FROM miguri_event_slots')) {
        const [eventSlug, eventDate, slotNumber] = args;
        return this.slots.has(`${eventSlug}__${eventDate}__${slotNumber}`) ? { 1: 1 } : null;
      }

      if (sql.includes('SELECT 1 FROM miguri_slot_members')) {
        const [eventSlug, eventDate, slotNumber, memberName] = args;
        return this.slotMembers.has(`${eventSlug}__${eventDate}__${slotNumber}__${memberName}`) ? { 1: 1 } : null;
      }

      throw new Error(`Unexpected first() SQL: ${sql}`);
    }

    async all(sql) {
      if (sql.includes('FROM miguri_user_entries e')) {
        return { results: this.inserted };
      }

      throw new Error(`Unexpected all() SQL: ${sql}`);
    }

    async run(sql, args) {
      if (sql.includes('INSERT INTO miguri_user_entries')) {
        this.inserted.push(args);
        return { success: true };
      }

      throw new Error(`Unexpected run() SQL: ${sql}`);
    }
  }

  const db = new FakeMiguriDb();
  const req = new Request('https://api.46log.com/api/miguri/entries', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `access_token=${token}`,
    },
    body: JSON.stringify({
      eventSlug: 'hinatazaka_202605',
      date: '2026-05-24',
      slots: [2, 3],
      members: ['正源司陽子'],
      tickets: 2,
      status: 'paid',
    }),
  });

  const res = await miguriRoutes.handleCreateMiguriEntries(req, {
    MIGURI_DB: db,
    JWT_SECRET: 'test-secret',
  });
  const json = await res.json();

  assert.equal(res.status, 400);
  assert.equal(json.success, false);
  assert.equal(db.inserted.length, 0);
});

test('miguri worker index wires calendar and entry routes', () => {
  const indexSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

  assert.match(indexSource, /handleGetMiguriEvents/);
  assert.match(indexSource, /handleCreateMiguriEntries/);
  assert.match(indexSource, /handleDeleteMiguriEntry/);
  assert.match(indexSource, /handleGetMiguriCalendarIcs/);
  assert.match(indexSource, /handleGetMiguriGoogleCalendarUrl/);
  assert.match(indexSource, /handleMiguriSync/);
  assert.match(indexSource, /syncMiguriFromSource/);
  assert.match(indexSource, /await syncMiguriFromSource\(/);
  assert.match(indexSource, /'GET \/api\/miguri\/events': handleGetMiguriEvents/);
  assert.match(indexSource, /'POST \/api\/miguri\/entries': handleCreateMiguriEntries/);
  assert.match(indexSource, /path\.startsWith\('\/api\/miguri\/entries\/'\) && method === 'DELETE'/);
  assert.match(indexSource, /'GET \/api\/miguri\/calendar\.ics': handleGetMiguriCalendarIcs/);
  assert.match(indexSource, /'GET \/api\/miguri\/calendar\/subscription': handleGetCalendarSubscription/);
  assert.match(indexSource, /handleGetLotteryCalendar/);
  assert.match(indexSource, /handleGetPersonalCalendar/);
  assert.match(indexSource, /'GET \/api\/miguri\/calendar\/google-url': handleGetMiguriGoogleCalendarUrl/);
  assert.match(indexSource, /'POST \/api\/manage\/miguri\/sync': handleMiguriSync/);
});

test('worker config exposes miguri routes and migration entry points', () => {
  const wranglerSource = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');
  const authPackageJson = JSON.parse(readFileSync(new URL('../../../auth/package.json', import.meta.url), 'utf8'));

  assert.match(wranglerSource, /pattern = "api\.46log\.com\/api\/miguri\/\*"/);
  assert.match(wranglerSource, /pattern = "api\.sakamichi-tools\.cn\/api\/miguri\/\*"/);
  assert.equal(authPackageJson.type, 'module');
  assert.equal(authPackageJson.scripts['db:migrate:miguri'], 'wrangler d1 execute miguri --file=./src/db/migrations/005_miguri.sql');
  assert.equal(authPackageJson.scripts['db:migrate:miguri-calendar'], 'wrangler d1 execute miguri --file=./src/db/migrations/009_miguri_calendar_subscriptions.sql');
});

test('diffArchivedEventSlugs returns active slugs missing from the latest sync payload', () => {
  assert.deepEqual(
    diffArchivedEventSlugs(
      ['hinatazaka_202605', 'nogizaka_202604', 'hinatazaka_202605'],
      ['hinatazaka_202605', 'sakurazaka_202606'],
    ),
    ['nogizaka_202604'],
  );
  assert.deepEqual(diffArchivedEventSlugs(['hinatazaka_202605'], []), []);
});

test('handleMiguriSync archives missing events while keeping incoming events active', async () => {
  class FakeStatement {
    constructor(db, sql) {
      this.db = db;
      this.sql = sql;
      this.args = [];
    }

    bind(...args) {
      this.args = args;
      return this;
    }

    async all() {
      return this.db.all(this.sql, this.args);
    }

    async run() {
      return this.db.run(this.sql, this.args);
    }
  }

  class FakeMiguriDb {
    constructor() {
      this.events = new Map([
        ['old_event', { slug: 'old_event', status: 'active' }],
      ]);
      this.windows = [];
      this.slots = [];
      this.slotMembers = [];
    }

    prepare(sql) {
      return new FakeStatement(this, sql);
    }

    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    }

    async all(sql, args) {
      if (sql.includes('SELECT slug') && sql.includes('FROM miguri_events')) {
        return {
          results: Array.from(this.events.values())
            .filter((row) => row.status !== 'archived')
            .map((row) => ({ slug: row.slug })),
        };
      }

      if (sql.includes('SELECT event_slug, label FROM miguri_event_windows')) {
        const slug = args[0];
        return {
          results: this.windows
            .filter((w) => w.eventSlug === slug)
            .map((w) => ({ event_slug: w.eventSlug, label: w.label })),
        };
      }

      throw new Error(`Unexpected all() SQL: ${sql}`);
    }

    async run(sql, args) {
      if (sql.includes('UPDATE miguri_events') && sql.includes("SET status = 'archived'")) {
        for (const slug of args) {
          const current = this.events.get(slug) || { slug };
          this.events.set(slug, { ...current, status: 'archived' });
        }
        return { success: true };
      }

      if (sql.includes('INSERT INTO miguri_events')) {
        const [slug, groupId, title, sourceUrl, saleType, syncedAt, rawPayload] = args;
        this.events.set(slug, {
          slug,
          groupId,
          title,
          sourceUrl,
          saleType,
          status: 'active',
          syncedAt,
          rawPayload,
        });
        return { success: true };
      }

      if (sql.includes('DELETE FROM miguri_event_windows')) {
        this.windows = this.windows.filter((row) => row.eventSlug !== args[0]);
        return { success: true };
      }

      if (sql.includes('DELETE FROM miguri_slot_members')) {
        this.slotMembers = this.slotMembers.filter((row) => row.eventSlug !== args[0]);
        return { success: true };
      }

      if (sql.includes('DELETE FROM miguri_event_slots')) {
        this.slots = this.slots.filter((row) => row.eventSlug !== args[0]);
        return { success: true };
      }

      if (sql.includes('INSERT INTO miguri_event_windows')) {
        const [eventSlug, label, start, end, sortOrder] = args;
        this.windows.push({ eventSlug, label, start, end, sortOrder });
        return { success: true };
      }

      if (sql.includes('INSERT INTO miguri_event_slots')) {
        const [eventSlug, eventDate, slotNumber, receptionStart, startTime, receptionEnd, endTime] = args;
        this.slots.push({ eventSlug, eventDate, slotNumber, receptionStart, startTime, receptionEnd, endTime });
        return { success: true };
      }

      if (sql.includes('INSERT INTO miguri_slot_members')) {
        const [eventSlug, eventDate, slotNumber, memberName] = args;
        this.slotMembers.push({ eventSlug, eventDate, slotNumber, memberName });
        return { success: true };
      }

      throw new Error(`Unexpected run() SQL: ${sql}`);
    }
  }

  const db = new FakeMiguriDb();
  const req = new Request('https://api.46log.com/api/manage/miguri/sync', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-miguri-sync-secret': 'test-secret',
    },
    body: JSON.stringify({
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
          members: ['小坂菜緒'],
        },
      ],
    }),
  });

  const res = await handleMiguriSync(req, {
    MIGURI_DB: db,
    MIGURI_SYNC_SECRET: 'test-secret',
  });
  const json = await res.json();

  assert.equal(res.status, 200);
  assert.equal(json.data.eventCount, 1);
  assert.equal(json.data.archivedEventCount, 1);
  assert.deepEqual(json.data.archivedEventSlugs, ['old_event']);
  assert.equal(db.events.get('old_event').status, 'archived');
  assert.equal(db.events.get('hinatazaka_202605').status, 'active');
  assert.equal(db.windows.length, 1);
  assert.equal(db.slots.length, 1);
  assert.equal(db.slotMembers.length, 1);
});

test('syncMiguriFromSource fetches fortune events and persists them without requiring an external sync secret', async () => {
  class FakeStatement {
    constructor(db, sql) {
      this.db = db;
      this.sql = sql;
      this.args = [];
    }

    bind(...args) {
      this.args = args;
      return this;
    }

    async all() {
      return this.db.all(this.sql, this.args);
    }

    async run() {
      return this.db.run(this.sql, this.args);
    }
  }

  class FakeMiguriDb {
    constructor() {
      this.events = new Map();
      this.windows = [];
      this.slots = [];
      this.slotMembers = [];
    }

    prepare(sql) {
      return new FakeStatement(this, sql);
    }

    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    }

    async all(sql, args) {
      if (sql.includes('SELECT slug') && sql.includes('FROM miguri_events')) {
        return { results: [] };
      }

      if (sql.includes('SELECT event_slug, label FROM miguri_event_windows')) {
        const slug = args[0];
        return {
          results: this.windows
            .filter((w) => w.eventSlug === slug)
            .map((w) => ({ event_slug: w.eventSlug, label: w.label })),
        };
      }

      throw new Error(`Unexpected all() SQL: ${sql}`);
    }

    async run(sql, args) {
      if (sql.includes('INSERT INTO miguri_events')) {
        const [slug, groupId, title, sourceUrl, saleType, syncedAt, rawPayload] = args;
        this.events.set(slug, {
          slug,
          groupId,
          title,
          sourceUrl,
          saleType,
          status: 'active',
          syncedAt,
          rawPayload,
        });
        return { success: true };
      }

      if (sql.includes('DELETE FROM miguri_event_windows')) {
        this.windows = this.windows.filter((row) => row.eventSlug !== args[0]);
        return { success: true };
      }

      if (sql.includes('DELETE FROM miguri_slot_members')) {
        this.slotMembers = this.slotMembers.filter((row) => row.eventSlug !== args[0]);
        return { success: true };
      }

      if (sql.includes('DELETE FROM miguri_event_slots')) {
        this.slots = this.slots.filter((row) => row.eventSlug !== args[0]);
        return { success: true };
      }

      if (sql.includes('INSERT INTO miguri_event_windows')) {
        const [eventSlug, label, start, end, sortOrder] = args;
        this.windows.push({ eventSlug, label, start, end, sortOrder });
        return { success: true };
      }

      if (sql.includes('INSERT INTO miguri_event_slots')) {
        const [eventSlug, eventDate, slotNumber, receptionStart, startTime, receptionEnd, endTime] = args;
        this.slots.push({ eventSlug, eventDate, slotNumber, receptionStart, startTime, receptionEnd, endTime });
        return { success: true };
      }

      if (sql.includes('INSERT INTO miguri_slot_members')) {
        const [eventSlug, eventDate, slotNumber, memberName] = args;
        this.slotMembers.push({ eventSlug, eventDate, slotNumber, memberName });
        return { success: true };
      }

      throw new Error(`Unexpected run() SQL: ${sql}`);
    }
  }

  const db = new FakeMiguriDb();
  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const result = await manageMiguriRoutes.syncMiguriFromSource(
    {
      MIGURI_DB: db,
      MIGURI_ALERT_WEBHOOK_URL: 'https://blog-push.46log.com/webhook/miguri-alert',
      MIGURI_ALERT_WEBHOOK_SECRET: 'relay-secret',
      MIGURI_NEW_WINDOW_NOTIFY_GROUPS: '768670254',
      MIGURI_WEIBO_ENABLED: 'true',
      MIGURI_WEIBO_WEBHOOK_URL: 'https://blog-push.46log.com/webhook/weibo-publish',
    },
    async () => ([
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
        members: ['小坂菜緒'],
      },
    ]),
  );
  globalThis.fetch = originalFetch;

  assert.equal(result.eventCount, 1);
  assert.equal(result.archivedEventCount, 0);
  assert.equal(db.events.get('hinatazaka_202605').status, 'active');
  assert.equal(db.windows.length, 1);
  assert.equal(db.slots.length, 1);
  assert.equal(db.slotMembers.length, 1);
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].url, 'https://blog-push.46log.com/webhook/miguri-alert');
  assert.deepEqual(JSON.parse(fetchCalls[0].init.body).groupIds, ['768670254']);
  assert.equal(fetchCalls[1].url, 'https://blog-push.46log.com/webhook/weibo-publish');
  assert.equal(fetchCalls[1].init.headers['x-webhook-secret'], 'relay-secret');
  const weiboPayload = JSON.parse(fetchCalls[1].init.body);
  assert.equal(weiboPayload.category, 'miguri_new_window');
  assert.match(weiboPayload.text, /【ミーグリ新受付】/);
  assert.match(weiboPayload.text, /日向坂46 hinatazaka_202605/);
  assert.match(weiboPayload.text, /#日向坂46# #ミーグリ#/);
});

 test('syncMiguriFromSource blocks anomalous member drops before overwriting D1 and sends Napcat alert', async () => {
   class FakeStatement {
     constructor(db, sql) {
       this.db = db;
       this.sql = sql;
       this.args = [];
     }

     bind(...args) {
       this.args = args;
       return this;
     }

     async all() {
       return this.db.all(this.sql, this.args);
     }

     async run() {
       return this.db.run(this.sql, this.args);
     }
   }

   class FakeMiguriDb {
     constructor() {
       this.events = new Map([
         ['hinatazaka_202605', {
           slug: 'hinatazaka_202605',
           status: 'active',
           rawPayload: JSON.stringify({
             slug: 'hinatazaka_202605',
             group: 'hinatazaka',
             title: '日向坂46 17th ミーグリ',
             sourceUrl: 'https://fortunemusic.jp/hinatazaka_202605/',
             saleType: '抽選販売',
             windows: [],
             dates: ['2026-05-31'],
             slots: [{
               slotNumber: 1,
               receptionStart: '10:45',
               startTime: '11:00',
               receptionEnd: '11:45',
               endTime: '12:00',
             }],
             members: ['小坂菜緒', '正源司陽子', '藤嶌果歩', '金村美玖', '松尾桜', '宮地すみれ'],
           }),
         }],
       ]);
       this.windows = [{ eventSlug: 'hinatazaka_202605' }];
       this.slots = [{ eventSlug: 'hinatazaka_202605', eventDate: '2026-05-31', slotNumber: 1 }];
       this.slotMembers = [{ eventSlug: 'hinatazaka_202605', eventDate: '2026-05-31', slotNumber: 1, memberName: '小坂菜緒' }];
       this.runCalls = [];
     }

     prepare(sql) {
       return new FakeStatement(this, sql);
     }

     async all(sql) {
       if (sql.includes('SELECT slug, raw_payload') && sql.includes('FROM miguri_events')) {
         return {
           results: Array.from(this.events.values()).map((event) => ({ slug: event.slug, raw_payload: event.rawPayload })),
         };
       }

       if (sql.includes('SELECT slug') && sql.includes('FROM miguri_events')) {
         return {
           results: Array.from(this.events.values()).map((event) => ({ slug: event.slug })),
         };
       }

       throw new Error(`Unexpected all() SQL: ${sql}`);
     }

     async run(sql, args) {
       this.runCalls.push({ sql, args });
       throw new Error(`Unexpected run() SQL: ${sql}`);
     }
   }

   const db = new FakeMiguriDb();
   const fetchCalls = [];
   const originalFetch = globalThis.fetch;
   globalThis.fetch = async (url, init) => {
     fetchCalls.push({ url, init });
     return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
   };

   await assert.rejects(
     manageMiguriRoutes.syncMiguriFromSource(
       {
         MIGURI_DB: db,
         NAPCAT_NOTIFY_URL: 'http://napcat.local',
         NAPCAT_NOTIFY_GROUPS: '123456',
       },
       async () => ([
         {
           slug: 'hinatazaka_202605',
           group: 'hinatazaka',
           title: '日向坂46 17th ミーグリ',
           sourceUrl: 'https://fortunemusic.jp/hinatazaka_202605/',
           saleType: '抽選販売',
           windows: [],
           dates: ['2026-05-31'],
           slots: [{
             slotNumber: 1,
             receptionStart: '10:45',
             startTime: '11:00',
             receptionEnd: '11:45',
             endTime: '12:00',
           }],
           members: ['小坂菜緒', '正源司陽子'],
         },
       ]),
     ),
     /保护|保護|anomal/i,
   );

   globalThis.fetch = originalFetch;

   assert.equal(db.runCalls.length, 0);
   assert.equal(fetchCalls.length, 1);
   assert.equal(fetchCalls[0].url, 'http://napcat.local/send_group_msg');
   assert.match(JSON.parse(fetchCalls[0].init.body).message[0].data.text, /hinatazaka_202605/);
 });

 test('syncMiguriFromSource sends Napcat alert when source loading throws', async () => {
   const fetchCalls = [];
   const originalFetch = globalThis.fetch;
   globalThis.fetch = async (url, init) => {
     fetchCalls.push({ url, init });
     return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
   };

   await assert.rejects(
     manageMiguriRoutes.syncMiguriFromSource(
       {
         MIGURI_DB: { prepare() { throw new Error('db should not be touched'); } },
         NAPCAT_NOTIFY_URL: 'http://napcat.local',
         NAPCAT_NOTIFY_GROUPS: '123456',
       },
       async () => {
         throw new Error('fortune source down');
       },
     ),
     /fortune source down/,
   );

   globalThis.fetch = originalFetch;

   assert.equal(fetchCalls.length, 1);
   assert.equal(fetchCalls[0].url, 'http://napcat.local/send_group_msg');
   assert.match(JSON.parse(fetchCalls[0].init.body).message[0].data.text, /fortune source down/);
 });

 test('syncMiguriFromSource sends alerts through Homeserver webhook relay when configured', async () => {
   const fetchCalls = [];
   const originalFetch = globalThis.fetch;
   globalThis.fetch = async (url, init) => {
     fetchCalls.push({ url, init });
     return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'content-type': 'application/json' } });
   };

   await assert.rejects(
     manageMiguriRoutes.syncMiguriFromSource(
       {
         MIGURI_DB: { prepare() { throw new Error('db should not be touched'); } },
         MIGURI_ALERT_WEBHOOK_URL: 'https://blog-push.46log.com/webhook/miguri-alert',
         MIGURI_ALERT_WEBHOOK_SECRET: 'relay-secret',
         NAPCAT_NOTIFY_GROUPS: '213658334,1059030628',
       },
       async () => {
         throw new Error('fortune source down');
       },
     ),
     /fortune source down/,
   );

   globalThis.fetch = originalFetch;

   assert.equal(fetchCalls.length, 1);
   assert.equal(fetchCalls[0].url, 'https://blog-push.46log.com/webhook/miguri-alert');
   assert.equal(fetchCalls[0].init.headers['x-webhook-secret'], 'relay-secret');
   assert.deepEqual(JSON.parse(fetchCalls[0].init.body).groupIds, ['213658334', '1059030628']);
   assert.match(JSON.parse(fetchCalls[0].init.body).message, /fortune source down/);
 });

 test('handleMiguriSync returns conflict for anomalous payload and leaves D1 untouched', async () => {
   class FakeStatement {
     constructor(db, sql) {
       this.db = db;
       this.sql = sql;
       this.args = [];
     }

     bind(...args) {
       this.args = args;
       return this;
     }

     async all() {
       return this.db.all(this.sql, this.args);
     }

     async run() {
       return this.db.run(this.sql, this.args);
     }
   }

   class FakeMiguriDb {
     constructor() {
       this.events = new Map([
         ['hinatazaka_202605', {
           slug: 'hinatazaka_202605',
           status: 'active',
           rawPayload: JSON.stringify({
             slug: 'hinatazaka_202605',
             group: 'hinatazaka',
             title: '日向坂46 17th ミーグリ',
             sourceUrl: 'https://fortunemusic.jp/hinatazaka_202605/',
             saleType: '抽選販売',
             windows: [],
             dates: ['2026-05-31'],
             slots: [{
               slotNumber: 1,
               receptionStart: '10:45',
               startTime: '11:00',
               receptionEnd: '11:45',
               endTime: '12:00',
             }],
             members: ['小坂菜緒', '正源司陽子', '藤嶌果歩', '金村美玖', '松尾桜', '宮地すみれ'],
           }),
         }],
       ]);
       this.runCalls = [];
     }

     prepare(sql) {
       return new FakeStatement(this, sql);
     }

     async all(sql) {
       if (sql.includes('SELECT slug, raw_payload') && sql.includes('FROM miguri_events')) {
         return {
           results: Array.from(this.events.values()).map((event) => ({ slug: event.slug, raw_payload: event.rawPayload })),
         };
       }

       if (sql.includes('SELECT slug') && sql.includes('FROM miguri_events')) {
         return {
           results: Array.from(this.events.values()).map((event) => ({ slug: event.slug })),
         };
       }

       throw new Error(`Unexpected all() SQL: ${sql}`);
     }

     async run(sql, args) {
       this.runCalls.push({ sql, args });
       throw new Error(`Unexpected run() SQL: ${sql}`);
     }
   }

   const db = new FakeMiguriDb();
   const req = new Request('https://api.46log.com/api/manage/miguri/sync', {
     method: 'POST',
     headers: {
       'content-type': 'application/json',
       'x-miguri-sync-secret': 'test-secret',
     },
     body: JSON.stringify({
       events: [
         {
           slug: 'hinatazaka_202605',
           group: 'hinatazaka',
           title: '日向坂46 17th ミーグリ',
           sourceUrl: 'https://fortunemusic.jp/hinatazaka_202605/',
           saleType: '抽選販売',
           windows: [],
           dates: ['2026-05-31'],
           slots: [{
             slotNumber: 1,
             receptionStart: '10:45',
             startTime: '11:00',
             receptionEnd: '11:45',
             endTime: '12:00',
           }],
           members: ['小坂菜緒', '正源司陽子'],
         },
       ],
     }),
   });

   const res = await handleMiguriSync(req, {
     MIGURI_DB: db,
     MIGURI_SYNC_SECRET: 'test-secret',
   });
   const json = await res.json();

   assert.equal(res.status, 409);
   assert.match(json.error, /保护|保護|anomal/i);
   assert.equal(db.runCalls.length, 0);
 });
