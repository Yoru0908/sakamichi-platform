export type MemberStatus = 'active' | 'graduated' | 'excluded';

export type MemberImageEntry = {
  imageUrl?: string;
  url?: string;
  group?: string;
  generation?: string;
  generationNumber?: number;
  status?: MemberStatus;
  isActive?: boolean;
  placeholder?: string;
};

export type MemberImagesMap = Record<string, MemberImageEntry>;

export type MemberImageListOptions = {
  activeOnly?: boolean;
  requireImage?: boolean;
};

export type MemberListItem = {
  name: string;
  imageUrl: string;
  url?: string;
  group: string;
  generation?: string;
  status: MemberStatus;
  isActive: boolean;
  placeholder?: string;
};

export function compactMemberName(name: string): string {
  return name.replace(/[\s\u3000]+/g, '');
}

export function isActiveMemberEntry(entry: MemberImageEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.status === 'excluded') return false;
  if (entry.status === 'graduated') return false;
  return entry.isActive !== false;
}

export function getMemberImageUrl(entry: MemberImageEntry | undefined): string {
  return entry?.imageUrl || entry?.url || '';
}

function shouldIncludeMemberEntry(entry: MemberImageEntry | undefined, options: MemberImageListOptions): boolean {
  if (!entry) return false;
  if (options.activeOnly && !isActiveMemberEntry(entry)) return false;
  if (options.requireImage && !getMemberImageUrl(entry)) return false;
  return true;
}

export function deduplicateMemberImages(images: MemberImagesMap, options: MemberImageListOptions = {}): MemberImagesMap {
  const allNames = new Set(Object.keys(images));
  const result: MemberImagesMap = {};

  for (const [name, info] of Object.entries(images)) {
    if (!shouldIncludeMemberEntry(info, options)) continue;

    if (!name.includes(' ') && !name.includes('\u3000')) {
      let hasSpaced = false;
      for (const other of allNames) {
        if (
          other !== name &&
          (other.includes(' ') || other.includes('\u3000')) &&
          compactMemberName(other) === name &&
          shouldIncludeMemberEntry(images[other], options)
        ) {
          hasSpaced = true;
          break;
        }
      }
      if (hasSpaced) continue;
    }

    result[name] = info;
  }

  return result;
}

export function memberImagesToList(images: MemberImagesMap, options: MemberImageListOptions = {}): MemberListItem[] {
  return Object.entries(deduplicateMemberImages(images, options)).map(([name, info]) => ({
    name,
    imageUrl: getMemberImageUrl(info),
    url: getMemberImageUrl(info),
    group: info.group || '',
    generation: info.generation,
    status: info.status || (info.isActive === false ? 'graduated' : 'active'),
    isActive: isActiveMemberEntry(info),
    placeholder: info.placeholder,
  }));
}

export function findMemberImageEntry(images: MemberImagesMap, memberName: string): MemberImageEntry | undefined {
  if (!memberName) return undefined;
  return images[memberName] || images[compactMemberName(memberName)];
}
