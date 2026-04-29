import test from 'node:test';
import assert from 'node:assert/strict';

import { getRepoCommunityMemberImageUrl, getRepoCommunityPreferredMemberImageUrl } from './repo-community-avatar.ts';

test('getRepoCommunityMemberImageUrl prefers official member image by memberId', () => {
  const imageUrl = getRepoCommunityMemberImageUrl({
    memberId: '稲熊ひな',
    memberName: '稲熊ひな',
  });

  assert.equal(
    imageUrl,
    'https://sakurazaka46.com/images/14/399/dd195ad9a0d52b851a86c1dedbf6c/400_640_102400.jpg',
  );
});

test('getRepoCommunityPreferredMemberImageUrl prefers user uploaded avatar over official image', () => {
  const imageUrl = getRepoCommunityPreferredMemberImageUrl({
    customMemberAvatar: 'data:image/png;base64,custom-avatar',
    memberId: '稲熊ひな',
    memberName: '稲熊ひな',
  });

  assert.equal(imageUrl, 'data:image/png;base64,custom-avatar');
});

test('getRepoCommunityPreferredMemberImageUrl falls back to official image when no custom avatar exists', () => {
  const imageUrl = getRepoCommunityPreferredMemberImageUrl({
    memberId: '稲熊ひな',
    memberName: '稲熊ひな',
  });

  assert.equal(
    imageUrl,
    'https://sakurazaka46.com/images/14/399/dd195ad9a0d52b851a86c1dedbf6c/400_640_102400.jpg',
  );
});

test('getRepoCommunityMemberImageUrl falls back to member name lookup when memberId is unknown', () => {
  const imageUrl = getRepoCommunityMemberImageUrl({
    memberId: 'unknown-member-id',
    memberName: '稲熊ひな',
  });

  assert.equal(
    imageUrl,
    'https://sakurazaka46.com/images/14/399/dd195ad9a0d52b851a86c1dedbf6c/400_640_102400.jpg',
  );
});
