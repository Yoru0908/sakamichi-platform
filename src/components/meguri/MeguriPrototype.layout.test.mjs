import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('MeguriPrototype keeps the desktop calendar grid separate from the reception timeline sidebar', () => {
  const source = readFileSync(new URL('./MeguriPrototype.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /xl:grid-cols-\[1\.4fr_0\.6fr\]/);
  assert.match(source, /受付时间轴/);
});

test('MeguriPrototype no longer renders an always-visible desktop edit label inside entry cards', () => {
  const source = readFileSync(new URL('./MeguriPrototype.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /<Pencil size=\{12\} \/> 编辑/);
});

test('MeguriPrototype combines repeated rounds and keeps desktop slot columns readable', () => {
  const source = readFileSync(new URL('./MeguriPrototype.tsx', import.meta.url), 'utf8');

  assert.match(source, /groupEntriesForCalendar\(selectedEntries\)/);
  assert.match(source, /本部 \$\{group\.tickets\} 张/);
  assert.match(source, /全部日期总张数/);
  assert.match(source, /条履历 · 点击查看明细/);
  assert.match(source, /min-w-\[1100px\]/);
  assert.match(source, /min-w-36/);
});
