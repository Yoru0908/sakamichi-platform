import { atom } from 'nanostores';
import { $auth } from './auth';

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

// Initialize store
if (typeof window !== 'undefined') {
  $favorites.set(loadFromLocalStorage());
}

// ── Persist helper ──
function persist(list: FavoriteMember[]) {
  // Phase 1: always write to localStorage
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch { /* quota exceeded etc */ }

  // Phase 2 placeholder: when auth API is ready, sync to server
  // const auth = $auth.get();
  // if (auth.isLoggedIn && auth.userId) {
  //   syncToServer(auth.userId, list);
  // }
}

// ── Public API ──
export function addFavorite(member: { name: string; group: string; imageUrl: string }) {
  const current = $favorites.get();
  if (current.some((f) => f.name === member.name)) return; // already exists
  const next = [...current, { ...member, addedAt: Date.now() }];
  $favorites.set(next);
  persist(next);
}

export function removeFavorite(name: string) {
  const current = $favorites.get();
  const next = current.filter((f) => f.name !== name);
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
    if (!f.group) {
      const match = members.find((m) => m.name === f.name);
      if (match) {
        changed = true;
        return { ...f, group: match.group, imageUrl: match.imageUrl };
      }
    }
    return f;
  });
  if (changed) {
    $favorites.set(next);
    persist(next);
  }
}

// ── Phase 2 stubs (account sync) ──
// export async function syncToServer(userId: string, list: FavoriteMember[]) { ... }
// export async function loadFromServer(userId: string): Promise<FavoriteMember[]> { ... }
// export async function mergeLocalAndRemote(userId: string) { ... }
