import test from 'node:test';
import assert from 'node:assert/strict';

import { pickItemsInFavoriteOrder } from './favorite-order.ts';

test('pickItemsInFavoriteOrder returns only matched items in favorites order', () => {
  const items = [
    { name: '藤嶌果歩', group: '日向坂46' },
    { name: '小坂菜緒', group: '日向坂46' },
    { name: '正源司陽子', group: '日向坂46' },
  ];

  const ordered = pickItemsInFavoriteOrder(items, ['小坂菜緒', '正源司陽子'], (item) => item.name);

  assert.deepEqual(ordered.map((item) => item.name), ['小坂菜緒', '正源司陽子']);
});

test('pickItemsInFavoriteOrder ignores favorites that have no matching item and does not duplicate entries', () => {
  const items = [
    { name: '山川宇衣', group: '日向坂46' },
    { name: '高井俐香', group: '日向坂46' },
  ];

  const ordered = pickItemsInFavoriteOrder(items, ['不存在成员', '山川宇衣', '山川宇衣'], (item) => item.name);

  assert.deepEqual(ordered.map((item) => item.name), ['山川宇衣']);
});
