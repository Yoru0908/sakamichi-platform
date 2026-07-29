import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('miguri prototype page no longer fetches Fortune Music at build time', () => {
  const pageSource = readFileSync(new URL('../../pages/miguri.astro', import.meta.url), 'utf8');

  assert.doesNotMatch(pageSource, /fetchFortuneEvents/);
  assert.doesNotMatch(pageSource, /eventsJson/);
  assert.match(pageSource, /<MeguriPrototype client:load \/>/);
});

test('miguri prototype refreshes 46log auth before loading private D1 entries', () => {
  const componentSource = readFileSync(new URL('./MeguriPrototype.tsx', import.meta.url), 'utf8');

  assert.match(componentSource, /const authResult = await fetchMe\(\)/);
  assert.match(componentSource, /私人 D1 内容不会显示/);
});
