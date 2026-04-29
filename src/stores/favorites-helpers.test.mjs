import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeFavoriteSources } from './favorites-helpers.ts';

test('mergeFavoriteSources injects oshi member into favorites and keeps it first', () => {
  const merged = mergeFavoriteSources({
    localFavorites: [
      { name: '山川宇衣', group: '日向坂46', imageUrl: 'local-yamakawa.jpg', addedAt: 10 },
      { name: '高井俐香', group: '日向坂46', imageUrl: 'local-takai.jpg', addedAt: 20 },
    ],
    remoteFavorites: [
      { name: '山川宇衣', group: '', addedAt: '2026-04-20T00:00:00Z' },
      { name: '中川智寻', group: '乃木坂46', addedAt: '2026-04-21T00:00:00Z' },
    ],
    oshiMember: '中川智寻',
  });

  assert.deepEqual(
    merged.map((item) => item.name),
    ['中川智寻', '山川宇衣', '高井俐香'],
  );
  assert.equal(merged[0]?.group, '乃木坂46');
  assert.equal(merged[0]?.imageUrl, '');
  assert.equal(merged.find((item) => item.name === '山川宇衣')?.group, '日向坂46');
  assert.equal(merged.find((item) => item.name === '山川宇衣')?.imageUrl, 'local-yamakawa.jpg');
});

test('mergeFavoriteSources returns only oshi member when favorites are otherwise empty', () => {
  const merged = mergeFavoriteSources({
    localFavorites: [],
    remoteFavorites: [],
    oshiMember: '山川宇衣',
  });

  assert.deepEqual(merged.map((item) => item.name), ['山川宇衣']);
});
