import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('miguri prototype page no longer fetches Fortune Music at build time', () => {
  const pageSource = readFileSync(new URL('../../pages/prototypes/miguri.astro', import.meta.url), 'utf8');

  assert.doesNotMatch(pageSource, /fetchFortuneEvents/);
  assert.doesNotMatch(pageSource, /eventsJson/);
  assert.match(pageSource, /<MeguriPrototype client:load \/>/);
});
