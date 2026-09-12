import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV_ITEMS, MOBILE_NAV_GROUPS, FOOTER_CONTENT_LINKS, FOOTER_TOOL_LINKS, isNavItemActive } from '../src/utils/navigation.ts';
import { t } from '../src/i18n/index.ts';
import { zh } from '../src/i18n/zh.ts';
import { ja } from '../src/i18n/ja.ts';
import { en } from '../src/i18n/en.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('all locale dictionaries expose identical nonempty keys', () => {
  for (const dictionary of [ja, en]) assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(zh).sort());
  for (const dictionary of [zh, ja, en]) for (const value of Object.values(dictionary)) assert.ok(value.trim());
});

test('Instagram is archived under More, not a top-level content item', () => {
  assert.ok(!NAV_ITEMS.some((item) => item.href === '/instagram'));
  const more = NAV_ITEMS.find((item) => item.href === '/tools');
  assert.equal(more.children.filter((item) => item.href === '/instagram').length, 1);
  const groups = MOBILE_NAV_GROUPS.filter((group) => group.items.some((item) => item.href === '/instagram'));
  assert.deepEqual(groups.map((group) => group.groupKey), ['nav.group.tools']);
  assert.ok(!FOOTER_CONTENT_LINKS.some((item) => item.href === '/instagram'));
  assert.equal(FOOTER_TOOL_LINKS.filter((item) => item.href === '/instagram').length, 1);
  assert.ok(!read('src/components/home/QuickAccess.astro').includes("href: '/instagram'"));
});

test('the More pill remains active for archives and nested tools without prefix collisions', () => {
  const active = (path) => NAV_ITEMS.filter((item) => isNavItemActive(item, path)).map((item) => item.href);
  for (const path of ['/tools', '/tools/srt-fixer', '/instagram', '/instagram/']) assert.deepEqual(active(path), ['/tools']);
  assert.deepEqual(active('/instagram-elsewhere'), []);
  assert.deepEqual(active('/miguri/history'), ['/miguri']);
  assert.deepEqual(active('/'), ['/']);
});

test('Japanese labels and counts are natural and interpolated', () => {
  assert.equal(t('nav.tools', 'ja'), 'その他');
  assert.equal(t('nav.instagram', 'ja'), 'Instagram アーカイブ');
  assert.equal(t('nav.schedule', 'ja'), 'スケジュール');
  assert.equal(t('nav.repo', 'ja'), 'ミーグリレポ');
  assert.equal(t('ins.favorites', 'ja'), 'お気に入り');
  assert.equal(t('ins.shown', 'ja', { shown: '48', total: '96' }), '96件中 48件を表示');
  assert.ok(!t('footer.copyright', 'ja', { year: '2026' }).includes('{year}'));
});

test('static pages and React islands share the language store and survive Astro navigation', () => {
  assert.match(read('src/layouts/BaseLayout.astro'), /import '@\/i18n\/runtime'/);
  assert.match(read('src/i18n/runtime.ts'), /astro:after-swap/);
  assert.match(read('src/i18n/runtime.ts'), /\$language\.subscribe/);
  assert.match(read('src/i18n/use-language.ts'), /useSyncExternalStore\(subscribe, snapshot, serverSnapshot\)/);
  for (const file of ['nav/NavPill.tsx', 'nav/ToolsDropdown.tsx', 'nav/MobileDrawer.tsx', 'nav/AuthButton.tsx', 'ui/LanguageSwitch.tsx', 'instagram/InsArchive.tsx']) {
    assert.match(read(`src/components/${file}`), /useLanguage\(\)/);
  }
  const nav = read('src/components/nav/NavPill.tsx');
  assert.match(nav, /ResizeObserver/);
  assert.ok(!nav.includes("t(item.labelKey, 'zh')"));
  for (const file of ['src/pages/tools/index.astro', 'src/components/footer/Footer.astro']) assert.match(read(file), /data-i18n=/);
  assert.ok(!read('src/components/instagram/InsArchive.tsx').includes('収藏'));
});
