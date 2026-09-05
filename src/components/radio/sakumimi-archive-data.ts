import { compactMemberName, memberImagesToList, type MemberImagesMap } from '../../utils/member-images.ts';

const ALIST_ORIGIN = 'https://alist.46log.com';
const LEGACY_ALIST_HOST = 'alist.sakamichi-tools.cn';
export const PAST_MEMBERS_GROUP = '卒業・過去の出演メンバー';

export interface ArchiveMember {
  name: string;
  imageUrl: string;
  generation: string;
  episodeCount: number;
}

type EpisodeMembers = { members: string[] };
type EpisodeMedia = { image: string; cover_url: string; audio_url: string };

/** Only migrate the known retired archive host. Preserve paths, queries and other origins. */
export function normalizeSakumimiUrl(value: string): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.hostname === LEGACY_ALIST_HOST && ['https:', 'http:'].includes(url.protocol)) {
      return `${ALIST_ORIGIN}${url.pathname}${url.search}${url.hash}`;
    }
    return value;
  } catch {
    return value;
  }
}

export function normalizeSakumimiEpisode<T extends EpisodeMembers & EpisodeMedia>(episode: T): T {
  return {
    ...episode,
    members: [...new Set(episode.members.map(compactMemberName).filter(Boolean))],
    cover_url: normalizeSakumimiUrl(episode.cover_url),
    audio_url: normalizeSakumimiUrl(episode.audio_url),
    image: normalizeSakumimiUrl(episode.image),
  };
}

export function sakumimiCoverSources(episode: Pick<EpisodeMedia, 'cover_url' | 'image'>): string[] {
  // Some original Bilibili thumbnails in the legacy index use HTTP. Avoid mixed content.
  return [...new Set([episode.cover_url, episode.image]
    .map(normalizeSakumimiUrl)
    .map(url => url.replace(/^http:\/\//i, 'https://'))
    .filter(Boolean))];
}

/** The archive tags, not the current roster, are authoritative for historical appearances. */
export function buildSakumimiMembers(images: MemberImagesMap, episodes: EpisodeMembers[]): ArchiveMember[] {
  const roster = memberImagesToList(images).filter(member => ['樱坂46', '櫻坂46'].includes(member.group));
  const metadata = new Map(roster.map(member => [compactMemberName(member.name), member]));
  const counts = new Map<string, number>();
  for (const episode of episodes) {
    for (const name of new Set(episode.members.map(compactMemberName).filter(Boolean))) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  // Keep the existing active roster, including members without an avatar, then union archive tags.
  const names = new Set([...roster.filter(m => m.isActive).map(m => compactMemberName(m.name)), ...counts.keys()]);
  const order: Record<string, number> = { '一期生': 0, '二期生': 1, '三期生': 2, '四期生': 3, '期別未登録': 4, [PAST_MEMBERS_GROUP]: 5 };
  return [...names].map(name => {
    const member = metadata.get(name);
    return {
      name,
      imageUrl: member?.imageUrl || '',
      // Missing metadata does not prove graduation: use the combined historical-appearance label.
      generation: member?.isActive ? (member.generation || '期別未登録') : PAST_MEMBERS_GROUP,
      episodeCount: counts.get(name) || 0,
    };
  }).sort((a, b) => (order[a.generation] ?? 4) - (order[b.generation] ?? 4) || a.name.localeCompare(b.name, 'ja'));
}
