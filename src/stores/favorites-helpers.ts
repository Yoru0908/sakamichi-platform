export interface FavoriteMemberRecord {
  name: string;
  group: string;
  imageUrl: string;
  addedAt: number;
}

export interface RemoteFavoriteMemberRecord {
  name: string;
  group: string;
  addedAt?: string | number | null;
  imageUrl?: string;
}

export function mergeFavoriteSources({
  localFavorites,
  remoteFavorites,
  oshiMember,
}: {
  localFavorites: FavoriteMemberRecord[];
  remoteFavorites: RemoteFavoriteMemberRecord[];
  oshiMember?: string | null;
}): FavoriteMemberRecord[] {
  const merged = new Map<string, FavoriteMemberRecord>();

  const upsert = (entry: Partial<FavoriteMemberRecord> & { name: string }) => {
    const name = entry.name.trim();
    if (!name) return;

    const existing = merged.get(name);
    if (!existing) {
      merged.set(name, {
        name,
        group: entry.group || '',
        imageUrl: entry.imageUrl || '',
        addedAt: typeof entry.addedAt === 'number' && Number.isFinite(entry.addedAt) ? entry.addedAt : Date.now(),
      });
      return;
    }

    merged.set(name, {
      ...existing,
      group: existing.group || entry.group || '',
      imageUrl: existing.imageUrl || entry.imageUrl || '',
      addedAt: Math.min(existing.addedAt, typeof entry.addedAt === 'number' && Number.isFinite(entry.addedAt) ? entry.addedAt : existing.addedAt),
    });
  };

  for (const favorite of remoteFavorites) {
    upsert({
      name: favorite.name,
      group: favorite.group || '',
      imageUrl: favorite.imageUrl || '',
      addedAt: typeof favorite.addedAt === 'number'
        ? favorite.addedAt
        : typeof favorite.addedAt === 'string'
          ? new Date(favorite.addedAt).getTime()
          : Date.now(),
    });
  }

  for (const favorite of localFavorites) {
    upsert(favorite);
  }

  if (oshiMember) {
    upsert({ name: oshiMember, group: '', imageUrl: '', addedAt: 0 });
  }

  const values = Array.from(merged.values());
  if (!oshiMember) return values;

  const oshiName = oshiMember.trim();
  if (!oshiName) return values;

  return values.sort((left, right) => {
    if (left.name === oshiName && right.name !== oshiName) return -1;
    if (right.name === oshiName && left.name !== oshiName) return 1;
    return left.addedAt - right.addedAt;
  });
}
