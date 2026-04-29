export function pickItemsInFavoriteOrder<T>(
  items: T[],
  favoriteNames: string[],
  getName: (item: T) => string,
): T[] {
  const itemMap = new Map<string, T>();
  const seen = new Set<string>();

  for (const item of items) {
    const name = getName(item).trim();
    if (!name || itemMap.has(name)) continue;
    itemMap.set(name, item);
  }

  const ordered: T[] = [];
  for (const favoriteName of favoriteNames) {
    const name = favoriteName.trim();
    if (!name || seen.has(name)) continue;
    const item = itemMap.get(name);
    if (!item) continue;
    seen.add(name);
    ordered.push(item);
  }

  return ordered;
}
