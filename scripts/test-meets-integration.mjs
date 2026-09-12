import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('queue stays reachable from navigation/homepage without duplicate manager promos', () => {
  const nav = read('src/utils/navigation.ts');
  assert.equal((nav.match(/href: '\/miguri\/queue'/g) || []).length, 3);
  assert.match(read('src/components/home/QuickAccess.astro'), /href: '\/miguri\/queue'/);
  assert.doesNotMatch(read('src/pages/miguri.astro'), /href="\/miguri\/(queue|history)"/);
  for (const lang of ['zh', 'en', 'ja']) {
    assert.match(read(`src/i18n/${lang}.ts`), /'nav\.miguri\.queue':/);
    assert.match(read(`src/i18n/${lang}.ts`), /'nav\.miguri\.manage':/);
  }
});

test('platform page embeds only the new domain and retains an independent fallback', () => {
  const page = read('src/pages/miguri/queue.astro');
  assert.match(page, /https:\/\/meets\.46log\.com\//);
  assert.match(page, /<iframe/);
  assert.match(page, /title="forTUNE meets/);
  assert.match(page, /sandbox="allow-scripts allow-same-origin allow-downloads"/);
  assert.match(page, /id="queue-standalone"/);
  assert.doesNotMatch(page, /meets\.sakamichi-tools\.cfd/);
  assert.match(page, /100dvh/);
});
