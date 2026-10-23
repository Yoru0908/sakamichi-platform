import assert from 'node:assert/strict';
import test from 'node:test';
import { attendanceToday, attendanceStatus, validateEventMemo, validateEventProfile, summarizeAttendance } from './event-attendance.ts';
test('memo validation preserves unknown vs zero costs and rejects untrusted fields and coercion', () => {
  assert.deepEqual(validateEventMemo({ note: '  私的な感想  ', cost: { ticket: 0, travel: 1200 } }), { note: '私的な感想', cost: { ticket: 0, travel: 1200 } });
  for (const cost of [{ ticket: -1 }, { ticket: 1.5 }, { ticket: '2' }, { ticket: null }, { other: 10000000 }, { other: Infinity }, { rent: 1 }, []]) assert.equal(validateEventMemo({ note: '', cost }), null);
  for (const value of [null, [], { note: 'a'.repeat(4001), cost: {} }, { note: '', cost: {}, user_id: 'other' }]) assert.equal(validateEventMemo(value), null);
});
test('public is an explicit boolean and a chosen display name is required to opt in', () => {
  assert.deepEqual(validateEventProfile({ public: false, name: '' }), { public: false, name: '' });
  assert.deepEqual(validateEventProfile({ public: true, name: '  Buddy  ' }), { public: true, name: 'Buddy' });
  for (const value of [{ public: 'true', name: 'Buddy' }, { public: true, name: ' ' }, { public: true, name: 'x'.repeat(41) }, { public: true, name: 'a\nb' }, { public: true, name: 'x', user_id: 'other' }]) assert.equal(validateEventProfile(value), null);
});
test('shared contract uses JST, deduplicates dates across groups, excludes future plans and distinguishes empty costs', () => {
  assert.equal(attendanceToday(new Date('2026-10-22T15:00:00Z')), '2026-10-23');
  assert.equal(attendanceStatus('2026-10-23', '2026-10-23'), 'attended');
  const records = [{ id: 's', date: '2026-10-22', cost: { ticket: 0 } }, { id: 'h', date: '2026-10-22', cost: {} }, { id: 'n', date: '2026-10-24', cost: { ticket: 100 } }];
  assert.deepEqual(summarizeAttendance([...records, records[0]], '2026-10-23'), { records: 3, attendedDays: 1, attendedEvents: 2, plannedDays: 1, plannedEvents: 1, costRecorded: 2, totalYen: 100 });
});
