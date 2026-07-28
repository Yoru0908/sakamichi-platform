import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../public/miguri-importer.js', import.meta.url), 'utf8');

test('browser importer is limited to first-party forTUNE history and temporary window.name handoff', () => {
  assert.match(source, /fortunemusic\.jp/);
  assert.match(source, /ticket\.fortunemeets\.app/);
  assert.match(source, /MIGURI46LOG1:/);
  assert.match(source, /credentials:\s*'include'/);
  assert.doesNotMatch(source, /document\.cookie/);
  assert.doesNotMatch(source, /localStorage\.(?:setItem|getItem)/);
  assert.doesNotMatch(source, /querySelector\([^)]*password/);
});
