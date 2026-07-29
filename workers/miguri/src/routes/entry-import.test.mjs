import test from 'node:test';
import assert from 'node:assert/strict';

import { signAccessToken } from '../../../shared/jwt.ts';
import {
  handleImportMiguriEntries,
  normalizeImportRecord,
  normalizeImportRecords,
} from './entry-import.ts';

function importRecord(overrides = {}) {
  return {
    source: 'fortunemeets',
    sourceKey: 'campaign-1/member-1',
    category: 'サイン会',
    member: '山川宇衣',
    date: '2026-08-02',
    slot: 0,
    appliedTickets: 3,
    wonTickets: 3,
    paidTickets: 0,
    unitPriceYen: 2000,
    spendYen: 6000,
    signLots: 3,
    applicationRound: 'sakurazaka46-16th',
    sourceSyncedAt: '2026-07-29T00:00:00.000Z',
    eventSlug: '',
    title: '櫻坂46 リアルサイン会',
    venue: '京都パルスプラザ',
    group: 'sakurazaka',
    ...overrides,
  };
}

test('normalizeImportRecord preserves counts and keeps Meets display tickets on wins', () => {
  assert.equal(normalizeImportRecord(importRecord()).tickets, 3);
  assert.equal(normalizeImportRecord(importRecord()).spendYen, 6000);
  assert.equal(normalizeImportRecord(importRecord()).signLots, 3);
  assert.equal(normalizeImportRecord(importRecord({ wonTickets: 0 })).status, 'planned');
  assert.equal(
    normalizeImportRecord(importRecord({
      source: 'fortunemusic',
      category: '個別ミーグリ',
      paidTickets: 2,
      signLots: 0,
    })).tickets,
    2,
  );
  assert.equal(
    normalizeImportRecord(importRecord({
      category: '全国ミーグリ',
      appliedTickets: 72,
      wonTickets: 72,
      paidTickets: 0,
      signLots: 0,
      spendYen: 0,
    })).tickets,
    72,
  );
  assert.equal(
    normalizeImportRecord(importRecord({
      category: 'リアミ',
      appliedTickets: 126,
      wonTickets: 72,
      paidTickets: 126,
      signLots: 0,
    })).tickets,
    72,
  );
  assert.equal(
    normalizeImportRecord(importRecord({ category: 'unknown' })).category,
    'その他',
  );
  assert.equal(
    normalizeImportRecord(importRecord({
      wonTickets: 0,
      resultStatus: 'lost',
    })).status,
    'lost',
  );
});

test('normalizeImportRecords rejects malformed counts, dates, and source keys', () => {
  const normalized = normalizeImportRecords([
    importRecord(),
    importRecord({ sourceKey: 'contains spaces' }),
    importRecord({ date: '2026-02-30' }),
    importRecord({ appliedTickets: -1 }),
    importRecord({ spendYen: 100_000_001 }),
    importRecord({ sourceSyncedAt: 'not-a-date' }),
  ]);
  assert.equal(normalized.records.length, 1);
  assert.deepEqual(normalized.invalidIndexes, [1, 2, 3, 4, 5]);
});

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
    this.entries = new Map();
    this.batchCalls = 0;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async all(sql, args) {
    if (sql.includes('SELECT source_key') && !sql.includes('SELECT e.id')) {
      const [userId, ...sourceKeys] = args;
      return {
        results: sourceKeys
          .filter((sourceKey) => this.entries.get(`${userId}:${sourceKey}`))
          .map((sourceKey) => ({ source_key: sourceKey })),
      };
    }

    if (sql.includes('SELECT e.id') && sql.includes('e.source_key IN')) {
      const [userId, ...sourceKeys] = args;
      return {
        results: sourceKeys
          .map((sourceKey) => this.entries.get(`${userId}:${sourceKey}`))
          .filter(Boolean),
      };
    }

    if (sql.includes('SELECT slug FROM miguri_events')) return { results: [] };
    throw new Error(`Unexpected all() SQL: ${sql}`);
  }

  async run(sql, args) {
    if (!sql.includes('INSERT INTO miguri_user_entries')) {
      throw new Error(`Unexpected run() SQL: ${sql}`);
    }
    const [
      proposedId,
      userId,
      eventSlug,
      memberName,
      eventDate,
      slotNumber,
      tickets,
      status,
      source,
      sourceKey,
      category,
      venue,
      importTitle,
      importGroup,
      appliedTickets,
      wonTickets,
      paidTickets,
      unitPriceYen,
      spendYen,
      signLots,
      applicationRound,
      sourceSyncedAt,
    ] = args;
    const mapKey = `${userId}:${sourceKey}`;
    const existing = this.entries.get(mapKey);
    this.entries.set(mapKey, {
      id: existing?.id || proposedId,
      user_id: userId,
      event_slug: eventSlug,
      member_name: memberName,
      event_date: eventDate,
      slot_number: slotNumber,
      tickets,
      status,
      source,
      source_key: sourceKey,
      category,
      venue,
      import_title: importTitle,
      import_group: importGroup,
      event_title: importTitle,
      group_id: importGroup,
      applied_tickets: appliedTickets,
      won_tickets: wonTickets,
      paid_tickets: paidTickets,
      unit_price_yen: unitPriceYen,
      spend_yen: spendYen,
      sign_lots: signLots,
      application_round: applicationRound,
      source_synced_at: sourceSyncedAt,
      start_time: null,
      end_time: null,
    });
    return { success: true };
  }

  async batch(statements) {
    this.batchCalls += 1;
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

async function importRequest(token, records) {
  return new Request('https://api.46log.com/api/miguri/entries/import', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `access_token=${token}`,
    },
    body: JSON.stringify({ records }),
  });
}

test('handleImportMiguriEntries updates the same source key instead of accumulating', async () => {
  const token = await signAccessToken('user-1', 'member', 'test-secret');
  const db = new FakeMiguriDb();
  const env = {
    MIGURI_DB: db,
    JWT_SECRET: 'test-secret',
  };

  const firstResponse = await handleImportMiguriEntries(
    await importRequest(token, [importRecord()]),
    env,
  );
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 200);
  assert.equal(first.data.created, 1);
  assert.equal(first.data.updated, 0);
  assert.equal(first.data.entries[0].tickets, 3);

  const secondResponse = await handleImportMiguriEntries(
    await importRequest(token, [importRecord({
      appliedTickets: 4,
      wonTickets: 4,
      signLots: 4,
      spendYen: 8000,
    })]),
    env,
  );
  const second = await secondResponse.json();
  assert.equal(secondResponse.status, 200);
  assert.equal(second.data.created, 0);
  assert.equal(second.data.updated, 1);
  assert.equal(second.data.entries[0].tickets, 4);
  assert.equal(second.data.entries[0].spendYen, 8000);
  assert.equal(db.entries.size, 1);
});

test('handleImportMiguriEntries rejects the full request when any record is malformed', async () => {
  const token = await signAccessToken('user-1', 'member', 'test-secret');
  const db = new FakeMiguriDb();
  const response = await handleImportMiguriEntries(
    await importRequest(token, [importRecord(), importRecord({ appliedTickets: -1 })]),
    {
      MIGURI_DB: db,
      JWT_SECRET: 'test-secret',
    },
  );

  assert.equal(response.status, 400);
  assert.equal(db.entries.size, 0);
  assert.equal(db.batchCalls, 0);
});
