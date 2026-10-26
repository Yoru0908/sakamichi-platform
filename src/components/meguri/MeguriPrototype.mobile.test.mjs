import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('MeguriPrototype defines a mobile-only card layout for event slots', () => {
  const source = readFileSync(new URL('./MeguriPrototype.tsx', import.meta.url), 'utf8');
  const copy = readFileSync(new URL('../../i18n/miguri-manage.ts', import.meta.url), 'utf8');

  assert.match(source, /lg:hidden/);
  assert.match(source, /mt\('slotN', \{ n: slotNumber \}\)/);
  assert.match(copy, /slotN: "第\{n\}部"/);
});
