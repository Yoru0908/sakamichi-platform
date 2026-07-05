import test from 'node:test';
import assert from 'node:assert/strict';

import { memberImagesToList } from './member-images.ts';

const images = {
  '現役 有図': {
    imageUrl: 'https://example.com/active.jpg',
    group: '日向坂46',
    status: 'active',
    isActive: true,
  },
  現役有図: {
    imageUrl: 'https://example.com/active.jpg',
    group: '日向坂46',
    status: 'active',
    isActive: true,
  },
  '現役 無図': {
    imageUrl: '',
    group: '日向坂46',
    status: 'active',
    isActive: true,
  },
  卒業有図: {
    imageUrl: 'https://example.com/graduated.jpg',
    group: '日向坂46',
    status: 'graduated',
    isActive: false,
  },
};

test('memberImagesToList can build current-member selectors from active entries with images', () => {
  const list = memberImagesToList(images, { activeOnly: true, requireImage: true });

  assert.deepEqual(list.map((member) => member.name), ['現役 有図']);
});

test('memberImagesToList keeps archive entries when no active-only filter is requested', () => {
  const list = memberImagesToList(images);
  const names = list.map((member) => member.name);

  assert.ok(names.includes('卒業有図'));
  assert.ok(names.includes('現役 無図'));
});
