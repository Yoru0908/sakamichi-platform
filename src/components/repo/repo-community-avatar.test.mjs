import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getRepoCommunityMemberImageUrlFromImages,
  getRepoCommunityPreferredMemberImageUrlFromImages,
} from './repo-community-avatar-core.ts';

const memberImagesJson = JSON.parse(readFileSync(new URL('../../../public/data/member-images.json', import.meta.url), 'utf8'));
const memberImages = memberImagesJson.images || {};
const expectedInakumaImageUrl = memberImages['稲熊ひな']?.imageUrl;

assert.ok(expectedInakumaImageUrl, 'expected 稲熊ひな imageUrl fixture to exist');

test('getRepoCommunityMemberImageUrl prefers official member image by memberId', () => {
  const imageUrl = getRepoCommunityMemberImageUrlFromImages(memberImages, {
    memberId: '稲熊ひな',
    memberName: '稲熊ひな',
  });

  assert.equal(imageUrl, expectedInakumaImageUrl);
});

test('getRepoCommunityPreferredMemberImageUrl prefers user uploaded avatar over official image', () => {
  const imageUrl = getRepoCommunityPreferredMemberImageUrlFromImages(memberImages, {
    customMemberAvatar: 'data:image/png;base64,custom-avatar',
    memberId: '稲熊ひな',
    memberName: '稲熊ひな',
  });

  assert.equal(imageUrl, 'data:image/png;base64,custom-avatar');
});

test('getRepoCommunityPreferredMemberImageUrl falls back to official image when no custom avatar exists', () => {
  const imageUrl = getRepoCommunityPreferredMemberImageUrlFromImages(memberImages, {
    memberId: '稲熊ひな',
    memberName: '稲熊ひな',
  });

  assert.equal(imageUrl, expectedInakumaImageUrl);
});

test('getRepoCommunityMemberImageUrl falls back to member name lookup when memberId is unknown', () => {
  const imageUrl = getRepoCommunityMemberImageUrlFromImages(memberImages, {
    memberId: 'unknown-member-id',
    memberName: '稲熊ひな',
  });

  assert.equal(imageUrl, expectedInakumaImageUrl);
});
