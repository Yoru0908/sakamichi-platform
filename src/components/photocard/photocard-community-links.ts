export function buildPhotocardWorkPath(workId: string): string {
  return `/photocard/${encodeURIComponent(workId)}`;
}

export function buildPhotocardAuthorPath(userId: string | null | undefined): string | null {
  if (!userId || !userId.trim()) return null;
  return `/photocard/user/${encodeURIComponent(userId)}`;
}
