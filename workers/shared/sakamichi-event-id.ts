/** Matches the source Worker events schema: count is 1–32 word characters, including Sakurazaka's day suffix. */
export function parseSakamichiEventId(id: string): { grp: 'nogizaka' | 'sakurazaka' | 'hinatazaka'; year: number } | null {
  const match = id.match(/^(\w{1,32}):(\d{4})-\d{2}-\d{2}$/);
  if (!match) return null;
  const count = match[1];
  return { grp: count.startsWith('h_') ? 'hinatazaka' : count.startsWith('n_') ? 'nogizaka' : 'sakurazaka', year: Number(match[2]) };
}
