// npm run build first; requires Playwright and Chromium (optionally CHROME_PATH).
// I18N_BASE_URL can target a deployed build; API responses are fixtures, never writes.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '../dist');
  const server = createServer(async (req, res) => {
    try {
      let filename = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!path.extname(filename)) filename = filename.replace(/\/$/, '') + '/index.html';
      const resolved = path.resolve(root, '.' + filename);
      if (!resolved.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const content = await readFile(resolved);
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(filename)] || 'application/octet-stream' }).end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = process.env.I18N_BASE_URL || `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['small-desktop', { width: 1280, height: 900 }], ['tablet', { width: 1024, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(() => { if (!localStorage.getItem('lang')) localStorage.setItem('lang', 'ja'); });
      await context.route('https://api.46log.com/**', (route) => route.fulfill({ json: { success: false, country: 'US' } }));
      await context.route('https://ins-download.46log.com/api/**', (route) => route.fulfill({ json: { success: true, data: { items: [], pagination: { total: 0, page: 1, has_more: false } } } }));
      const page = await context.newPage();
      const errors = [];
      const msgRequests = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error' && /hydration|Minified React error/i.test(message.text())) errors.push(message.text()); });
      page.on('request', (request) => { if (request.url().includes('msg-archive.')) msgRequests.push(request.url()); });
      const main = page.locator('main');
      const nav = page.locator('nav').first();
      const language = page.locator('astro-island[component-url*="LanguageSwitch"]');
      const drawer = page.locator('astro-island[component-url*="MobileDrawer"]');
      const waitTitle = async (text) => {
        await main.getByRole('heading', { name: text, exact: true }).waitFor();
        await page.waitForFunction(() => !document.querySelector('astro-island[client="load"][ssr]'));
        // Static translated headings appear before React hydration / View Transitions finish.
        // Do not immediately cancel a just-started hydration with another history navigation.
        await page.waitForTimeout(450);
      };
      const switchTo = async (label, title) => {
        await language.getByRole('button').first().click();
        await language.getByRole('button', { name: label, exact: true }).click();
        await waitTitle(title);
      };
      const checkPill = async () => {
        await page.mouse.move(0, 250);
        await page.waitForTimeout(350);
        const link = await nav.getByRole('link', { name: 'その他', exact: true }).boundingBox();
        const pill = await nav.locator('astro-island[component-url*="NavPill"] div.pointer-events-none').boundingBox();
        assert.ok(pill && link && Math.abs(link.x - pill.x) < 3 && Math.abs(link.width - pill.width) < 3, 'Pill tracks the translated active item');
      };
      await page.goto(base + '/tools');
      await waitTitle('その他');
      await language.getByRole('button', { name: '言語を切り替え' }).waitFor();
      assert.equal(await page.title(), 'その他 - Sakamichi Tools');
      assert.equal(await page.locator('html').getAttribute('lang'), 'ja');
      assert.equal(await main.getByRole('heading', { name: 'アーカイブ', exact: true }).count(), 1);
      assert.equal(await main.getByRole('link', { name: /Instagram アーカイブ/ }).count(), 1);
      assert.ok(!(await page.locator('footer').innerText()).match(/社区|更多|免责声明|博客翻译/));
      assert.ok(!(await main.innerText()).match(/工具箱|归档|修复|合并|批量/));
      assert.equal(await page.locator('a[href^="/messages"], a[href^="/tools/msg-generator"]').count(), 0);
      assert.ok((await nav.getByRole('link', { name: 'Sakamichi Tools', exact: true }).boundingBox()).height < 40, 'Header labels must not wrap');
      if (viewport.width >= 1280) {
        assert.equal(await nav.locator('a[href="/instagram"]').count(), 0);
        await nav.getByRole('link', { name: 'その他', exact: true }).hover();
        await nav.getByRole('link', { name: 'Instagram アーカイブ', exact: true }).waitFor();
        await nav.getByRole('link', { name: 'ミーグリ', exact: true }).hover();
        await page.waitForTimeout(250);
        assert.notEqual(await nav.getByRole('link', { name: 'その他', exact: true }).evaluate((el) => getComputedStyle(el).color), 'rgb(255, 255, 255)', 'Inactive text must not remain white while the pill moves');
        await checkPill();
      } else {
        await page.getByRole('button', { name: 'メニューを開く', exact: true }).click();
        const archive = drawer.getByRole('link', { name: 'Instagram アーカイブ', exact: true });
        await archive.waitFor();
        assert.match(await archive.locator('..').innerText(), /^その他/);
        await drawer.getByRole('button', { name: 'メニューを閉じる', exact: true }).click();
      }
      let second;
      if (name === 'desktop') { second = await context.newPage(); await second.goto(base + '/tools'); await second.locator('main h1').filter({ hasText: 'その他' }).waitFor(); }
      await switchTo('EN', 'More');
      assert.equal(await page.title(), 'More - Sakamichi Tools');
      if (second) { await second.locator('main h1').filter({ hasText: 'More' }).waitFor(); await second.close(); }
      await switchTo('中文', '更多');
      await switchTo('日本語', 'その他');
      await page.reload();
      await waitTitle('その他');
      await main.getByRole('link', { name: /Instagram アーカイブ/ }).click();
      await waitTitle('Instagram アーカイブ');
      await main.getByText('メンバーを選択してください', { exact: true }).waitFor();
      assert.equal(await page.title(), 'Instagram アーカイブ - Sakamichi Tools');
      if (viewport.width >= 1024) {
        if (viewport.width >= 1280) await checkPill();
        assert.equal(await main.getByPlaceholder('メンバーを検索…').count(), 1);
        assert.equal(await main.getByRole('button', { name: 'お気に入り', exact: true }).count(), 1);
      }
      await page.goBack();
      await waitTitle('その他');
      await page.goForward();
      await waitTitle('Instagram アーカイブ');
      await page.goBack();
      await waitTitle('その他');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
      await page.waitForTimeout(450); // Let the browser's View Transition finish before capturing.
      if (process.env.I18N_BROWSER_ARTIFACTS) {
        await mkdir(process.env.I18N_BROWSER_ARTIFACTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.I18N_BROWSER_ARTIFACTS, name + '.png'), fullPage: true });
      }
      assert.deepEqual(errors, [], `${name}: no hydration or runtime errors`);
      assert.deepEqual(msgRequests, []);
      await context.close();
      console.log(`${name}: Japanese reload, language changes, archive navigation, footer and history passed`);
    }
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('lang', 'invalid-locale'));
    const page = await context.newPage();
    await page.goto(base + '/tools');
    await page.locator('main').getByRole('heading', { name: '更多', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
