import { atom } from 'nanostores';
import { $auth } from './auth';
import { getFavorites, getPreferences, syncFavorites } from '@/utils/auth-api';
import { mergeFavoriteSources } from './favorites-helpers';

// ── Types ──
export interface FavoriteMember {
  name: string;
  group: string;
  imageUrl: string;
  addedAt: number; // timestamp
}

// ── Storage Keys ──
const LS_KEY = 'sakamichi_favorites';
// Legacy key from MsgGenerator pinned members
const LEGACY_LS_KEY = 'msggen_pinned';

// ── Store ──
export const $favorites = atom<FavoriteMember[]>([]);
let hydratedUserId: string | null = null;
let hydratePromise: Promise<void> | null = null;

// ── Init: load from localStorage (+ migrate legacy data) ──
function loadFromLocalStorage(): FavoriteMember[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }

  // Migrate legacy pinned members
  try {
    const legacy = localStorage.getItem(LEGACY_LS_KEY);
    if (legacy) {
      const pins: { name: string; imageUrl: string }[] = JSON.parse(legacy);
      const migrated: FavoriteMember[] = pins.map((p) => ({
        name: p.name,
        group: '',   // unknown from legacy data, will be enriched on first load
        imageUrl: p.imageUrl,
        addedAt: Date.now(),
      }));
      localStorage.setItem(LS_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_LS_KEY);
      return migrated;
    }
  } catch { /* ignore */ }

  return [];
}

// ── Persist helper ──
function persistLocal(list: FavoriteMember[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch { /* quota exceeded etc */ }
}

async function persistRemote(list: FavoriteMember[]) {
  const auth = $auth.get();
  if (!auth.isLoggedIn || !auth.userId) return;

  try {
    await syncFavorites(list.map((favorite) => ({
      name: favorite.name,
      group: favorite.group,
    })));
  } catch {
    /* ignore network sync errors, local copy remains authoritative fallback */
  }
}

function persist(list: FavoriteMember[], options?: { syncRemote?: boolean }) {
  persistLocal(list);

  if (options?.syncRemote === false) return;

  void persistRemote(list);
}

export async function initFavorites(): Promise<void> {
  if (typeof window === 'undefined') return;

  const auth = $auth.get();
  if (!auth.isLoggedIn || !auth.userId) {
    hydratedUserId = null;
    $favorites.set(loadFromLocalStorage());
    return;
  }

  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const localFavorites = loadFromLocalStorage();
    const [favoritesRes, preferencesRes] = await Promise.all([
      getFavorites(),
      getPreferences(),
    ]);

    const remoteFavorites = favoritesRes.success && favoritesRes.data
      ? favoritesRes.data.favorites
      : [];
    const legacyFollowedFavorites = preferencesRes.success && preferencesRes.data
      ? preferencesRes.data.followedMembers.map((name) => ({
          name,
          group: '',
          imageUrl: '',
          addedAt: Date.now(),
        }))
      : [];

    const shouldSeedFromLegacyFollowed = remoteFavorites.length === 0
      && legacyFollowedFavorites.length > 0
      && localFavorites.length === 0;

    const merged = mergeFavoriteSources({
      localFavorites: shouldSeedFromLegacyFollowed ? legacyFollowedFavorites : localFavorites,
      remoteFavorites,
      oshiMember: preferencesRes.success && preferencesRes.data
        ? preferencesRes.data.oshiMember
        : auth.oshiMember,
    });

    $favorites.set(merged);
    persistLocal(merged);
    hydratedUserId = auth.userId;

    const remoteNames = new Set(remoteFavorites.map((favorite) => favorite.name));
    const needsBackfill = merged.some((favorite) => !remoteNames.has(favorite.name)) || (remoteFavorites.length === 0 && merged.length > 0);
    if (needsBackfill) {
      await persistRemote(merged);
    }
  })().finally(() => {
    hydratePromise = null;
  });

  return hydratePromise;
}

if (typeof window !== 'undefined') {
  $auth.subscribe((auth) => {
    if (auth.loading) return;

    if (auth.isLoggedIn && auth.userId) {
      if (hydratedUserId !== auth.userId) {
        void initFavorites();
      }
      return;
    }

    hydratedUserId = null;
    $favorites.set(loadFromLocalStorage());
  });
}

// ── Public API ──
export function addFavorite(member: { name: string; group: string; imageUrl: string }) {
  const current = $favorites.get();
  const auth = $auth.get();
  const next = mergeFavoriteSources({
    localFavorites: [
      ...current,
      { ...member, addedAt: Date.now() },
    ],
    remoteFavorites: [],
    oshiMember: auth.oshiMember,
  });
  $favorites.set(next);
  persist(next);
}

export function replaceFavorites(members: { name: string; group: string; imageUrl: string }[]) {
  const current = $favorites.get();
  const auth = $auth.get();
  const currentMap = new Map(current.map((favorite) => [favorite.name, favorite]));
  const next = members.map((member) => {
    const existing = currentMap.get(member.name);
    return {
      name: member.name,
      group: member.group,
      imageUrl: member.imageUrl,
      addedAt: existing?.addedAt || Date.now(),
    };
  });

  const normalized = mergeFavoriteSources({
    localFavorites: next,
    remoteFavorites: [],
    oshiMember: auth.oshiMember,
  });

  $favorites.set(normalized);
  persist(normalized);
}

export function removeFavorite(name: string) {
  const current = $favorites.get();
  const auth = $auth.get();
  const next = mergeFavoriteSources({
    localFavorites: current.filter((f) => f.name !== name),
    remoteFavorites: [],
    oshiMember: auth.oshiMember,
  });
  $favorites.set(next);
  persist(next);
}

export function toggleFavorite(member: { name: string; group: string; imageUrl: string }) {
  if (isFavorite(member.name)) {
    removeFavorite(member.name);
  } else {
    addFavorite(member);
  }
}

export function isFavorite(name: string): boolean {
  return $favorites.get().some((f) => f.name === name);
}

/** Enrich group info for legacy migrated entries that lack group data */
export function enrichFavorites(members: { name: string; group: string; imageUrl: string }[]) {
  const current = $favorites.get();
  let changed = false;
  const next = current.map((f) => {
    if (!f.group || !f.imageUrl) {
      const match = members.find((m) => m.name === f.name);
      if (match) {
        changed = true;
        return {
          ...f,
          group: f.group || match.group,
          imageUrl: f.imageUrl || match.imageUrl,
        };
      }
    }
    return f;
  });
  if (changed) {
    $favorites.set(next);
    persist(next);
  }
}
