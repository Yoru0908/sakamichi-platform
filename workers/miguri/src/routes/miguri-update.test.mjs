import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as miguriRoutes from './miguri.ts';
import { signAccessToken } from '../utils/jwt.ts';

test('auth worker index wires miguri update route', () => {
  const indexSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

  assert.match(indexSource, /handleUpdateMiguriEntry/);
  assert.ok(indexSource.includes("path.startsWith('/api/miguri/entries/') && method === 'PUT'"));
});

test('handleUpdateMiguriEntry updates a user entry and returns the updated row', async () => {
  assert.equal(typeof miguriRoutes.handleUpdateMiguriEntry, 'function');

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

    async run() {
      return this.db.run(this.sql, this.args);
    }

    async first() {
      return this.db.first(this.sql, this.args);
    }
  }

  class FakeMiguriDb {
    constructor() {
      this.entries = new Map([
        ['entry-1', {
          id: 'entry-1',
          user_id: 'user-1',
          event_slug: 'hinatazaka_202605',
          member_name: '小坂菜緒',
          event_date: '2026-05-31',
          slot_number: 1,
          tickets: 3,
          status: 'paid',
        }],
      ]);
      this.events = new Map([
        ['hinatazaka_202605', {
          slug: 'hinatazaka_202605',
          title: '日向坂46 17th ミーグリ',
          group_id: 'hinatazaka',
        }],
      ]);
      this.slots = new Map([
        ['hinatazaka_202605__2026-06-07__2', {
          event_slug: 'hinatazaka_202605',
          event_date: '2026-06-07',
          slot_number: 2,
          start_time: '12:30',
          end_time: '13:30',
        }],
      ]);
      this.slotMembers = new Set(['hinatazaka_202605__2026-06-07__2__正源司陽子']);
    }

    prepare(sql) {
      return new FakeStatement(this, sql);
    }

    async first(sql, args) {
      if (sql.includes('SELECT id, event_slug FROM miguri_user_entries')) {
        const [entryId, userId] = args;
        const entry = this.entries.get(entryId);
        if (!entry || entry.user_id !== userId) return null;
        return { id: entry.id, event_slug: entry.event_slug };
      }

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

    async run(sql, args) {
      if (sql.includes('UPDATE miguri_user_entries')) {
        const [memberName, eventDate, slotNumber, tickets, status, entryId, userId] = args;
        const entry = this.entries.get(entryId);
        if (!entry || entry.user_id !== userId) {
          throw new Error('Entry not found');
        }
        this.entries.set(entryId, {
          ...entry,
          member_name: memberName,
          event_date: eventDate,
          slot_number: slotNumber,
          tickets,
          status,
        });
        return { success: true };
      }

      throw new Error(`Unexpected run() SQL: ${sql}`);
    }

    async all(sql, args) {
      if (sql.includes('FROM miguri_user_entries e') && sql.includes('WHERE e.id = ? AND e.user_id = ?')) {
        const [entryId, userId] = args;
        const entry = this.entries.get(entryId);
        if (!entry || entry.user_id !== userId) return { results: [] };
        const event = this.events.get(entry.event_slug);
        const slot = this.slots.get(`${entry.event_slug}__${entry.event_date}__${entry.slot_number}`);
        return {
          results: [
            {
              id: entry.id,
              event_slug: entry.event_slug,
              member_name: entry.member_name,
              event_date: entry.event_date,
              slot_number: entry.slot_number,
              tickets: entry.tickets,
              status: entry.status,
              event_title: event?.title || null,
              group_id: event?.group_id || null,
              start_time: slot?.start_time || null,
              end_time: slot?.end_time || null,
            },
          ],
        };
      }

      throw new Error(`Unexpected all() SQL: ${sql}`);
    }
  }

  const db = new FakeMiguriDb();
  const req = new Request('https://api.46log.com/api/miguri/entries/entry-1', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      cookie: `access_token=${token}`,
    },
    body: JSON.stringify({
      member: '正源司陽子',
      date: '2026-06-07',
      slot: 2,
      tickets: 5,
      status: 'won',
    }),
  });

  const res = await miguriRoutes.handleUpdateMiguriEntry(req, {
    MIGURI_DB: db,
    JWT_SECRET: 'test-secret',
  }, 'entry-1');
  const json = await res.json();

  assert.equal(res.status, 200);
  assert.equal(json.data.entry.id, 'entry-1');
  assert.equal(json.data.entry.member, '正源司陽子');
  assert.equal(json.data.entry.date, '2026-06-07');
  assert.equal(json.data.entry.slot, 2);
  assert.equal(json.data.entry.tickets, 5);
  assert.equal(json.data.entry.status, 'won');
  assert.equal(json.data.entry.startTime, '12:30');
  assert.equal(json.data.entry.endTime, '13:30');
});
