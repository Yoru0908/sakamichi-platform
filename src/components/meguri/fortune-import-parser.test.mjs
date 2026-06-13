import test from 'node:test';
import assert from 'node:assert/strict';

import { parseFortuneImportText } from './meguri-helpers.ts';

test('parseFortuneImportText parses payment info rows using 数量 column', () => {
  const text = `商品名	単価	数量	小計
山川　宇衣【6/14 第5部】櫻坂46 15th SG発売記念オンラインミート＆グリート	1,200円	4個	4,800円
山川　宇衣【6/14 第6部】櫻坂46 15th SG発売記念オンラインミート＆グリート	1,200円	5個	6,000円
山川　宇衣【6/21 第3部】櫻坂46 15th SG発売記念オンラインミート＆グリート	1,200円	6個	7,200円`;

  assert.deepEqual(parseFortuneImportText(text), [
    { member: '山川 宇衣', date: '6/14', slot: 5, count: 4 },
    { member: '山川 宇衣', date: '6/14', slot: 6, count: 5 },
    { member: '山川 宇衣', date: '6/21', slot: 3, count: 6 },
  ]);
});

test('parseFortuneImportText prefers 当選数 and preserves 0 counts', () => {
  const text = `商品名	単価	応募数	当選数	応募内容に基づく金額
山川　宇衣【6/14 第5部】櫻坂46 15th SG発売記念オンラインミート＆グリート	1,200円	3個	0個	3,600円
山川　宇衣【6/14 第6部】櫻坂46 15th SG発売記念オンラインミート＆グリート	1,200円	3個	0個	3,600円
山川　宇衣【6/21 第3部】櫻坂46 15th SG発売記念オンラインミート＆グリート	1,200円	3個	3個	3,600円`;

  assert.deepEqual(parseFortuneImportText(text), [
    { member: '山川 宇衣', date: '6/14', slot: 5, count: 0 },
    { member: '山川 宇衣', date: '6/14', slot: 6, count: 0 },
    { member: '山川 宇衣', date: '6/21', slot: 3, count: 3 },
  ]);
});
