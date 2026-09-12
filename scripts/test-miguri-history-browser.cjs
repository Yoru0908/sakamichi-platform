// npm run build first. Requires playwright and a Chromium installation.
// NODE_PATH=/path/to/node_modules CHROME_PATH=/path/to/chrome node scripts/test-miguri-history-browser.cjs
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFile, mkdir } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const catalogue = [
  { slug: 'old-hina', group: 'hinatazaka', title: '17th Kind of love', archived: true, roundCount: 2, latestRound: 3, lastCapturedAt: '2026-07-15 05:00:12' },
  { slug: 'old-nogi', group: 'nogizaka', title: '41st 最後に階段を駆け上がったのはいつだ？', archived: true, roundCount: 2, latestRound: 2, lastCapturedAt: '2026-05-28 05:00:04' },
  { slug: 'partial', group: 'sakurazaka', title: '15th Missing structure', archived: false, roundCount: 2, latestRound: 3, lastCapturedAt: '2026-08-26 05:00:04' },
  { slug: 'missing', group: 'sakurazaka', title: '14th No snapshots', archived: true, roundCount: 0, latestRound: null, lastCapturedAt: null },
].map((event) => ({ ...event, sourceUrl: 'https://fortunemusic.jp/' + event.slug, firstDate: '2026-05-31', lastDate: '2026-07-01' }));

function detail(slug) {
  const event = catalogue.find((event) => event.slug === slug);
  const partial = slug === 'partial';
  const lastRound = event.latestRound;
  const members = slug === 'old-nogi' ? ['井上和', '賀喜遥香'] : ['小坂菜緒', '金村美玖'];
  const cells = [
    { round: 1, date: '2026-05-31', slot: 1, member: members[0] },
    { round: lastRound, date: '2026-05-31', slot: 2, member: members[1] },
  ];
  const special = slug === 'old-hina';
  const keys = ['2026-05-31::1', '2026-05-31::2'];
  const extraKeys = [1,2,3,4].map((slot) => `2026-11-29::${slot}`);
  return { event, dates: partial ? [] : special ? ['2026-05-31', '2026-11-29'] : ['2026-05-31'], slotNumbers: partial ? [] : special ? [1,2,3,4] : [1, 2], members, cells,
    ...(special ? { slotsByDate: { '2026-05-31': [1,2], '2026-11-29': [1,2,3,4] }, memberSlotKeys: { [members[0]]: [...keys, ...extraKeys], [members[1]]: keys } } : {}),
    rounds: [1, lastRound].map((round) => ({ round, windowLabel: `第${round}次`, capturedAt: event.lastCapturedAt, memberCount: 2, cellCount: 1 })),
    memberTotals: Object.fromEntries(members.map((member, i) => [member, special && i === 0 ? 6 : 2])), structureAvailable: !partial };
}

(async () => {
  const root = path.resolve(__dirname, '../dist');
  const server = createServer(async (req, res) => {
    try {
      let filename = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!path.extname(filename)) filename = filename.replace(/\/$/, '') + '/index.html';
      const resolved = path.resolve(root, '.' + filename);
      if (!resolved.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const content = await readFile(resolved);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(filename)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type }).end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [];
      const detailRequests = [];
      let failCatalogue = false;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('https://api.46log.com/**', async (route) => {
        const url = new URL(route.request().url());
        let data = { success: false };
        if (url.pathname.endsWith('/soldout-history')) data = failCatalogue ? { success: false, message: '测试目录错误' } : { success: true, data: { events: catalogue } };
        else if (url.pathname.endsWith('/soldout')) {
          const slug = url.searchParams.get('event');
          detailRequests.push(slug);
          if (slug === 'old-hina') await new Promise((resolve) => setTimeout(resolve, 80));
          data = { success: true, data: detail(slug) };
        } else if (url.pathname.endsWith('/events')) data = { success: true, data: { events: [], entries: [], favorites: [], authenticated: false } };
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true' }, body: JSON.stringify(data) });
      });
      await page.goto(base + '/miguri/history');
      await page.getByText('选择一个活动，查看已保存的个握完售记录。').waitFor();
      assert.equal(await page.locator('[data-history-event]').count(), 3);
      assert.equal(detailRequests.length, 0, 'Catalogue must not load all historical cells');
      await page.locator('[data-history-event="old-hina"]').click();
      await page.getByLabel('回看完售轮次').waitFor();
      await page.getByLabel('回看完售轮次').selectOption('3');
      assert.equal(await page.locator('table thead tr:first-child th[colspan="4"]').count(), 1);
      assert.equal(await page.locator('td[aria-label="未安排"]').count(), 4, 'Special-date nonparticipants must not appear as unsold');
      assert.match(page.url(), /event=old-hina/);
      await page.getByText(/14:00:12 JST/).waitFor();
      if (process.env.HISTORY_BROWSER_ARTIFACTS) {
        await mkdir(process.env.HISTORY_BROWSER_ARTIFACTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.HISTORY_BROWSER_ARTIFACTS, name + '.png'), fullPage: true });
      }
      await page.locator('[data-history-event="old-nogi"]').click();
      await page.getByRole('cell', { name: '井上和' }).waitFor();
      assert.equal(await page.getByLabel('回看完售轮次').inputValue(), '', 'Round must reset when changing event');
      await page.goBack();
      await page.getByRole('cell', { name: '小坂菜緒' }).waitFor();
      await page.getByLabel('搜索完售活动').fill('ＫＩＮＤ OF LOVE');
      assert.equal(await page.locator('[data-history-event]').count(), 1);
      await page.getByLabel('筛选团体').selectOption('nogizaka');
      await page.getByText('没有匹配活动，试试清空搜索或选择「全部活动」。').waitFor();
      await page.getByRole('button', { name: '重置筛选' }).click();
      await page.getByLabel('筛选记录范围').selectOption('all');
      await page.locator('[data-history-event="missing"]').click();
      await page.getByText('该活动暂无已保存的完售轮次，无法还原未采集的历史。这不表示0部完售。').waitFor();
      assert.ok(!detailRequests.includes('missing'));
      await page.locator('[data-history-event="partial"]').click();
      await page.locator('[data-incomplete-soldout]').waitFor();
      assert.equal(await page.locator('[data-incomplete-soldout] tbody tr').count(), 2);
      await page.getByLabel('回看完售轮次').selectOption('1');
      assert.equal(await page.locator('[data-incomplete-soldout] tbody tr').count(), 1);
      assert.doesNotMatch(await page.locator('[data-incomplete-soldout]').innerText(), /100%|次完売/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Page must not overflow horizontally');
      await page.goto(base + '/miguri/history?event=old-nogi');
      await page.getByRole('cell', { name: '井上和' }).waitFor();
      await page.goto(base + '/miguri/history?event=unknown');
      await page.getByText('未找到链接对应的活动，请从目录重新选择。').waitFor();
      failCatalogue = true;
      await page.goto(base + '/miguri/history');
      await page.getByRole('alert').getByText('测试目录错误').waitFor();
      failCatalogue = false;
      await page.getByRole('button', { name: '重新加载目录' }).click();
      await page.locator('[data-history-event="old-hina"]').waitFor();
      await page.goto(base + '/miguri');
      assert.equal(await page.getByRole('link', { name: '个握历史完售 · 已结束活动也能查 →' }).count(), 0);
      assert.equal(await page.getByRole('link', { name: '排队监控 · 实时队列与历史回顾 →' }).count(), 0);
      if (name === 'desktop') {
        await page.locator('nav a[href="/miguri"]').first().hover();
        await page.locator('nav a[href="/miguri/history"]').waitFor();
        await page.locator('nav a[href="/miguri/queue"]').waitFor();
      } else {
        await page.getByRole('button', { name: 'Open menu', exact: true }).click();
        await page.getByRole('link', { name: '历史完售', exact: true }).first().waitFor();
      }
      assert.deepEqual(errors, [], 'No browser runtime errors');
      await context.close();
      console.log(`PASS ${name}: history/filter/round reset/back/deep link/missing/partial/retry/empty manager`);
    }
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
