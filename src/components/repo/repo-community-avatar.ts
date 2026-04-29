import memberImagesJson from '../../../public/data/member-images.json' with { type: 'json' };

type MemberImageEntry = {
  imageUrl?: string;
};

const memberImages = ((memberImagesJson as { images?: Record<string, MemberImageEntry> }).images) || {};

function compactMemberName(name: string): string {
  return name.replace(/\s+/g, '');
}

export function getRepoCommunityMemberImageUrl({ memberId, memberName }: { memberId?: string; memberName?: string }): string {
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

export function getRepoCommunityPreferredMemberImageUrl({
  customMemberAvatar,
  memberId,
  memberName,
}: {
  customMemberAvatar?: string;
  memberId?: string;
  memberName?: string;
}): string {
  if (customMemberAvatar) return customMemberAvatar;
  return getRepoCommunityMemberImageUrl({ memberId, memberName });
}
