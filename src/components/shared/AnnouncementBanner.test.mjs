import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./AnnouncementBanner.tsx', import.meta.url), 'utf8');

test('site-wide announcement exposes the authentication maintenance window', () => {
  assert.match(source, /auth-maintenance-2026-09-05/);
  assert.match(source, /登录功能维护中/);
  assert.match(source, /日本时间 9 月 5 日 09:00 后恢复/);
  assert.match(source, /localStorage\.getItem\(STORAGE_KEY\) !== ANNOUNCEMENT_ID/);
});
