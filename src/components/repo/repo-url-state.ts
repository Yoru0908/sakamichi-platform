export type RepoTab = 'generator' | 'community';

export function getInitialRepoTab(mode: string | null | undefined): RepoTab {
  return mode === 'generator' ? 'generator' : 'community';
}

export function getRepoIdFromSearch(search: string): string | null {
  const raw = search || '';
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?')) : raw;
  const params = new URLSearchParams(query);
  const id = params.get('id');
  return id && id.trim() ? id.trim() : null;
}
