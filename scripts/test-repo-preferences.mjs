import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = process.env.BASE_URL ? null : await createServer({
  configFile: false,
  root: root + 'tests/repo-preferences',
  resolve: { alias: { '@': root + 'src' } },
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
});
if (server) await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const requests = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Every API call is mocked, including potential legacy sync writes. No real
  // user identity, production credentials or account mutations in this test.
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push([route.request().method(), path]);
    let data = {};
    if (path.endsWith('/me')) data = { user: { id: 'fixture-user', email: 'fixture@example.test', displayName: 'Fixture', role: 'member', oshiMember: '山川宇衣', verificationStatus: 'none' } };
    if (path.endsWith('/preferences')) data = { oshiMember: '山川宇衣', followedMembers: [] };
    if (path.endsWith('/favorites')) {
      await new Promise(resolve => setTimeout(resolve, 500));
      data = { favorites: [{ name: '山川宇衣', group: '樱坂46' }, { name: '山下瞳月', group: '樱坂46' }] };
    }
    if (path.includes('/repo/')) data = { repos: [], total: 0, totalRepos: 0, totalUsers: 0, weeklyActiveUsers: 0 };
    await route.fulfill({ status: 200, json: { success: true, data } });
  });
  await page.goto(process.env.BASE_URL ? `${process.env.BASE_URL}/repo/create` : server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  const oshi = page.locator('[data-repo-member-folder="山川宇衣"]');
  await oshi.waitFor({ timeout: 45000 });
  assert.equal(await oshi.count(), 1);
  await oshi.getByRole('button', { name: /山川宇衣/ }).click();
  await oshi.getByText('暂无草稿', { exact: true }).waitFor();
  await oshi.getByRole('button', { name: '新建Repo', exact: true }).click();
  assert(await page.getByRole('button', { name: /山川宇衣 櫻坂46/ }).count());
  await page.getByRole('button', { name: /お気に入り/ }).click();
  const favorite = page.locator('[data-repo-member-folder="山下瞳月"]');
  await favorite.waitFor();
  await favorite.getByRole('button', { name: /山下瞳月/ }).click();
  await favorite.getByRole('button', { name: '新建Repo', exact: true }).click();
  assert(await page.getByRole('button', { name: /山下瞳月 櫻坂46/ }).count());
  assert(!requests.some(([method, path]) => method !== 'GET' && path.includes('/repo/')));
  assert(requests.some(([, path]) => path.endsWith('/favorites')));
  console.log('PASS backend auth/preferences/favorites hydration -> empty member folders -> new Repo with correct member; no draft writes');
  if (server) {
    await page.locator('#change-preferences').click();
    await page.getByRole('button', { name: /推し/ }).click();
    await page.locator('[data-repo-member-folder="森田ひかる"]').waitFor();
    await page.getByRole('button', { name: /お気に入り/ }).click();
    await oshi.waitFor();
    assert.equal(await favorite.count(), 0);
    console.log('PASS reactive preference changes remove stale empty folders and reclassify members');
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server?.close();
}
