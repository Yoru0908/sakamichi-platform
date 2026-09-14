import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { chromium, webkit } from 'playwright';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  configFile: false, root: root + 'tests/repo-export',
  resolve: { alias: { '@': root + 'src' } }, esbuild: { jsx: 'automatic' },
  plugins: [tailwindcss(), { name: 'baseline-alias', resolveId(id) {
    if (id.startsWith('virtual:baseline-')) return root + 'src/components/repo/templates/' + id.split('baseline-')[1] + '.tsx';
  } }],
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
});
await server.listen();
try {
  const cases = process.env.REPO_TEST_DSF ? [[chromium, Number(process.env.REPO_TEST_DSF)]] : [
    ...[1, 1.25, 1.5, 1.75, 2].map(dsf => [chromium, dsf]), [webkit, 1],
  ];
  for (const [engine, dsf] of cases) {
    // Context deviceScaleFactor alone does not reproduce physical border snapping.
    const browser = await engine.launch(engine === chromium ? { args: [`--force-device-scale-factor=${dsf}`] } : {});
    try {
      const page = await browser.newPage({ acceptDownloads: true });
      for (let template = 0; template < 3; template++) {
        await page.goto(server.resolvedUrls.local[0] + `?wrap=1&template=${template}`, { waitUntil: 'networkidle' });
        await page.evaluate(async (fonts) => {
          document.documentElement.lang = 'zh-CN';
          if (fonts) {
            const link = document.createElement('link'); link.rel = 'stylesheet';
            link.href = 'https://fonts.font.im/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap';
            await new Promise((resolve, reject) => { link.onload = resolve; link.onerror = reject; document.head.append(link); });
          }
          document.body.getBoundingClientRect();
          await document.fonts.ready;
        }, !!process.env.REPO_TEST_FONTS);
        const before = await page.locator('#capture').evaluate(root => {
          const base = root.getBoundingClientRect();
          return { width: base.width, height: base.height, html: root.innerHTML,
            images: [...root.querySelectorAll('img')].map(el => { const r = el.getBoundingClientRect(); return { x: r.x - base.x + r.width / 2, y: r.y - base.y + r.height / 2 }; }),
            bubbles: [...root.querySelectorAll('[data-repo-bubble]')].map(el => {
              const r = el.getBoundingClientRect();
              return { text: el.textContent, x: r.x - base.x, bottom: r.bottom - base.y, width: r.width, height: r.height };
            }) };
        });
        assert.equal(before.bubbles.length, 16);
        assert(before.bubbles[0].width < 200 && before.bubbles[0].height > 40, 'Tailwind styles must be loaded');
        const pending = page.waitForEvent('download', { timeout: 90000 });
        await page.locator('#export').click();
        const download = await pending;
        assert.equal(await download.failure(), null);
        const file = await download.path();
        if (process.env.REPO_TEST_PNG) {
          await mkdir(process.env.REPO_TEST_PNG, { recursive: true });
          await download.saveAs(`${process.env.REPO_TEST_PNG}/${engine.name()}-${dsf}-${template}.png`);
        }
        const png = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        assert(Math.abs(png.info.width - before.width * 3) <= 1);
        assert(Math.abs(png.info.height - before.height * 3) <= 1);
        for (const image of before.images) {
          const i = (Math.floor(image.y * 3) * png.info.width + Math.floor(image.x * 3)) * 4;
          assert.deepEqual([...png.data.subarray(i, i + 3)], [255, 0, 255], 'every avatar must remain visible');
        }
        for (const bubble of before.bubbles) {
          // Normal glyphs end above bottom padding. A wrapped extra line crosses
          // this band. Check the actual raster, not a live SVG (which misses bug).
          let dark = 0;
          for (let y = Math.ceil((bubble.bottom - 5) * 3); y < Math.floor((bubble.bottom + 8) * 3); y++) {
            for (let x = Math.ceil((bubble.x + 12) * 3); x < Math.floor((bubble.x + bubble.width - 12) * 3); x++) {
              const i = (y * png.info.width + x) * 4;
              if (png.data[i] < 110 && png.data[i + 1] < 110 && png.data[i + 2] < 110) dark++;
            }
          }
          assert.equal(dark, 0, `${engine.name()} DSF ${dsf} template ${template}: overflow below ${bubble.text}`);
        }
        assert.equal(await page.locator('#capture').evaluate(el => el.innerHTML), before.html, 'export must not mutate preview');
        assert.equal(await page.locator('#capture').getAttribute('data-repo-exporting'), null);
        await download.delete();
        console.log(`PASS ${engine.name()} DSF ${dsf} template ${template}: actual 3x PNG, all bubble text contained, preview unchanged`);
      }
    } finally { await browser.close(); }
  }
} finally { await server.close(); }
