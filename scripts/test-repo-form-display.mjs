import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = process.env.BASE_URL ? null : await createServer({ configFile: false, root: root + 'tests/repo-form-display', resolve: { alias: { '@': root + 'src' } }, esbuild: { jsx: 'automatic' }, plugins: [tailwindcss()], server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } } });
await server?.listen();
const browser = await chromium.launch();
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
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
    // Language menu lives inside navbar's whitespace-nowrap action container.
    await page.getByRole('button', { name: '切换语言', exact: true }).click();
    const menu = page.locator('[data-language-options]');
    const layout = await menu.evaluate(el => {
      const box = el.getBoundingClientRect();
      return { box: { x: box.x, y: box.y, right: box.right, bottom: box.bottom }, items: [...el.querySelectorAll('button')].map(button => { const r = button.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height }; }) };
    });
    assert.equal(layout.items.length, 3);
    assert(layout.box.x >= 0 && layout.box.right <= width + 1);
    for (let i = 0; i < 3; i++) {
      const r = layout.items[i];
      assert(r.x >= layout.box.x && r.right <= layout.box.right + 1 && r.bottom <= layout.box.bottom + 1);
      assert(r.height >= 30);
      if (i) assert(r.y >= layout.items[i - 1].bottom - 0.1, 'language options must be vertically stacked');
    }
    await menu.getByRole('button', { name: 'EN', exact: true }).click();
    assert.equal(await menu.count(), 0);
    await page.getByRole('button', { name: 'Switch language', exact: true }).click();
    await menu.getByRole('button', { name: '日本語', exact: true }).click();
    await page.getByRole('button', { name: '言語を切り替え', exact: true }).click();
    await menu.getByRole('button', { name: '中文', exact: true }).click();
    await folder.getByRole('button', { name: /山川宇衣/ }).click();
    await folder.getByRole('button', { name: '新建Repo', exact: true }).click();
    const slot = page.getByRole('spinbutton', { name: '场次', exact: true });
    const count = page.getByRole('spinbutton', { name: '券数', exact: true });
    for (const [input, value] of [[slot, '2'], [count, '3']]) {
      await input.fill(''); assert.equal(await input.inputValue(), '');
      await input.blur(); assert.equal(await input.inputValue(), '', 'blur must not insert zero');
      await input.pressSequentially(value); assert.equal(await input.inputValue(), value);
      await input.press('Backspace'); assert.equal(await input.inputValue(), '');
      await input.pressSequentially(value); assert.equal(await input.inputValue(), value, 'no leading zero after retyping');
    }
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await page.getByRole('button', { name: '覆盖保存', exact: true }).waitFor();
    assert.equal(saved.slotNumber, 2); assert.equal(saved.ticketCount, 3);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await folder.getByRole('button', { name: /山川宇衣/ }).click();
    await folder.getByRole('button', { name: `${saved.eventDate} 第2部`, exact: true }).click();
    await slot.waitFor(); assert.equal(await slot.inputValue(), '2'); assert.equal(await count.inputValue(), '3');
    await slot.fill(''); await count.fill('');
    await page.getByRole('button', { name: '覆盖保存', exact: true }).click();
    await page.waitForTimeout(200);
    assert.equal(saved.slotNumber, 1); assert.equal(saved.ticketCount, 1, 'empty draft fields use valid numeric defaults');
    assert.equal(await slot.inputValue(), ''); assert.equal(await count.inputValue(), '');
    const unexpected = errors.filter(e => !process.env.BASE_URL || !e.startsWith('Minified React error #418;'));
    assert.deepEqual(unexpected, []);
    await page.close();
    console.log(`PASS ${width}px: language popup containment/switching, numeric clear/blur/retype, numeric save/reload; all account APIs mocked`);
  }
} finally { await browser.close(); await server?.close(); }
