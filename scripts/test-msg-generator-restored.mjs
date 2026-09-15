import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import sharp from 'sharp';

const server = process.env.BASE_URL ? null : await createServer({ configFile: false, root: fileURLToPath(new URL('../dist', import.meta.url)), appType: 'mpa', server: { host: '127.0.0.1', port: 5199 } });
await server?.listen();
const base = process.env.BASE_URL || server.resolvedUrls.local[0].replace(/\/$/, '');
const out = `${homedir()}/.cache/msg-generator-restored`;
await mkdir(out, { recursive: true });
const photo = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#ea3456' } }).png().toBuffer();
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
    await context.addInitScript(() => localStorage.setItem('lang', 'ja'));
    const page = await context.newPage();
    const archives = [];
    page.on('request', req => { if (req.url().includes('msg-archive.46log.com')) archives.push(req.url()); });
    // Never write real account data or contact archive APIs.
    await context.route('https://auth.46log.com/**', r => r.fulfill({ status: 401, contentType: 'application/json', body: '{"success":false}' }));
    await context.route('https://api.46log.com/**', r => r.fulfill({ contentType: r.request().url().includes('/api/media/') ? 'image/png' : 'application/json', body: r.request().url().includes('/api/media/') ? photo : Buffer.from('{}') }));
    await context.route('https://msg-archive.46log.com/**', r => r.abort());
    await context.route('https://media.46log.com/msg-avatars/**', r => r.fulfill(r.request().url().includes('.json') ? { contentType: 'application/json', body: JSON.stringify({ images: { 'テストメンバー': { imageUrl: 'https://media.46log.com/msg-avatars/test.jpg', group: '乃木坂46', generation: '5期生', isActive: true } } }) } : { contentType: 'image/png', body: photo }));
    await page.goto(`${base}/tools/`);
    await page.locator('astro-island[component-url*="MobileDrawer"]:not([ssr])').waitFor({ state: 'attached' });
    await page.getByRole('heading', { name: 'その他', exact: true }).waitFor();
    const card = page.locator('main a[href="/tools/msg-generator"]');
    await card.waitFor();
    if (width > 1280) {
      await page.locator('astro-island[component-url*="NavPill"]:not([ssr])').waitFor({ state: 'attached' });
      await page.locator('nav a[href="/tools"]').hover();
    } else {
      await page.getByRole('button', { name: 'メニューを開く' }).click();
    }
    await page.locator(`astro-island[component-url*="${width > 1280 ? 'NavPill' : 'MobileDrawer'}"] a[href="/tools/msg-generator"]`).first().waitFor();
    await page.screenshot({ path: `${out}/menu-${width}.png` });
    await page.goto(`${base}/tools/msg-generator/`);
    await page.locator('astro-island[component-url*="MsgGenerator"]:not([ssr])').waitFor({ state: 'attached' });
    await page.getByRole('heading', { name: 'MSGジェネレーター', exact: true }).waitFor();
    if (width < 768) await page.getByRole('button', { name: '选择成员', exact: true }).click();
    await page.getByText('テストメンバー', { exact: true }).filter({ visible: true }).first().click();
    await page.locator('[contenteditable]').first().fill('Restore test');
    await page.getByRole('button', { name: '文字对话', exact: true }).click();
    const text = page.locator('[contenteditable]').filter({ hasText: '输入文字...' });
    await text.fill('MSG restored: 自由入力テスト');
    await page.getByRole('button', { name: '图片对话', exact: true }).click();
    await page.locator('input[type=file]').last().setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: photo });
    await page.waitForFunction(() => {
      const images = Array.from(document.querySelectorAll('main img')).filter(i => i.src.startsWith('data:'));
      return images.length >= 4 && images.every(i => i.complete && i.naturalWidth > 0);
    });
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载图片', exact: true }).click();
    const download = await pending;
    const file = `${out}/generated-${width}.png`;
    await download.saveAs(file);
    const png = await sharp(await readFile(file)).raw().toBuffer({ resolveWithObject: true });
    assert.equal(png.info.width, 1000);
    assert(png.info.height > 300);
    let red = 0, dark = 0;
    for (let i = 0; i < png.data.length; i += png.info.channels) {
      // Exclude the left avatar column: only the uploaded photo should count.
      if ((i / png.info.channels) % png.info.width > png.info.width * 0.25 && png.data[i] > 210 && png.data[i + 1] < 85 && png.data[i + 2] < 115) red++;
      if (png.data[i] < 90 && png.data[i + 1] < 90 && png.data[i + 2] < 90) dark++;
    }
    assert(red > 1000, 'uploaded image must appear in downloaded PNG');
    assert(dark > 500, 'downloaded PNG must contain text');
    assert.deepEqual(archives, [], 'generator must not fetch message archives');
    await page.screenshot({ path: `${out}/editor-${width}.png` });
    if (process.env.BASE_URL) {
      for (const path of ['/messages', '/messages/', '/messages/?check=restore', '/messages/member/test']) {
        const response = await context.request.get(base + path);
        assert.equal(response.status(), 410, path);
        assert.match(response.headers()['x-robots-tag'], /noindex/);
      }
    }
    console.log(`PASS ${width}px: Japanese menu/catalogue, text/image editing, actual PNG, no archive requests${process.env.BASE_URL ? ', archive remains 410' : ''}`);
    await context.close();
  }
} finally {
  await browser.close();
  await server?.close();
}
