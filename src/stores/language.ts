import { atom } from 'nanostores';

export type Language = 'zh' | 'en' | 'ja';

export function isLanguage(value: unknown): value is Language {
  return value === 'zh' || value === 'ja' || value === 'en';
}

let stored: string | null = null;
try { stored = typeof localStorage !== 'undefined' ? localStorage.getItem('lang') : null; } catch { /* Storage may be blocked. */ }
export const $language = atom<Language>(isLanguage(stored) ? stored : 'zh');

export function setLanguage(lang: Language) {
  $language.set(lang);
  try { localStorage.setItem('lang', lang); } catch { /* Still switch the current page without persistence. */ }
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
}

export const LANGUAGE_LABELS: Record<Language, string> = {
  zh: '中文',
  en: 'EN',
  ja: '日本語',
};
