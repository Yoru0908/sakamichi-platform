import memberImagesJson from '../../public/data/member-images.json';
import { getR2AvatarUrl } from '@/components/messages/msg-styles';

type MemberImageEntry = {
  imageUrl?: string;
};

const memberImages = ((memberImagesJson as { images?: Record<string, MemberImageEntry> }).images) || {};

function compactMemberName(name: string): string {
  return name.replace(/\s+/g, '');
}

export function getRepoMemberOfficialImageUrl(memberName: string): string | undefined {
  return memberImages[memberName]?.imageUrl || memberImages[compactMemberName(memberName)]?.imageUrl;
}

export function getRepoMemberImageCandidates(memberName: string, preferredSrc?: string): string[] {
  const officialSrc = getRepoMemberOfficialImageUrl(memberName);
  const fallbackSrc = memberName ? getR2AvatarUrl(memberName) : '';
  const candidates: string[] = [];
  const isCustomPreferred = !!preferredSrc && /^(data:|blob:)/.test(preferredSrc);

  if (isCustomPreferred && preferredSrc) candidates.push(preferredSrc);
  if (officialSrc && !candidates.includes(officialSrc)) candidates.push(officialSrc);
  if (preferredSrc && !candidates.includes(preferredSrc)) candidates.push(preferredSrc);
  if (fallbackSrc && !candidates.includes(fallbackSrc)) candidates.push(fallbackSrc);

  return candidates;
}
