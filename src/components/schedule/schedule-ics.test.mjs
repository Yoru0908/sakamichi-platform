import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('./schedule-ics.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText.replace("import type { MiguriGroupId } from '@/utils/auth-api';", '');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const {
  dedupeScheduleEvents,
  parseScheduleIcs,
} = await import(moduleUrl);

test('parses folded official events and converts UTC into JST', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:nogi-radio-1',
    'DTSTART:20260726T023000Z',
    'DTEND:20260726T033000Z',
    'SUMMARY:TOKYO FM「乃木坂46の番組」',
    'DESCRIPTION:種別：ラジオ\\nメンバー：小川 彩\\n長い説明',
    ' の続き',
    'LOCATION:TOKYO FM',
    'URL:https://www.nogizaka46.com/s/n46/media/detail/1',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const [event] = parseScheduleIcs(ics, 'official', 'nogizaka');
  assert.equal(event.dateKey, '2026-07-26');
  assert.equal(event.startTime, '11:30');
  assert.equal(event.category, 'radio');
  assert.equal(event.members, '小川 彩');
  assert.match(event.description, /長い説明の続き/);
});

test('parses all-day dates and infers the lottery group', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:sakura-lottery-1',
    'DTSTART;VALUE=DATE:20260730',
    'DTEND;VALUE=DATE:20260808',
    'SUMMARY:櫻坂46 ミーグリ｜第7次受付',
    'DESCRIPTION:抽選応募受付期間',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const [event] = parseScheduleIcs(ics, 'lottery');
  assert.equal(event.group, 'sakurazaka');
  assert.equal(event.category, 'miguri');
  assert.equal(event.allDay, true);
  assert.equal(event.dateKey, '2026-07-30');
  assert.equal(event.endDateKey, '2026-08-08');
});

test('deduplicates matching UID and start time', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:duplicate',
    'DTSTART:20260726T070000Z',
    'DTEND:20260726T080000Z',
    'SUMMARY:乃木坂46 配信',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const events = parseScheduleIcs(ics, 'official', 'nogizaka');
  assert.equal(dedupeScheduleEvents([...events, ...events]).length, 1);
});
