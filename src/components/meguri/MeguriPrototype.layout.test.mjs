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
