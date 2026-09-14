// All account APIs are mocked, including saves/publishing. No production user writes.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import sharp from 'sharp';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = process.env.BASE_URL ? null : await createServer({ configFile: false, root: root + 'tests/repo-preferences', resolve: { alias: { '@': root + 'src' } }, esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } } });
await server?.listen();
const browser = await chromium.launch({ args: ['--force-device-scale-factor=1.5'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let saved;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {};
    if (path.endsWith('/me')) data = { user: { id: 'fixture', role: 'member', displayName: 'Fixture', oshiMember: '山川宇衣' } };
    if (path.endsWith('/preferences')) data = { oshiMember: '山川宇衣', followedMembers: [] };
    if (path.endsWith('/favorites')) data = { favorites: [] };
    if (path.endsWith('/my-works')) data = { repos: saved ? [saved] : [], pagination: { total: saved ? 1 : 0 } };
    if (path.includes('/repo/works/') && route.request().method() === 'PUT') {
      saved = { ...route.request().postDataJSON(), id: path.split('/').at(-1), createdAt: '2026-09-15', updatedAt: '2026-09-15' };
      data = { id: saved.id, status: 'draft' };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  const url = process.env.BASE_URL ? process.env.BASE_URL + '/repo/create' : server.resolvedUrls.local[0];
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const folder = page.locator('[data-repo-member-folder="山川宇衣"]');
  await folder.waitFor({ timeout: 45000 });
  await folder.getByRole('button', { name: /山川宇衣/ }).click();
  await folder.getByRole('button', { name: '新建Repo', exact: true }).click();
  const image = await sharp({ create: { width: 80, height: 160, channels: 4, background: '#00ffff' } }).png().toBuffer();
  for (let n = 0; n < 2; n++) {
    const pending = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '画像', exact: true }).click();
    await (await pending).setFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: image });
    await page.waitForFunction(n => document.querySelectorAll('[data-repo-inline-photo]').length === n + 1, n);
  }
  await page.getByRole('button', { name: /右转90/ }).first().click();
  await page.waitForFunction(() => !document.querySelector('[role="status"]'));
  await page.getByRole('button', { name: '与上一张并排', exact: true }).last().click();
  assert.equal(await page.locator('[data-repo-image-pair]').count(), 1);
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await page.getByRole('button', { name: '覆盖保存', exact: true }).waitFor();
  const photos = saved.messages.filter(message => message.imageUrl);
  assert.equal(photos.length, 2); assert.equal(photos[1].imagePairWithPrevious, true);
  const rotated = await sharp(Buffer.from(photos[0].imageUrl.split(',')[1], 'base64')).metadata();
  assert.equal(rotated.width, 160); assert.equal(rotated.height, 80);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await folder.getByRole('button', { name: /山川宇衣/ }).click();
  await folder.getByRole('button', { name: `${saved.eventDate} 第${saved.slotNumber}部`, exact: true }).click();
  await page.locator('[data-repo-image-pair]').waitFor();
  assert.equal(await page.getByRole('button', { name: '取消并排', exact: true }).count(), 1);
  for (const label of ['LINE 风格', '応援色', '咪咕力']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    assert.equal(await page.locator('[data-repo-image-pair]').count(), 1);
  }
  if (process.env.BASE_URL) {
    const pending = page.waitForEvent('download', { timeout: 90000 });
    await page.getByRole('button', { name: '下载图片', exact: true }).click();
    const download = await pending;
    assert.equal((await sharp(await download.path()).metadata()).width, 1140);
    await download.delete();
  }
  console.log(`PASS ${process.env.BASE_URL || 'local'}: upload, rotate, pair, account payload/save/reopen, all templates; all APIs mocked`);
} finally { await browser.close(); await server?.close(); }
