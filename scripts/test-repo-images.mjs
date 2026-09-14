import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { chromium, webkit } from 'playwright';
import sharp from 'sharp';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root: root + 'tests/repo-images', resolve: { alias: { '@': root + 'src' } }, esbuild: { jsx: 'automatic' }, plugins: [tailwindcss()], server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } } });
await server.listen();
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch(engine === chromium ? { args: ['--force-device-scale-factor=1.5'] } : {});
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
      const state = async () => JSON.parse(await page.locator('#state').textContent());
      const row = id => page.locator(`[data-message-id="${id}"]`);
      const original = (await state())[0].imageUrl;
      assert(await row('one').getByRole('button', { name: '与上一张并排' }).isDisabled());
      await row('one').getByRole('button', { name: /右转90/ }).click();
      await page.waitForFunction(original => JSON.parse(document.querySelector('#state').textContent)[0].imageUrl !== original, original);
      const rotated = (await state())[0].imageUrl;
      const png = await sharp(Buffer.from(rotated.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.equal(png.info.width, 160); assert.equal(png.info.height, 80);
      assert.deepEqual([...png.data.subarray(0, 3)], [0, 0, 255], 'clockwise must put old bottom-left blue at top-left');
      await page.waitForFunction(() => document.querySelector('[data-repo-inline-photo]').getBoundingClientRect().width > 250);
      await row('one').getByRole('button', { name: /左转90/ }).click();
      await page.waitForFunction(rotated => JSON.parse(document.querySelector('#state').textContent)[0].imageUrl !== rotated, rotated);
      const restored = await sharp(Buffer.from((await state())[0].imageUrl.split(',')[1], 'base64')).raw().toBuffer();
      assert(restored.equals(await sharp(Buffer.from(original.split(',')[1], 'base64')).raw().toBuffer()), 'left then right is lossless');
      await row('one').getByRole('button', { name: /右转90/ }).click();
      await page.waitForFunction(() => !document.querySelector('[role="status"]'));
      await row('two').getByRole('button', { name: '与上一张并排' }).click();
      assert(await row('three').getByRole('button', { name: '与上一张并排' }).isDisabled(), 'never squeeze a third image into pair');
      const saved = await state(); await page.locator('#reload').click(); assert.deepEqual(await state(), saved);
      for (const template of ['0', '1', '2']) {
        await page.locator('#template').selectOption(template);
        await page.waitForFunction(() => [...document.querySelectorAll('#capture img')].every(i => i.complete && i.naturalWidth > 0));
        await page.waitForTimeout(100);
        const geometry = await page.locator('#capture').evaluate(root => {
          const base = root.getBoundingClientRect();
          return [...root.querySelectorAll('[data-repo-inline-photo]')].map(el => { const r = el.getBoundingClientRect(); return { x: r.x - base.x, y: r.y - base.y, width: r.width, height: r.height }; });
        });
        assert.equal(geometry.length, 3);
        assert(Math.abs(geometry[0].y - geometry[1].y) < 1);
        assert(geometry[1].x >= geometry[0].x + geometry[0].width + 7);
        assert(geometry[2].y > geometry[0].y + geometry[0].height);
        const pending = page.waitForEvent('download'); await page.locator('#export').click();
        const download = await pending; const raster = await sharp(await download.path()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.equal(raster.info.width, 1140);
        // First (rotated) image top-left quadrant remains blue in the actual PNG.
        const p = geometry[0], x = Math.floor((p.x + p.width / 4) * 3), y = Math.floor((p.y + p.height / 4) * 3);
        const i = (y * raster.info.width + x) * 4;
        assert.deepEqual([...raster.data.subarray(i, i + 3)], [0, 0, 255]);
        await download.delete();
      }
      await row('two').getByRole('button', { name: '取消并排' }).click();
      assert.equal(await page.locator('[data-repo-image-pair]').count(), 0);
      await row('two').getByRole('button', { name: '与上一张并排' }).click();
      await row('one').getByTitle('削除', { exact: true }).click();
      assert.equal(await page.locator('[data-repo-image-pair]').count(), 0, 'deleting partner leaves remaining photo visible');
      assert.equal(await page.locator('[data-repo-inline-photo]').count(), 2);
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine.name()}: rotation pixels/reversal, landscape sizing, pairing/unpair/delete, JSON reload, 3-template actual PNG at 390px`);
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
