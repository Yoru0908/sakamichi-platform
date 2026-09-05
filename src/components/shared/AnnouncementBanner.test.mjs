import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../../layouts/BaseLayout.astro', import.meta.url), 'utf8');

test('site layout no longer loads the resolved authentication maintenance announcement', () => {
  assert.doesNotMatch(layout, /AnnouncementBanner/);
  assert.doesNotMatch(layout, /登录功能维护中/);
});
