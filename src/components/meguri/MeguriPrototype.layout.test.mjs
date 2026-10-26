import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Copy moved to the i18n table on 2026-10-26; the zh text there is unchanged.
const read = () => readFileSync(new URL('./MeguriPrototype.tsx', import.meta.url), 'utf8')
  + readFileSync(new URL('../../i18n/miguri-manage.ts', import.meta.url), 'utf8');

test('MeguriPrototype keeps the desktop calendar grid separate from the reception timeline sidebar', () => {
  const source = read();

  assert.doesNotMatch(source, /xl:grid-cols-\[1\.4fr_0\.6fr\]/);
  assert.match(source, /受付时间轴/);
});

test('MeguriPrototype no longer renders an always-visible desktop edit label inside entry cards', () => {
  const source = read();

  assert.doesNotMatch(source, /<Pencil size=\{12\} \/> 编辑/);
});

test('MeguriPrototype combines repeated rounds and keeps desktop slot columns readable', () => {
  const source = read();

  assert.match(source, /preferOfficialMusicEntries\(entries\)/);
  assert.match(source, /prepareEntriesForCalendar\(selectedEntries\)/);
  assert.match(source, /groupEntriesForCalendar\(calendarEntries\)/);
  assert.match(source, /mt\('slotTotal', \{ n: group\.tickets \}\)/);
  assert.match(source, /slotTotal: "本部 \{n\} 张"/);
  assert.match(source, /手动录入/);
  assert.match(source, /全部日期总张数/);
  assert.match(source, /条履历 · 点击查看明细/);
  assert.match(source, /min-w-\[1100px\]/);
  assert.match(source, /min-w-36/);
});
