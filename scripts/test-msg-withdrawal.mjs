import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { onRequest as archiveRoot } from '../functions/messages/index.ts';
import { onRequest as archiveChild } from '../functions/messages/[[path]].ts';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('withdrawn root/deep routes return 410/noindex without fetching archives or executing client code', async () => {
  for (const route of [archiveRoot, archiveChild]) {
    const response = route();
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
    const html = await response.text();
    assert.doesNotMatch(html, /<script|msg-archive\.46log\.com|astro-island/);
    assert.match(html, /此功能已下架/);
  }
});

test('message archive stays withdrawn while generator alone is restored', () => {
  assert.ok(existsSync(new URL('../archive/disabled-pages/messages/index.astro', import.meta.url)));
  assert.ok(!existsSync(new URL('../src/pages/messages/index.astro', import.meta.url)));
  assert.ok(existsSync(new URL('../src/pages/tools/msg-generator.astro', import.meta.url)));
  assert.ok(!existsSync(new URL('../functions/tools/msg-generator/index.ts', import.meta.url)));
  assert.ok(!existsSync(new URL('../functions/tools/msg-generator/[[path]].ts', import.meta.url)));
  assert.match(read('src/pages/tools/msg-generator.astro'), /<MsgGenerator client:load/);
  assert.doesNotMatch(read('src/pages/tools/msg-generator.astro'), /MsgArchive|TrendingMSG|msg-archive\.46log\.com/);
  assert.equal((read('src/utils/navigation.ts').match(/href: '\/tools\/msg-generator'/g) || []).length, 3);
  assert.match(read('src/pages/tools/index.astro'), /href: '\/tools\/msg-generator'/);
  for (const file of ['src/utils/navigation.ts','src/pages/index.astro','src/components/home/QuickAccess.astro','src/pages/tools/index.astro','src/layouts/BaseLayout.astro','src/components/footer/Footer.astro','src/components/user/UserDashboard.tsx','src/components/shared/GeoPassGate.tsx','src/pages/auth/register.astro','src/pages/auth/login.astro','src/pages/gallery/index.astro','src/pages/about.astro']) {
    assert.doesNotMatch(read(file), /\/messages['"?]|<TrendingMSG|MSG(?:归档|截图|消息|\/mail)|msg-archive\.46log\.com/, file);
  }
});

test('production build restores generator but not archive/trending bundles', { skip: !existsSync(new URL('../dist', import.meta.url)) }, () => {
  assert.ok(!existsSync(new URL('../dist/messages/index.html', import.meta.url)));
  assert.ok(existsSync(new URL('../dist/tools/msg-generator/index.html', import.meta.url)));
  const bundles = readdirSync(new URL('../dist/_astro', import.meta.url));
  assert.ok(bundles.some(name => /^MsgGenerator\./.test(name)));
  assert.ok(!bundles.some(name => /^(MsgArchive|TrendingMSG)\./.test(name)));
  for (const file of ['index.html','miguri/index.html','tools/index.html','about/index.html','auth/login/index.html','auth/register/index.html']) {
    assert.doesNotMatch(read('dist/' + file), /href="\/messages(?:[/?"]|$)|msg-archive\.46log\.com|MSG(?:消息|归档|工具)|MSG archive|MSGアーカイブ/, file);
  }
});
