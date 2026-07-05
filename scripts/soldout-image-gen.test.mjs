import test from 'node:test';
import assert from 'node:assert/strict';

import { formatEventTitleForImage } from './soldout-image-gen.mjs';

test('formatEventTitleForImage keeps online miguri suffix complete', () => {
  assert.equal(
    formatEventTitleForImage('【抽選応募】櫻坂46 15thシングル『Lonesome rabbit / What&#039;s “KAZOKU”?』 発売記念オンラインミート＆グリート（個別トーク会）'),
    '櫻坂46 15thシングル『Lonesome rabbit / What\'s “KAZOKU”?』 発売記念オンラインミーグリ',
  );
});

test('formatEventTitleForImage keeps real miguri suffix complete', () => {
  assert.equal(
    formatEventTitleForImage('【抽選応募】日向坂46 17thシングル『Kind of love』発売記念リアルミート＆グリート（個別トーク会）'),
    '日向坂46 17thシングル『Kind of love』発売記念リアルミーグリ',
  );
});
