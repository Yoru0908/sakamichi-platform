import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Run against `npm run dev -- --host 127.0.0.1` or a built static preview.
const base = process.env.BASE_URL || 'http://127.0.0.1:4321';
const browser = await chromium.launch();
const origin = { longitude: 139.7671234, latitude: 35.6812345, accuracy: 35 };
const makeFeature = (id, coordinates, category = 'Vlog・企画') => ({
  type: 'Feature', geometry: { type: 'Point', coordinates },
  properties: { id, name: `検証 ${id}`, category, subcategory: '検証企画', categoryColor: '#d45f89', address: '東京都', sceneTitle: '', sceneNote: '', sourceLabel: '', sourceUrl: '', referenceUrl: '', tags: [], images: [] },
});
const fixture = { type: 'FeatureCollection', features: [
  makeFeature('far', [135.4959, 34.7025]),
  makeFeature('edge', [origin.longitude, origin.latitude + 0.1]),
  makeFeature('near', [origin.longitude, origin.latitude + 0.02], 'MV・楽曲'),
  makeFeature('here', [origin.longitude, origin.latitude]),
] };

const errors = [];
const requests = [];
async function openPage(viewport = { width: 1440, height: 900 }, errorCode = 0) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url() + (request.postData() || '')));
  await page.route('**/seichi/yamakawa-ui.geojson', route => route.fulfill({ json: fixture }));
  await page.route('**/*', route => route.request().resourceType() === 'image' ? route.abort() : route.fallback());
  await page.addInitScript(({ origin, errorCode }) => {
    window.__locationCalls = 0;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success, failure) {
        window.__locationCalls++;
        if (errorCode) failure({ code: errorCode });
        else success({ coords: origin, timestamp: Date.now() });
      },
    } });
  }, { origin, errorCode });
  await page.goto(base + '/seichi/yamakawa-ui/', { waitUntil: 'networkidle' });
  await page.locator('[data-prefecture-status="ready"]').waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => window.__locationCalls), 0, 'never request location on page load');
  return page;
}

try {
  const page = await openPage();
  await page.getByRole('button', { name: '現在地の周辺を探す', exact: true }).click();
  const controls = page.locator('[data-nearby-controls]');
  await controls.locator('[data-location-accuracy]').waitFor();
  assert.match(await controls.innerText(), /35 m/);
  const rows = page.locator('[data-seichi-feature]');
  assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.seichiFeature)), ['here', 'near']);
  assert.equal(await page.locator('.seichi-current-location').count(), 1);
  assert.equal(await page.locator('.seichi-location-accuracy').count(), 1);
  await controls.getByLabel('周辺検索の半径').selectOption('25');
  assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.seichiFeature)), ['here', 'near', 'edge']);
  const distances = await rows.evaluateAll(nodes => nodes.map(node => Number(node.dataset.distanceKm)));
  assert(distances[0] < distances[1] && distances[1] < distances[2]);
  assert(await page.getByLabel('地図の範囲だけ一覧に表示').isDisabled());
  await page.getByRole('button', { name: '検証 edgeをルートに追加', exact: true }).click();
  await page.getByRole('button', { name: /^Vlog・企画 \(/ }).click();
  assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.dataset.seichiFeature)), ['here', 'edge']);
  await page.getByPlaceholder('地点名・住所・番組名で検索...').fill('not-present');
  assert.equal(await rows.count(), 0);
  assert(await page.getByText(/半径 25 km 以内に地点がありません/).isVisible());
  await page.getByPlaceholder('地点名・住所・番組名で検索...').fill('');
  await page.getByRole('button', { name: '検証 edgeの詳細を表示', exact: true }).click();
  assert(await page.getByRole('heading', { name: '検証 edge', exact: true }).count());
  await page.keyboard.press('Escape');
  await controls.getByLabel('周辺の地点を近い順に表示').uncheck();
  assert(await page.getByLabel('地図の範囲だけ一覧に表示').isChecked(), 'restore the prior viewport filter');
  assert(!(await page.getByLabel('地図の範囲だけ一覧に表示').isDisabled()));
  await controls.getByRole('button', { name: '現在地を消去', exact: true }).click();
  assert.equal(await page.locator('.seichi-current-location').count(), 0);
  const saved = await page.evaluate(() => Object.entries(localStorage));
  assert(saved.some(([key, value]) => key.startsWith('seichi-route:') && value.includes('edge')));
  // Only stop coordinates are part of stored route keys; the exact browser location must never be stored.
  assert(!saved.some(([, value]) => value.includes(String(origin.latitude))));
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => window.__locationCalls), 0);
  assert.equal(await page.locator('.seichi-current-location').count(), 0);
  await page.close();
  console.log('PASS explicit location, accuracy, sorted radius, category/search intersection, viewport restoration, place selection and route persistence');

  const mobile = await openPage({ width: 390, height: 844 });
  await mobile.getByRole('button', { name: '現在地の周辺を探す', exact: true }).click();
  const mobileControls = mobile.locator('[data-nearby-controls]');
  await mobileControls.getByLabel('周辺検索の半径').selectOption('25');
  assert.equal(await mobile.locator('[data-seichi-feature]').count(), 3);
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.getByRole('button', { name: '検証 nearの詳細を表示', exact: true }).click();
  assert(await mobile.locator('main').getByRole('heading', { name: '検証 near', exact: true }).isVisible());
  await mobile.keyboard.press('Escape');
  await mobile.getByRole('button', { name: /^リストを表示/ }).click();
  assert.equal(await mobile.locator('[data-seichi-feature]').count(), 3, 'map movement must not shrink nearby list');
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  if (process.env.SCREENSHOT_DIR) {
    await mobile.screenshot({ path: `${process.env.SCREENSHOT_DIR}/seichi-nearby-mobile.png`, fullPage: true });
  }
  await mobile.close();
  console.log('PASS mobile 390px nearby list, place selection and viewport-independent results');

  for (const [code, expected] of [[1, /許可されていません/], [2, /端末の位置情報設定/], [3, /タイムアウト/]]) {
    const denied = await openPage({ width: 390, height: 844 }, code);
    await denied.getByRole('button', { name: '現在地の周辺を探す', exact: true }).click();
    assert.match(await denied.getByRole('alert').innerText(), expected);
    assert.equal(await denied.locator('.seichi-current-location').count(), 0);
    assert.equal(await denied.getByRole('button', { name: '現在地の周辺を探す', exact: true }).isDisabled(), false);
    await denied.close();
  }
  assert(!requests.some(request => request.includes(String(origin.latitude)) || request.includes(String(origin.longitude))), 'no request may contain precise current coordinates before explicit navigation');
  assert.deepEqual(errors, []);
  console.log('PASS permission denied, unavailable and timeout feedback; no location transmission/persistence or runtime errors');
} finally {
  await browser.close();
}
