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

  // /me and /events run in parallel; /events answers an expired token anonymously, so it is asked again after fetchMe refreshed it.
  assert.match(componentSource, /const \[authResult, first\] = await Promise\.all\(\[fetchMe\(\), getMiguriEvents\(\)\]\)/);
  assert.match(componentSource, /authResult\.data\?\.user && first\.data && !first\.data\.authenticated \? await getMiguriEvents\(\) : first/);
  assert.match(componentSource, /setError\(miguriNow\('loggedOut'\)\)/);
  assert.match(readFileSync(new URL('../../i18n/miguri.ts', import.meta.url), 'utf8'), /私人 D1 内容不会显示/);
});
