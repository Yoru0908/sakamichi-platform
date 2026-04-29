import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('mobile navigation removes subtitle background tool from navigation lists', () => {
  const source = readFileSync(new URL('../../utils/navigation.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /nav\.tools\.subtitle_bg', href: '\/tools\/subtitle-bg'/);
});

test('mobile drawer is positioned below the navbar instead of spanning the full screen from the top', () => {
  const source = readFileSync(new URL('./MobileDrawer.tsx', import.meta.url), 'utf8');

  assert.match(source, /top-14/);
  assert.doesNotMatch(source, /fixed top-0 right-0/);
  assert.match(source, /right-2/);
  assert.match(source, /bottom-2/);
  assert.match(source, /rounded-3xl/);
  assert.doesNotMatch(source, /Sakamichi Tools/);
});
