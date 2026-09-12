import type { GroupId, Member } from '../../types/repo';

export type FolderCategory = 'oshi' | 'favorite' | 'custom';
interface DraftMember {
  memberId: string;
  memberName: string;
  groupId: GroupId;
  memberImageUrl: string;
}
export interface MemberFolder<T> {
  memberId: string;
  memberName: string;
  groupId?: GroupId;
  memberImageUrl: string;
  category: FolderCategory;
  canCreate: boolean;
  repos: T[];
}
const compact = (name: string) => name.normalize('NFKC').replace(/[\s\u3000]+/g, '');

// Preference folders exist independently of drafts. Never create fake saved repos
// or write preferences merely to populate the sidebar.
export function buildRepoMemberFolders<T extends DraftMember>({
  repos, members, oshiMember, favorites,
}: {
  repos: T[];
  members: Member[];
  oshiMember: string | null;
  favorites: { name: string; imageUrl?: string }[];
}): MemberFolder<T>[] {
  const catalog = new Map(members.flatMap(member => [
    [compact(member.id), member] as const,
    [compact(member.name), member] as const,
  ]));
  const resolve = (name: string) => catalog.get(compact(name));
  const key = (name: string) => resolve(name)?.id || compact(name);
  const oshiKey = oshiMember ? key(oshiMember) : '';
  const favoriteKeys = new Set(favorites.map(favorite => key(favorite.name)));
  const category = (id: string): FolderCategory => id === oshiKey ? 'oshi' : favoriteKeys.has(id) ? 'favorite' : 'custom';
  const folders = new Map<string, MemberFolder<T>>();

  const seed = (name: string, imageUrl = '') => {
    if (!compact(name)) return;
    const member = resolve(name);
    const id = key(name);
    if (folders.has(id)) return;
    folders.set(id, {
      memberId: member?.id || id,
      memberName: member?.name || name.trim(),
      groupId: member?.group,
      memberImageUrl: member?.imageUrl || imageUrl,
      category: category(id),
      canCreate: !!member,
      repos: [],
    });
  };
  if (oshiMember) seed(oshiMember);
  for (const favorite of favorites) seed(favorite.name, favorite.imageUrl);

  for (const repo of repos) {
    const member = resolve(repo.memberId) || resolve(repo.memberName);
    const id = member?.id || key(repo.memberName);
    if (!folders.has(id)) {
      folders.set(id, {
        memberId: member?.id || repo.memberId,
        memberName: member?.name || repo.memberName,
        groupId: member?.group || repo.groupId,
        memberImageUrl: member?.imageUrl || repo.memberImageUrl,
        category: category(id),
        canCreate: !!member,
        repos: [],
      });
    }
    const folder = folders.get(id)!;
    folder.groupId ||= repo.groupId;
    folder.memberImageUrl ||= repo.memberImageUrl;
    folder.repos.push(repo);
  }
  return [...folders.values()];
}
