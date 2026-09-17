import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const load = async file => {
  const result = await build({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const { getTimelineInfo, compareTimeline } = await load('./timeline.ts');
const { getMarkerKind, MARKER_STYLES, markerHtml } = await load('./marker-style.ts');
const f = (properties = {}) => ({ properties: { name: '会場', category: 'MV・楽曲', ...properties } });

test('8 distinct semantic glyphs; venue labels and source colors never enter marker HTML', () => {
  assert.equal(new Set(Object.values(MARKER_STYLES).map(x => x.svg)).size, 8);
  for (const [category, expected] of [['PV&ジャケット写真', 'music'], ['個人PV', 'person'], ['Vlog・企画', 'vlog'], ['ひなあい関連', 'tv'], ['雑誌', 'book'], ['メンバーブログ・SNS・その他', 'blog'], ['ライブ会場・舞台', 'live'], ['MISC', 'place'], ['シングル・アルバム（ヒット祈願関連）', 'tv']]) {
    assert.equal(getMarkerKind(f({ category })), expected);
  }
  assert(!markerHtml('music', false, '<img src=x onerror=alert(1)>').includes('onerror'));
  assert.match(markerHtml('music', true, 'A', true, true), /is-selected is-route is-visited is-active/);
  assert.match(markerHtml('music', false, 'A'), /seichi-marker-route-icon/);
});

test('official CD release dates, not MV upload, crawl, or shooting dates', () => {
  const info = getTimelineInfo(f({ subcategory: 'We got your back', sceneNote: '欅坂46「避雷針」と同じ場所。2026年9月18日追加。' }), '櫻坂46');
  assert.equal(info.date, '2026-06-10');
  assert.equal(info.label, 'CD発売日');
  assert.equal(getTimelineInfo(f({ subcategory: 'それでも歩いてる' }), '日向坂46').date, '2017-10-25', 'reissued hiragana album must not make the original work newer');
  assert.equal(getTimelineInfo(f({ subcategory: '二人セゾン' }), '欅坂46').date, '2016-11-30');
  assert.equal(getTimelineInfo(f({ name: '渋谷川', sceneTitle: '渋谷川' }), '欅坂46'), null, 'venue name is not a work match');
  assert.equal(getTimelineInfo(f({ sceneNote: '「二人セゾン」と「サイレントマジョリティー」両方の撮影地' }), '欅坂46'), null, 'ambiguous dates stay unknown');
  assert.equal(getTimelineInfo(f({ category: 'MISC', sceneNote: '2026-09-18取得', source: { url: 'https://example.com/2026/09/18' } })), null);
});

test('explicit title dates only, validated; no year-only or malformed calendar inference', () => {
  assert.equal(getTimelineInfo(f({ category: '番組・イベント', sceneTitle: '2026.8.9 そこさく' })).date, '2026-08-09');
  for (const sceneTitle of ['2026年お正月Vlog', '2026-02-30 番組', '2026-13-01 番組', '2026-02-01 / 2026-03-01 番組']) {
    assert.equal(getTimelineInfo(f({ category: '番組・イベント', sceneTitle })), null);
  }
});

test('unknown dates last in both orders; original ordering untouched', () => {
  const values = [null, { date: '2024-01-01', key: 'a' }, { date: '2026-01-01', key: 'b' }, null];
  assert.deepEqual([...values].sort((a, b) => compareTimeline(a, b, 'newest')), [values[2], values[1], null, null]);
  assert.deepEqual([...values].sort((a, b) => compareTimeline(a, b, 'oldest')), [values[1], values[2], null, null]);
  assert.deepEqual([...values].sort((a, b) => compareTimeline(a, b, 'original')), values);
});

test('live-schema fixtures resolve multiple works without modifying location data', () => {
  for (const [map, group] of [['sakurazaka-all', '櫻坂46'], ['keyakizaka-all', '欅坂46'], ['hinatazaka-all', '日向坂46']]) {
    const data = JSON.parse(readFileSync(new URL(`../../../public/seichi/${map}.geojson`, import.meta.url)));
    const before = JSON.stringify(data);
    const dated = data.features.map(f => getTimelineInfo(f, group)).filter(Boolean);
    assert(dated.length > 30, `${map} insufficient dated coverage`);
    assert(new Set(dated.map(x => x.key)).size > 5);
    assert.equal(JSON.stringify(data), before);
    console.log(map, `${dated.length}/${data.features.length} dated`, `${new Set(dated.map(x => x.key)).size} works/title dates`);
  }
});
