export type RepoCommunityMemberImages = Record<string, { imageUrl?: string }>;

function compactMemberName(name: string): string {
  return name.replace(/\s+/g, '');
}

export function getRepoCommunityMemberImageUrlFromImages(
  memberImages: RepoCommunityMemberImages,
  { memberId, memberName }: { memberId?: string; memberName?: string },
): string {
  const keys = [
    memberId || '',
    compactMemberName(memberId || ''),
    memberName || '',
    compactMemberName(memberName || ''),
  ].filter(Boolean);

  for (const key of keys) {
    const imageUrl = memberImages[key]?.imageUrl;
    if (imageUrl) return imageUrl;
  }

  return '';
}

export function getRepoCommunityPreferredMemberImageUrlFromImages(
  memberImages: RepoCommunityMemberImages,
  {
    customMemberAvatar,
    memberId,
    memberName,
  }: {
    customMemberAvatar?: string;
    memberId?: string;
    memberName?: string;
  },
): string {
  if (customMemberAvatar) return customMemberAvatar;
  return getRepoCommunityMemberImageUrlFromImages(memberImages, { memberId, memberName });
}
