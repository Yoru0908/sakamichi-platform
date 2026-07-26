import test from 'node:test';
import assert from 'node:assert/strict';

import { signAccessToken } from '../../../shared/jwt.ts';
import {
  handleCreateCalendarSubscription,
  handleGetLotteryCalendar,
  handleGetPersonalCalendar,
  handleRegenerateCalendarSubscription,
} from './calendar-subscriptions.ts';

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

  first() {
    return this.db.first(this.sql, this.args);
  }

  all() {
    return this.db.all(this.sql, this.args);
  }

  run() {
    return this.db.run(this.sql, this.args);
  }
}

class FakeMiguriDb {
  constructor() {
    this.subscription = null;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async first(sql, args) {
    if (sql.includes('FROM miguri_calendar_subscriptions') && sql.includes('WHERE user_id = ?')) {
      return this.subscription?.user_id === args[0] ? this.subscription : null;
    }
    if (sql.includes('FROM miguri_calendar_subscriptions') && sql.includes('WHERE subscription_id = ?')) {
      return this.subscription?.subscription_id === args[0]
        && this.subscription?.token_version === args[1]
        && !this.subscription?.revoked_at
        ? this.subscription
        : null;
    }
    throw new Error(`Unexpected first SQL: ${sql}`);
  }

  async all(sql) {
    if (sql.includes('FROM miguri_user_entries e')) {
      return {
        results: [{
          id: 'entry-1',
          member_name: '山下瞳月',
          event_date: '2026-09-12',
          slot_number: 3,
          tickets: 2,
          updated_at: '2026-07-26 05:00:00',
          event_title: '櫻坂46 What&#039;s “KAZOKU”?',
          group_id: 'sakurazaka',
          source_url: 'https://fortunemusic.jp/sakurazaka_202606/',
          start_time: '14:30',
          end_time: '15:30',
        }],
      };
    }
    if (sql.includes('FROM miguri_events e') && sql.includes('miguri_event_windows')) {
      return {
        results: [{
          slug: 'sakurazaka_202606',
          group_id: 'sakurazaka',
          title: '櫻坂46 What&#039;s “KAZOKU”?',
          source_url: 'https://fortunemusic.jp/sakurazaka_202606/',
          sale_type: '抽選販売',
          updated_at: '2026-07-26 05:00:00',
          label: '第12次受付',
          start_at: '2026年7月22日（水）14:00',
          end_at: '2026年7月23日（木）14:00',
        }],
      };
    }
    throw new Error(`Unexpected all SQL: ${sql}`);
  }

  async run(sql, args) {
    if (sql.includes('INSERT INTO miguri_calendar_subscriptions')) {
      const now = '2026-07-26 05:00:00';
      this.subscription = {
        user_id: args[0],
        subscription_id: args[1],
        token_version: 1,
        created_at: now,
        updated_at: now,
        revoked_at: null,
      };
      return { success: true };
    }
    if (sql.includes('UPDATE miguri_calendar_subscriptions') && sql.includes('token_version = ?')) {
      this.subscription = {
        ...this.subscription,
        token_version: args[0],
        updated_at: '2026-07-26 05:01:00',
      };
      return { success: true };
    }
    throw new Error(`Unexpected run SQL: ${sql}`);
  }
}

test('private subscription is signed and regeneration invalidates the old feed URL', async () => {
  const db = new FakeMiguriDb();
  const secret = 'test-calendar-secret';
  const accessToken = await signAccessToken('user-1', 'member', secret);
  const req = new Request('https://api.46log.com/api/miguri/calendar/subscription', {
    method: 'POST',
    headers: { cookie: `access_token=${accessToken}` },
  });
  const env = { MIGURI_DB: db, JWT_SECRET: secret };

  const createdResponse = await handleCreateCalendarSubscription(req, env);
  const created = await createdResponse.json();
  assert.equal(createdResponse.status, 201);
  assert.equal(createdResponse.headers.get('cache-control'), 'private, no-store');
  assert.equal(created.data.active, true);
  assert.match(created.data.httpsUrl, /^https:\/\/api\.46log\.com\/api\/miguri\/calendar\/personal\/.+\.ics$/);
  assert.match(created.data.webcalUrl, /^webcal:\/\/api\.46log\.com\//);

  const oldToken = new URL(created.data.httpsUrl).pathname.split('/').at(-1).replace(/\.ics$/, '');
  const oldFeed = await handleGetPersonalCalendar(
    new Request(created.data.httpsUrl),
    env,
    oldToken,
  );
  const oldIcs = await oldFeed.text();
  assert.equal(oldFeed.status, 200);
  assert.match(oldIcs, /UID:miguri-entry:entry-1@46log\.com/);
  assert.match(oldIcs, /SUMMARY:櫻坂46 ミーグリ/);
  assert.doesNotMatch(oldIcs, /&#039;/);

  const regeneratedResponse = await handleRegenerateCalendarSubscription(req, env);
  const regenerated = await regeneratedResponse.json();
  assert.equal(regeneratedResponse.status, 200);
  assert.notEqual(regenerated.data.httpsUrl, created.data.httpsUrl);

  const expiredFeed = await handleGetPersonalCalendar(
    new Request(created.data.httpsUrl),
    env,
    oldToken,
  );
  assert.equal(expiredFeed.status, 404);
});

test('public group feed converts Fortune reception windows from JST', async () => {
  const db = new FakeMiguriDb();
  const response = await handleGetLotteryCalendar(
    new Request('https://api.46log.com/api/miguri/calendar/lottery/sakurazaka.ics'),
    { MIGURI_DB: db },
    'sakurazaka',
  );
  const ics = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/calendar/);
  assert.match(ics, /DTSTART:20260722T050000Z/);
  assert.match(ics, /DTEND:20260723T050000Z/);
  assert.match(ics, /UID:miguri-window:sakurazaka_202606:第12次受付@46log\.com/);
  assert.doesNotMatch(ics, /&#039;/);
});

test('all-groups is a stable alias for the combined public feed', async () => {
  const response = await handleGetLotteryCalendar(
    new Request('https://api.46log.com/api/miguri/calendar/lottery/all-groups.ics'),
    { MIGURI_DB: new FakeMiguriDb() },
    'all-groups',
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /X-WR-CALNAME:坂道三团 Miguri 抽选受付/);
});
