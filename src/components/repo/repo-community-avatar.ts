import memberImagesJson from '../../../public/data/member-images.json';
import {
  getRepoCommunityMemberImageUrlFromImages,
  getRepoCommunityPreferredMemberImageUrlFromImages,
  type RepoCommunityMemberImages,
} from './repo-community-avatar-core';

const memberImages = ((memberImagesJson as { images?: RepoCommunityMemberImages }).images) || {};

export function getRepoCommunityMemberImageUrl({ memberId, memberName }: { memberId?: string; memberName?: string }): string {
  return getRepoCommunityMemberImageUrlFromImages(memberImages, { memberId, memberName });
}

export function getRepoCommunityPreferredMemberImageUrl({
  customMemberAvatar,
  memberId,
  memberName,
}: {
  customMemberAvatar?: string;
  memberId?: string;
  memberName?: string;
}): string {
  return getRepoCommunityPreferredMemberImageUrlFromImages(memberImages, {
    customMemberAvatar,
    memberId,
    memberName,
  });
}
