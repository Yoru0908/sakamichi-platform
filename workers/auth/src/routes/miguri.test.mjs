import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { signAccessToken } from '../utils/jwt.ts';
import * as miguriRoutes from './miguri.ts';
import * as manageMiguriRoutes from './manage-miguri.ts';
import { buildGoogleCalendarUrl, buildIcsCalendar, normalizeMiguriPayload } from './miguri.ts';
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
  assert.ok(ics.includes('END:VCALENDAR'));
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

test('auth worker index wires miguri routes', () => {
  const indexSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

  assert.match(indexSource, /handleGetMiguriEvents/);
  assert.match(indexSource, /handleCreateMiguriEntries/);
  assert.match(indexSource, /handleDeleteMiguriEntry/);
  assert.match(indexSource, /handleGetMiguriCalendarIcs/);
  assert.match(indexSource, /handleGetMiguriGoogleCalendarUrl/);
  assert.match(indexSource, /handleMiguriSync/);
  assert.match(indexSource, /syncMiguriFromSource/);
  assert.match(indexSource, /await syncMiguriFromSource\(/);
  assert.match(indexSource, /path === '\/api\/miguri\/events' && method === 'GET'/);
  assert.match(indexSource, /path === '\/api\/miguri\/entries' && method === 'POST'/);
  assert.match(indexSource, /path\.startsWith\('\/api\/miguri\/entries\/'\) && method === 'DELETE'/);
  assert.match(indexSource, /path === '\/api\/miguri\/calendar\.ics' && method === 'GET'/);
  assert.match(indexSource, /path === '\/api\/miguri\/calendar\/google-url' && method === 'GET'/);
  assert.match(indexSource, /path === '\/api\/manage\/miguri\/sync' && method === 'POST'/);
});

test('worker config exposes miguri routes and migration entry points', () => {
  const wranglerSource = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8');
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

  assert.match(wranglerSource, /pattern = "api\.46log\.com\/api\/miguri\/\*"/);
  assert.match(wranglerSource, /pattern = "api\.sakamichi-tools\.cn\/api\/miguri\/\*"/);
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.scripts['db:migrate:miguri'], 'wrangler d1 execute miguri --file=./src/db/migrations/005_miguri.sql');
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

    async all(sql) {
      if (sql.includes('SELECT slug') && sql.includes('FROM miguri_events')) {
        return {
          results: Array.from(this.events.values())
            .filter((row) => row.status !== 'archived')
            .map((row) => ({ slug: row.slug })),
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

    async all(sql) {
      if (sql.includes('SELECT slug') && sql.includes('FROM miguri_events')) {
        return { results: [] };
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
  const result = await manageMiguriRoutes.syncMiguriFromSource(
    { MIGURI_DB: db },
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

  assert.equal(result.eventCount, 1);
  assert.equal(result.archivedEventCount, 0);
  assert.equal(db.events.get('hinatazaka_202605').status, 'active');
  assert.equal(db.windows.length, 1);
  assert.equal(db.slots.length, 1);
  assert.equal(db.slotMembers.length, 1);
});
