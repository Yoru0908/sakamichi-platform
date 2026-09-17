import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
const root = resolve('dist');
const server = process.env.BASE_URL ? null : http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const map = path.match(/^\/api\/seichi-data\/(\w+)$/)?.[1];
    const names = { sakurazaka: 'sakurazaka-all', hinatazaka: 'hinatazaka-all', oversea: 'oversea' };
    let file = resolve(root, '.' + (map && names[map] ? `/seichi/${names[map]}.geojson` : path));
    if (!file.startsWith(root + '/') && file !== root) throw new Error('outside root');
    if ((await stat(file)).isDirectory()) file += '/index.html';
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.geojson': 'application/json', '.json': 'application/json' }[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
if (server) await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = process.env.BASE_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const checkSorted = async (page, direction) => {
  const dates = await page.locator('[data-seichi-feature]').evaluateAll(es => es.map(el => el.dataset.timelineDate));
  const known = dates.filter(Boolean);
  assert(known.length > 10);
  assert.deepEqual(known, [...known].sort((a, b) => direction === 'newest' ? b.localeCompare(a) : a.localeCompare(b)));
  assert(dates.slice(known.length).every(date => !date), 'unknown dates must be last');
};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().resourceType() === 'image' && !/basemaps\.cartocdn\.com|tile\.openstreetmap\.org|server\.arcgisonline\.com/.test(route.request().url()) ? route.abort() : route.continue());
  await page.goto(base + '/seichi/sakurazaka/', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-prefecture-status="ready"]').waitFor();
  await page.locator('[data-seichi-feature="sakumap:221"]').waitFor({ state: 'attached' });
  const ids = await page.locator('[data-seichi-feature]').evaluateAll(es => es.map(e => e.dataset.seichiFeature));
  const kinds = await page.locator('.seichi-marker-glyph').evaluateAll(es => [...new Set(es.map(e => e.dataset.markerKind))]);
  assert(kinds.length >= 6);
  assert.equal(await page.locator('.seichi-marker-glyph > svg').count(), ids.length);
  await page.getByText('アイコンの見方', { exact: true }).click();
  assert.equal(await page.locator('details[open] svg').count(), 8);
  await page.getByText('アイコンの見方', { exact: true }).click();
  await page.getByLabel('地点の並び順').selectOption('newest');
  await checkSorted(page, 'newest');
  assert.equal(await page.locator('[data-seichi-feature]').count(), ids.length);
  await page.getByLabel('地点の並び順').selectOption('oldest');
  await checkSorted(page, 'oldest');
  await page.getByLabel('地点の並び順').selectOption('original');
  assert.deepEqual(await page.locator('[data-seichi-feature]').evaluateAll(es => es.map(e => e.dataset.seichiFeature)), ids);
  console.log('PASS semantic SVG markers/legend; timeline newest/oldest; unknown-last and original restoration');

  await page.getByRole('button', { name: 'MV・楽曲', exact: true }).click();
  assert.equal(await page.getByLabel('地点の並び順').inputValue(), 'newest');
  const work = await page.getByLabel('作品で絞り込む').locator('option').evaluateAll(es => es.find(e => e.textContent.includes('We got your back')).value);
  await page.getByLabel('作品で絞り込む').selectOption(work);
  assert(await page.locator('[data-seichi-feature]').count() >= 6);
  assert(await page.locator('[data-seichi-feature]').evaluateAll(es => es.every(e => e.dataset.timelineDate === '2026-06-10')));
  assert.equal(await page.locator('[data-timeline-heading]').count(), 1);
  await page.getByLabel('都道府県で絞り込む').selectOption('東京都');
  assert(await page.locator('[data-seichi-feature]').evaluateAll(es => es.every(e => e.dataset.prefecture === '東京都')));
  await page.locator('[data-seichi-feature]').first().getByRole('button', { name: /をルートに追加$/ }).click();
  const routeBefore = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('seichi-route:')));
  assert.equal(await page.locator('.is-route .seichi-marker-route-icon svg').count(), 1);
  await page.locator('[data-seichi-feature] h4').first().click();
  assert.equal(await page.locator('.seichi-marker-glyph.is-selected').count(), 1);
  await page.keyboard.press('Escape');
  if (process.env.SCREENSHOT_DIR) {
    await page.getByLabel('作品で絞り込む').selectOption('ALL');
    await page.getByLabel('作品で絞り込む').selectOption(work);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, 'timeline-desktop.png') });
  }
  await page.getByLabel('作品で絞り込む').selectOption('ALL');
  await page.getByLabel('地点の並び順').selectOption('oldest');
  assert.deepEqual(await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('seichi-route:'))), routeBefore);
  console.log('PASS MV shortcut, work selection/CD date labels, prefecture intersection, selected/route marker states and route stability');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^リストを表示/ }).click();
  await page.getByLabel('地点の並び順').selectOption('newest');
  await page.getByLabel('作品で絞り込む').selectOption(work);
  assert(await page.locator('[data-seichi-feature]').count() > 0);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.getByLabel('メンバー・作品フィルターを開閉').getAttribute('aria-expanded'), 'false');
  const rowBox = await page.locator('[data-seichi-feature]').first().boundingBox();
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.SCREENSHOT_DIR, 'timeline-mobile.png') });
  assert(rowBox && rowBox.y + rowBox.height < 755, `timeline should leave room for visible mobile rows: ${JSON.stringify(rowBox)}`);
  assert.deepEqual(errors, []);
  console.log('PASS mobile timeline and no runtime errors');
} finally { await browser.close(); if (server) await new Promise(done => server.close(done)); }
