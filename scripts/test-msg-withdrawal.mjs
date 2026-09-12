import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { onRequest as archiveRoot } from '../functions/messages/index.ts';
import { onRequest as archiveChild } from '../functions/messages/[[path]].ts';
import { onRequest as generatorRoot } from '../functions/tools/msg-generator/index.ts';
import { onRequest as generatorChild } from '../functions/tools/msg-generator/[[path]].ts';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('withdrawn root/deep routes return 410/noindex without fetching archives or executing client code', async () => {
  for (const route of [archiveRoot, archiveChild, generatorRoot, generatorChild]) {
    const response = route();
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
    const html = await response.text();
    assert.doesNotMatch(html, /<script|msg-archive\.46log\.com|astro-island/);
    assert.match(html, /此功能已下架/);
  }
});

test('page source is retained outside the production router and entry points/promos are gone', () => {
  assert.ok(existsSync(new URL('../archive/disabled-pages/messages/index.astro', import.meta.url)));
  assert.ok(existsSync(new URL('../archive/disabled-pages/tools/msg-generator.astro', import.meta.url)));
  assert.ok(!existsSync(new URL('../src/pages/messages/index.astro', import.meta.url)));
  assert.ok(!existsSync(new URL('../src/pages/tools/msg-generator.astro', import.meta.url)));
  for (const file of ['src/utils/navigation.ts','src/pages/index.astro','src/components/home/QuickAccess.astro','src/pages/tools/index.astro','src/layouts/BaseLayout.astro','src/components/footer/Footer.astro','src/components/user/UserDashboard.tsx','src/components/shared/GeoPassGate.tsx','src/pages/auth/register.astro','src/pages/auth/login.astro','src/pages/gallery/index.astro','src/pages/about.astro']) {
    assert.doesNotMatch(read(file), /\/messages['"?]|\/tools\/msg-generator|<TrendingMSG|MSG(?:归档|截图|消息|\/mail)|msg-archive\.46log\.com/, file);
  }
});

test('production build contains no archive/generator pages or message-island bundles', { skip: !existsSync(new URL('../dist', import.meta.url)) }, () => {
  assert.ok(!existsSync(new URL('../dist/messages/index.html', import.meta.url)));
  assert.ok(!existsSync(new URL('../dist/tools/msg-generator/index.html', import.meta.url)));
  assert.ok(!readdirSync(new URL('../dist/_astro', import.meta.url)).some((name) => /^(MsgArchive|MsgGenerator|TrendingMSG)\./.test(name)));
  for (const file of ['index.html','miguri/index.html','tools/index.html','about/index.html','auth/login/index.html','auth/register/index.html']) {
    assert.doesNotMatch(read('dist/' + file), /href="\/(?:messages|tools\/msg-generator)|msg-archive\.46log\.com|MSG(?:消息|归档|工具)|MSG archive|MSGアーカイブ/, file);
  }
});
