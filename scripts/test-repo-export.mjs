import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { narrationPalette } from '../src/components/repo/narration-color.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const backup = 'backup/repo-before-narration-color-20260911';
const server = await createServer({
  configFile: false, root: root + 'tests/repo-export',
  resolve: { alias: { '@': root + 'src' } }, esbuild: { jsx: 'automatic' },
  plugins: [tailwindcss(), {
    name: 'backup-templates',
    resolveId(id) { if (id.startsWith('virtual:baseline-')) return '\0' + id; },
    async load(id) {
      if (!id.startsWith('\0virtual:baseline-')) return;
      const name = id.split('baseline-')[1];
      const source = execFileSync('git', ['show', `${backup}:src/components/repo/templates/${name}.tsx`], { cwd: root, encoding: 'utf8' })
        .replace("'../RepoMemberImage'", "'@/components/repo/RepoMemberImage'");
      return (await transformWithEsbuild(source, name + '.tsx', { loader: 'tsx', jsx: 'automatic' })).code;
    },
  }],
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function capture(query) {
    await page.goto(server.resolvedUrls.local[0] + '?' + query, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.querySelectorAll('#capture img')].every(img => img.complete && img.naturalWidth > 0));
    const bounds = await page.locator('#capture').boundingBox();
    const images = await page.locator('#capture img').evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect(), root = document.getElementById('capture').getBoundingClientRect();
      return { x: r.x - root.x + r.width / 2, y: r.y - root.y + r.height / 2 };
    }));
    const areas = await page.locator('[data-repo-narration]').evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect(), root = document.getElementById('capture').getBoundingClientRect();
      return { x: r.x - root.x, y: r.y - root.y, width: r.width, height: r.height, overflow: el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight + 1 };
    }));
    const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
    await page.locator('#export').click();
    const download = await downloadPromise;
    assert.equal(await download.failure(), null);
    const png = await sharp(await download.path()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = png.info;
    assert(Math.abs(width - bounds.width * 3) <= 3);
    assert(Math.abs(height - bounds.height * 3) <= 3, `PNG height ${height}, expected ${bounds.height * 3}`);
    const pixel = (x, y) => [...png.data.subarray((Math.floor(y) * width + Math.floor(x)) * 4, (Math.floor(y) * width + Math.floor(x)) * 4 + 3)];
    assert.deepEqual(pixel(width / 2, height - 2), [0, 255, 255], 'bottom marker must not be clipped');
    let magenta = 0;
    for (let offset = 0; offset < png.data.length; offset += 4) {
      if (png.data[offset] === 255 && png.data[offset + 1] === 0 && png.data[offset + 2] === 255) magenta++;
    }
    assert(magenta > 5000, 'inline photos and avatars must remain in the PNG');
    for (const image of images) assert.deepEqual(pixel(image.x * 3, image.y * 3), [255, 0, 255], 'each inline image/avatar must be present at its expected position');
    for (const area of areas) {
      assert(!area.overflow);
      assert(area.x >= 0 && area.x + area.width <= bounds.width + 1);
    }
    if (areas.length) {
      const expected = narrationPalette('#db2777').backgroundColor;
      const rgb = [1, 3, 5].map(i => parseInt(expected.slice(i, i + 2), 16));
      for (const area of [areas[0], areas.at(-1)]) assert.deepEqual(pixel((area.x + area.width / 2) * 3, (area.y + 2) * 3), rgb, 'first and last narration backgrounds must survive export');
    }
    await download.delete();
    return png;
  }
  for (let template = 0; template < 3; template++) {
    const old = await capture(`template=${template}&legacy=1`);
    const current = await capture(`template=${template}`);
    assert.deepEqual(current.info, old.info);
    assert(current.data.equals(old.data), 'Original mode PNG must pixel-match the Git backup template');
    console.log(`PASS template ${template}: original mode PNG pixel-identical to Git backup`);
    const colored = await capture(`template=${template}&color=%23db2777`);
    console.log(`PASS template ${template}: long colored PNG ${colored.info.width}x${colored.info.height}, no clipping, final narration and photos present`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); await server.close(); }
