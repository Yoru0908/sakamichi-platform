// npm run build first. Set NODE_PATH for Playwright and optionally CHROME_PATH.
// RELATIONS_BASE_URL targets a deployed page; normal tests use API fixtures only.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { analyzeBlogs } from '../src/utils/blog-relations/analyze.ts';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve('dist');
const server = createServer(async (req, res) => {
  try {
    let file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!path.extname(file)) file = file.replace(/\/$/, '') + '/index.html';
    const resolved = path.resolve(root, '.' + file);
    if (!resolved.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(resolved);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = process.env.RELATIONS_BASE_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const fixture = (id, content = '<p lang="ja">小田倉さんと旅行。小田倉さんに感謝。</p>') => ({ id: `sakurazaka-${id}`, member: '山川宇衣', group_name: '樱坂46', title: `旅行 ${id}`, publish_date: '2026.09.07 22:13', original_url: `https://sakurazaka46.com/s/s46/diary/detail/${id}`, original_content: null, bilingual_content: content });
const reports = {
  'sakurazaka:2026-09': analyzeBlogs([...Array.from({ length: 12 }, (_, i) => fixture(70916 + i)), fixture(1, '<p lang="zh">守屋麗奈</p>')], 'sakurazaka', '2026-09'),
  'sakurazaka:2026-08': analyzeBlogs([{ ...fixture(2, '<p lang="zh">小田倉麗奈</p>'), publish_date: '2026.08.01' }], 'sakurazaka', '2026-08'),
  'nogizaka:2026-09': analyzeBlogs([{ ...fixture(3), member: '梅澤美波', group_name: '乃木坂46', original_url: 'https://www.nogizaka46.com/s/n46/diary/detail/104819', bilingual_content: '<p lang="ja">こんにちは。</p>' }], 'nogizaka', '2026-09'),
};
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => localStorage.setItem('lang', 'zh'));
    const page = await context.newPage(); page.setDefaultTimeout(12000); page.setDefaultNavigationTimeout(20000); const errors = []; const oldRequests = []; const relationRequests = []; let fail = false;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (req) => { if (/\/data\/interactions.json|\/api\/interactions\//.test(req.url())) oldRequests.push(req.url()); });
    await page.route('https://api.46log.com/**', (route) => route.fulfill({ json: { success: true, blogs: [], data: [], generations: [] } }));
    await page.route('**/api/blog-relations*', async (route) => {
      const url = new URL(route.request().url()); relationRequests.push(url.search);
      if (fail) { await route.fulfill({ status: 503, json: { success: false, error: '测试：数据源暂时不可用' } }); return; }
      if (url.searchParams.has('group')) {
        if (url.searchParams.get('group') === 'sakurazaka') await new Promise((resolve) => setTimeout(resolve, 100));
        await route.fulfill({ json: { success: true, data: reports[`${url.searchParams.get('group')}:${url.searchParams.get('month')}`] } });
      } else await route.fulfill({ json: { success: true, data: { months: Object.keys(reports).map((key) => { const [group, month] = key.split(':'); return { group, month, blogCount: reports[key].coverage.sourceRows }; }) } } });
    });
    await page.goto(base + '/blog/', { waitUntil: 'domcontentloaded' });
    await page.locator('.blog-pill').filter({ hasText: '关系分析' }).click();
    await page.locator('[data-relations-coverage]').waitFor();
    assert.match(await page.locator('[data-relations-coverage]').innerText(), /已分析日语正文 12 篇/);
    assert.match(await page.locator('[data-relations-coverage]').innerText(), /缺日语正文 1 篇/);
    const source = page.getByRole('button', { name: '查看 山川宇衣 提及 小田倉麗奈 的依据', exact: true });
    await source.click();
    assert.equal(await page.locator('[data-relations-evidence] article').count(), 10);
    assert.match(await page.locator('[data-relations-evidence]').innerText(), /12 篇博客 \/ 24 处/);
    assert.equal(await page.locator('[data-relations-evidence] mark').first().textContent(), '小田倉さん');
    assert.match(await page.locator('[data-relations-evidence] a').first().getAttribute('href'), /^https:\/\/sakurazaka46.com\/s\/s46\/diary\/detail\/\d+$/);
    await page.getByRole('button', { name: '下一页依据', exact: true }).click();
    assert.equal(await page.locator('[data-relations-evidence] article').count(), 2);
    await page.getByRole('button', { name: '关闭依据', exact: true }).click();
    await page.getByRole('button', { name: '被提及排行', exact: true }).click();
    await page.getByRole('button', { name: '12 篇 / 24 处 · 查看来源', exact: true }).click();
    await source.waitFor();
    await page.getByRole('button', { name: '期别提及', exact: true }).click();
    await page.getByRole('button', { name: '12', exact: true }).click();
    await page.getByRole('button', { name: '山川宇衣 → 小田倉麗奈 · 12 篇', exact: true }).click();
    await page.locator('[data-relations-evidence]').waitFor();
    await page.getByLabel('博客月份（JST）', { exact: true }).selectOption('2026-08');
    await page.getByText('没有可用的日语正文，无法得出提及统计。', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-relations-evidence]').count(), 0);
    await page.getByLabel('团体', { exact: true }).selectOption('nogizaka');
    await page.getByText('已分析的 1 篇中，没有识别出符合当前规则的同团提及。', { exact: true }).waitFor();
    await page.getByLabel('团体', { exact: true }).selectOption('sakurazaka');
    await page.getByLabel('团体', { exact: true }).selectOption('nogizaka');
    await page.getByText('已分析的 1 篇中，没有识别出符合当前规则的同团提及。', { exact: true }).waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-relations-evidence]').count(), 0, 'Late responses cannot restore another group');
    fail = true; await page.getByRole('button', { name: '重新读取', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('[data-relations-coverage]').count(), 0, 'Failures must not pretend a stale result is current');
    fail = false; await page.getByRole('button', { name: '重新读取', exact: true }).click();
    await page.getByText('已分析的 1 篇中，没有识别出符合当前规则的同团提及。', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(oldRequests, []); assert.deepEqual(errors, []);
    if (process.env.RELATIONS_ARTIFACTS) {
      await page.getByRole('button', { name: '提及关系', exact: true }).click();
      await page.getByLabel('团体', { exact: true }).selectOption('sakurazaka');
      await source.waitFor(); await source.click();
      await page.waitForTimeout(300); await mkdir(process.env.RELATIONS_ARTIFACTS, { recursive: true });
      await page.screenshot({ path: path.join(process.env.RELATIONS_ARTIFACTS, `${name}.png`), fullPage: true });
    }
    console.log(`PASS ${name}: lazy month load, Japanese evidence, pagination, aggregates, missing vs zero, race/error/retry; ${relationRequests.length} requests`);
    await context.close();
  }
} finally { await browser.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
