import { atom } from 'nanostores';

export type Theme = 'light' | 'dark';

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') as Theme | null : null;
const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
const initial: Theme = stored ?? (prefersDark ? 'dark' : 'light');

export const $theme = atom<Theme>(initial);

export function toggleTheme() {
  const next = $theme.get() === 'light' ? 'dark' : 'light';
  $theme.set(next);
  applyTheme(next);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('theme', theme);
}
