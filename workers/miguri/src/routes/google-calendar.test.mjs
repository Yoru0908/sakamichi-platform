import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as googleCalendarRoutes from './google-calendar.ts';

test('parseGoogleAuthState supports legacy origin state and structured calendar connect state', () => {
  assert.deepEqual(
    googleCalendarRoutes.parseGoogleAuthState(encodeURIComponent('https://46log.com')),
    {
      origin: 'https://46log.com',
      action: 'login',
      returnTo: '/',
    },
  );

  const encoded = googleCalendarRoutes.buildGoogleAuthState({
    origin: 'https://46log.com',
    action: 'calendar_connect',
    returnTo: '/prototypes/miguri',
  });

  assert.deepEqual(
    googleCalendarRoutes.parseGoogleAuthState(encoded),
    {
      origin: 'https://46log.com',
      action: 'calendar_connect',
      returnTo: '/prototypes/miguri',
    },
  );
});

test('syncMiguriEntryToGoogleCalendar creates a Google Calendar event and stores the mapping', async () => {
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

    async first() {
      return this.db.first(this.sql, this.args);
    }

    async all() {
      return this.db.all(this.sql, this.args);
    }

    async run() {
      return this.db.run(this.sql, this.args);
    }
  }

  class FakeAuthDb {
    constructor() {
      this.connection = {
        user_id: 'user-1',
        google_email: 'user@gmail.com',
        calendar_id: 'primary',
        refresh_token: 'refresh-token',
        access_token: null,
        access_token_expires_at: null,
      };
      this.mappings = new Map();
    }

    prepare(sql) {
      return new FakeStatement(this, sql);
    }

    async first(sql, args) {
      if (sql.includes('FROM user_google_calendar_connections')) {
        return this.connection;
      }

      if (sql.includes('FROM miguri_google_calendar_events')) {
        return this.mappings.get(args[1]) || null;
      }

      throw new Error(`Unexpected first() SQL: ${sql}`);
    }

    async all() {
      throw new Error('Unexpected all() call on auth DB');
    }

    async run(sql, args) {
      if (sql.includes('UPDATE user_google_calendar_connections')) {
        this.connection = {
          ...this.connection,
          access_token: args[0],
          access_token_expires_at: args[1],
        };
        return { success: true };
      }

      if (sql.includes('INSERT INTO miguri_google_calendar_events')) {
        const [id, userId, entryId, calendarId, googleEventId, syncedAt] = args;
        this.mappings.set(entryId, {
          id,
          user_id: userId,
          miguri_entry_id: entryId,
          calendar_id: calendarId,
          google_event_id: googleEventId,
          last_synced_at: syncedAt,
        });
        return { success: true };
      }

      throw new Error(`Unexpected run() SQL: ${sql}`);
    }
  }

  class FakeMiguriDb {
    prepare(sql) {
      return new FakeStatement(this, sql);
    }

    async first(sql, args) {
      if (sql.includes('FROM miguri_user_entries e')) {
        return {
          id: args[1],
          event_slug: 'hinatazaka_202605',
          member_name: '正源司陽子',
          event_date: '2026-06-07',
          slot_number: 2,
          tickets: 5,
          status: 'won',
          event_title: '日向坂46 17th ミーグリ',
          group_id: 'hinatazaka',
          start_time: '12:30',
          end_time: '13:30',
        };
      }

      throw new Error(`Unexpected first() SQL: ${sql}`);
    }

    async all() {
      throw new Error('Unexpected all() call on miguri DB');
    }

    async run() {
      throw new Error('Unexpected run() call on miguri DB');
    }
  }

  const fetchCalls = [];
  const fetchImpl = async (url, init = {}) => {
    fetchCalls.push({ url, init });

    if (`${url}` === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({
        access_token: 'fresh-access-token',
        expires_in: 3600,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (`${url}` === 'https://www.googleapis.com/calendar/v3/calendars/primary/events') {
      return new Response(JSON.stringify({ id: 'google-event-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const result = await googleCalendarRoutes.syncMiguriEntryToGoogleCalendar(
    {
      DB: new FakeAuthDb(),
      MIGURI_DB: new FakeMiguriDb(),
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
    },
    'user-1',
    'entry-1',
    fetchImpl,
  );

  assert.equal(result.connected, true);
  assert.equal(result.synced, true);
  assert.equal(result.googleEventId, 'google-event-1');
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[1].init.method, 'POST');
  const body = JSON.parse(fetchCalls[1].init.body);
  assert.equal(body.summary, '日向坂46 ミーグリ - 正源司陽子');
  assert.equal(body.location, 'Fortune Music Online');
});

 test('syncMiguriWindowToGoogleCalendar creates a Google Calendar event for a reception window', async () => {
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

     async first() {
       return this.db.first(this.sql, this.args);
     }

     async all() {
       return this.db.all(this.sql, this.args);
     }

     async run() {
       return this.db.run(this.sql, this.args);
     }
   }

   class FakeAuthDb {
     constructor() {
       this.connection = {
         user_id: 'user-1',
         google_email: 'user@gmail.com',
         calendar_id: 'primary',
         refresh_token: 'refresh-token',
         access_token: null,
         access_token_expires_at: null,
         sync_enabled: 1,
       };
       this.mappings = new Map();
     }

     prepare(sql) {
       return new FakeStatement(this, sql);
     }

     async first(sql, args) {
       if (sql.includes('FROM user_google_calendar_connections')) {
         return this.connection;
       }

       if (sql.includes('FROM miguri_google_calendar_events')) {
         return this.mappings.get(args[1]) || null;
       }

       throw new Error(`Unexpected first() SQL: ${sql}`);
     }

     async all() {
       throw new Error('Unexpected all() call on auth DB');
     }

     async run(sql, args) {
       if (sql.includes('UPDATE user_google_calendar_connections')) {
         this.connection = {
           ...this.connection,
           access_token: args[0],
           access_token_expires_at: args[1],
         };
         return { success: true };
       }

       if (sql.includes('INSERT INTO miguri_google_calendar_events')) {
         const [id, userId, syncItemId, calendarId, googleEventId, syncedAt] = args;
         this.mappings.set(syncItemId, {
           id,
           user_id: userId,
           miguri_entry_id: syncItemId,
           calendar_id: calendarId,
           google_event_id: googleEventId,
           last_synced_at: syncedAt,
         });
         return { success: true };
       }

       throw new Error(`Unexpected run() SQL: ${sql}`);
     }
   }

   class FakeMiguriDb {
     prepare(sql) {
       return new FakeStatement(this, sql);
     }

     async first(sql) {
       if (sql.includes('FROM miguri_event_windows w')) {
         return {
           event_slug: 'hinatazaka_202605',
           label: '第4次受付',
           start_at: '2026年4月30日（水）14:00',
           end_at: '2026年5月1日（木）14:00',
           sort_order: 3,
           event_title: '日向坂46 17th ミーグリ',
           group_id: 'hinatazaka',
           first_event_date: '2026-06-07',
         };
       }

       throw new Error(`Unexpected first() SQL: ${sql}`);
     }

     async all() {
       throw new Error('Unexpected all() call on miguri DB');
     }

     async run() {
       throw new Error('Unexpected run() call on miguri DB');
     }
   }

   const fetchCalls = [];
   const fetchImpl = async (url, init = {}) => {
     fetchCalls.push({ url, init });

     if (`${url}` === 'https://oauth2.googleapis.com/token') {
       return new Response(JSON.stringify({
         access_token: 'fresh-access-token',
         expires_in: 3600,
       }), { status: 200, headers: { 'content-type': 'application/json' } });
     }

     if (`${url}` === 'https://www.googleapis.com/calendar/v3/calendars/primary/events') {
       return new Response(JSON.stringify({ id: 'google-window-event-1' }), {
         status: 200,
         headers: { 'content-type': 'application/json' },
       });
     }

     throw new Error(`Unexpected fetch URL: ${url}`);
   };

   const result = await googleCalendarRoutes.syncMiguriWindowToGoogleCalendar(
     {
       DB: new FakeAuthDb(),
       MIGURI_DB: new FakeMiguriDb(),
       GOOGLE_CLIENT_ID: 'google-client-id',
       GOOGLE_CLIENT_SECRET: 'google-client-secret',
     },
     'user-1',
     'window:hinatazaka_202605:%E7%AC%AC4%E6%AC%A1%E5%8F%97%E4%BB%98:2026%E5%B9%B44%E6%9C%8830%E6%97%A5%EF%BC%88%E6%B0%B4%EF%BC%8914%3A00',
     fetchImpl,
   );

   assert.equal(result.connected, true);
   assert.equal(result.synced, true);
   assert.equal(result.googleEventId, 'google-window-event-1');
   assert.equal(fetchCalls.length, 2);
   assert.equal(fetchCalls[1].init.method, 'POST');
   const body = JSON.parse(fetchCalls[1].init.body);
   assert.equal(body.summary, '日向坂46 ミーグリ 受付 - 第4次受付');
   assert.equal(body.start.dateTime, '2026-04-30T14:00:00+09:00');
   assert.equal(body.end.dateTime, '2026-05-01T14:00:00+09:00');
   assert.match(body.description, /日向坂46 17th ミーグリ/);
 });

test('auth worker index wires Google Calendar connect route', () => {
  const indexSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

  assert.match(indexSource, /handleGoogleCalendarConnectRedirect/);
  assert.match(indexSource, /path === '\/api\/auth\/google\/calendar' && method === 'GET'/);
});
