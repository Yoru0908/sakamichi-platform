import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('dist');
const names = { sakurazaka: 'sakurazaka-all', hinatazaka: 'hinatazaka-all', oversea: 'oversea' };
const server = process.env.BASE_URL ? null : http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const map = path.match(/^\/api\/seichi-data\/(\w+)$/)?.[1];
    let file = resolve(root, '.' + (map && names[map] ? `/seichi/${names[map]}.geojson` : path));
    if (!file.startsWith(root + '/') && file !== root) throw new Error('outside root');
    if ((await stat(file)).isDirectory()) file += '/index.html';
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.geojson': 'application/json', '.json': 'application/json', '.svg': 'image/svg+xml' }[extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime }); res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
if (server) await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = process.env.BASE_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Test data/filter behavior without making thousands of third-party image requests.
  await page.route('**/*', route => route.request().resourceType() === 'image' ? route.abort() : route.continue());
  await page.goto(base + '/seichi/sakurazaka/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-prefecture-status="ready"]').waitFor();
  await page.locator('[data-seichi-feature="sakumap:221"]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('[data-seichi-feature^="sakumap:"]').count(), 20);
  const total = await page.locator('[data-seichi-feature]').count();
  const select = page.getByLabel('都道府県で絞り込む');
  await select.selectOption('群馬県');
  assert(await page.locator('[data-seichi-feature]').count() > 0);
  assert(await page.locator('[data-seichi-feature]').evaluateAll(es => es.every(el => el.dataset.prefecture === '群馬県')));
  await page.getByPlaceholder('地点名・住所・番組名で検索...').fill('群馬サファリパーク');
  assert.equal(await page.locator('[data-seichi-feature]').count(), 1);
  await page.locator('[data-seichi-feature="sakumap:221"]').getByRole('button', { name: /をルートに追加$/ }).click();
  await page.getByPlaceholder('地点名・住所・番組名で検索...').fill('');
  await page.getByRole('button', { name: /^SakuMap 補足/ }).click();
  assert.equal(await page.locator('[data-seichi-feature]').count(), 1);
  await select.selectOption('東京都');
  assert.equal(await page.locator('[data-seichi-feature]').count(), 0, 'county and category must intersect');
  await page.getByRole('button', { name: /^すべて \(/ }).first().click();
  assert(await page.locator('[data-seichi-feature]').count() > 0);
  assert(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('seichi-route:')).some(k => localStorage.getItem(k).includes('sakumap:221'))));
  await select.selectOption('ALL');
  assert.equal(await page.locator('[data-seichi-feature]').count(), total);
  console.log('PASS 20 supplement venues, county/search/category intersection, count restoration and route preservation');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^リストを表示/ }).click();
  await select.selectOption('栃木県');
  assert(await page.locator('[data-seichi-feature="sakumap:319"]').count());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  console.log('PASS mobile list prefecture selector');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/seichi-data/sakurazaka', route => route.fulfill({ status: 502, body: 'test failure' }));
  await page.goto(base + '/seichi/sakurazaka/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-seichi-feature="sakumap:221"]').waitFor({ state: 'attached' });
  assert(await page.locator('[data-seichi-feature]').count() > 1000);
  await page.unroute('**/api/seichi-data/sakurazaka');
  await page.route('**/seichi/sakumap-supplement.geojson', route => route.fulfill({ status: 503, body: 'test failure' }));
  await page.route('**/seichi/boundaries/japan-prefectures.geojson', route => route.fulfill({ status: 503, body: 'test failure' }));
  await page.goto(base + '/seichi/sakurazaka/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-prefecture-status="fallback"]').waitFor();
  await page.getByRole('status').waitFor();
  assert(await page.locator('[data-seichi-feature]').count() > 1000);
  assert.equal(await page.locator('[data-seichi-feature^="sakumap:"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS live-data static fallback; supplement/boundary failures do not hide original maps; no runtime errors');
} finally { await browser.close(); if (server) await new Promise(done => server.close(done)); }
