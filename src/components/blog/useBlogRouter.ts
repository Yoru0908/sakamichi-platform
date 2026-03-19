/** Hash-based router hook for blog SPA */

import { useState, useEffect, useCallback } from 'react';

export type BlogView = 'grid' | 'member' | 'detail' | 'stats' | 'interactions';

export interface BlogRoute {
  view: BlogView;
  group: string;       // 'all' | 'nogizaka' | 'sakurazaka' | 'hinatazaka'
  member?: string;      // member name (for member view)
  blogId?: string;      // blog id (for detail view)
  memberFilter?: string; // member filter from ?member= param
}

function parseHash(hash: string): BlogRoute {
  if (!hash || hash === '#' || hash === '') {
    return { view: 'grid', group: 'all' };
  }

  // Remove leading #
  const raw = hash.startsWith('#') ? hash.substring(1) : hash;

  // Parse query params
  let path = raw;
  let params: Record<string, string> = {};
  const qIdx = raw.indexOf('?');
  if (qIdx !== -1) {
    path = raw.substring(0, qIdx);
    const qs = raw.substring(qIdx + 1);
    for (const pair of qs.split('&')) {
      const [k, v] = pair.split('=');
      if (k && v) params[k] = decodeURIComponent(v);
    }
  }

  // #blog/{id}
  if (path.startsWith('blog/')) {
    return { view: 'detail', group: 'all', blogId: path.substring(5) };
  }

  // #{group}/member/{name}
  if (path.includes('/member/')) {
    const parts = path.split('/');
    const group = parts[0];
    const member = decodeURIComponent(parts[2] || '');
    return { view: 'member', group, member };
  }

  // #{group} or 'all'
  const group = path || 'all';
  return { view: 'grid', group, memberFilter: params.member };
}

export function useBlogRouter() {
  const [route, setRoute] = useState<BlogRoute>(() => parseHash(window.location.hash));

  useEffect(() => {
    const handler = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', handler);
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('hashchange', handler);
      window.removeEventListener('popstate', handler);
    };
  }, []);

  const navigate = useCallback((hash: string) => {
    if (window.location.hash === hash) {
      // Same hash — force re-parse
      setRoute(parseHash(hash));
    } else {
      window.location.hash = hash;
    }
  }, []);

  const back = useCallback(() => {
    window.history.back();
  }, []);

  return { route, navigate, back };
}

/** Navigate to stats/interactions views (not hash-based, just state) */
export function navigateToView(view: BlogView) {
  // Stats and interactions don't use hash — they're just view switches
  // But we keep hash in sync for the group
}
