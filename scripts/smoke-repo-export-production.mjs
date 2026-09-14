// Read-only deployed UI verification: all account/API operations are mocked.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import sharp from 'sharp';
const base = process.env.BASE_URL || 'https://46log.com';
const browser = await chromium.launch({ args: ['--force-device-scale-factor=1.5'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path.endsWith('/me')) data = { user: { id: 'fixture-user', email: 'fixture@example.test', displayName: 'Fixture', role: 'member', oshiMember: '山川宇衣', verificationStatus: 'none' } };
    if (path.endsWith('/preferences')) data = { oshiMember: '山川宇衣', followedMembers: [] };
    if (path.endsWith('/favorites')) data = { favorites: [] };
    if (path.includes('/repo/')) data = { repos: [], total: 0, totalRepos: 0, totalUsers: 0, weeklyActiveUsers: 0 };
    await route.fulfill({ status: 200, json: { success: true, data } });
  });
  await page.goto(base + '/repo/create', { waitUntil: 'domcontentloaded' });
  const folder = page.locator('[data-repo-member-folder="山川宇衣"]');
  await folder.waitFor({ timeout: 45000 });
  await folder.getByRole('button', { name: /山川宇衣/ }).click();
  await folder.getByRole('button', { name: '新建Repo', exact: true }).click();
  for (const id of ['init_1', 'init_2']) {
    await page.locator(`[data-message-id="${id}"] .cursor-text`).click();
    await page.locator(`#msg-input-${id}`).fill('ありがとう！');
    await page.locator('[data-repo-export-root]').click();
  }
  await page.evaluate(() => document.fonts.ready);
  const areas = await page.locator('[data-repo-export-root]').evaluate(root => {
    const base = root.getBoundingClientRect();
    return [...root.querySelectorAll('[data-repo-bubble]')].map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.x - base.x, bottom: r.bottom - base.y, width: r.width, border: getComputedStyle(el).borderLeftWidth };
    });
  });
  assert.equal(areas.length, 2);
  assert(Math.abs(parseFloat(areas[1].border) - 2 / 3) < 0.001, 'must exercise fractional member border');
  const pending = page.waitForEvent('download', { timeout: 90000 });
  await page.getByRole('button', { name: '下载图片', exact: true }).click();
  const download = await pending;
  assert.equal(await download.failure(), null);
  const png = await sharp(await download.path()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(png.info.width, 1140);
  for (const area of areas) {
    let dark = 0;
    for (let y = Math.ceil((area.bottom - 5) * 3); y < Math.floor((area.bottom + 8) * 3); y++) {
      for (let x = Math.ceil((area.x + 12) * 3); x < Math.floor((area.x + area.width - 12) * 3); x++) {
        const i = (y * png.info.width + x) * 4;
        if (png.data[i] < 110 && png.data[i + 1] < 110 && png.data[i + 2] < 110) dark++;
      }
    }
    assert.equal(dark, 0, 'deployed export must not overflow');
  }
  await download.delete();
  const baseline = errors.filter(error => error.startsWith('Minified React error #418;'));
  assert.deepEqual(errors.filter(error => !baseline.includes(error)), []);
  console.log(`PASS ${base}: deployed 150% actual PNG, both speakers contained; all API traffic mocked; baseline hydration warnings=${baseline.length}`);
} finally { await browser.close(); }
