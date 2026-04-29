import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('MeguriPrototype defines a mobile-only card layout for event slots', () => {
  const source = readFileSync(new URL('./MeguriPrototype.tsx', import.meta.url), 'utf8');

  assert.match(source, /lg:hidden/);
  assert.match(source, /第\{slotNumber\}部|第 \{slotNumber\} 部/);
});
