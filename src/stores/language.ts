import { atom } from 'nanostores';

export type Language = 'zh' | 'en' | 'ja';

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('lang') as Language | null : null;

export const $language = atom<Language>(stored ?? 'zh');

export function setLanguage(lang: Language) {
  $language.set(lang);
  localStorage.setItem('lang', lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
}

export const LANGUAGE_LABELS: Record<Language, string> = {
  zh: '中文',
  en: 'EN',
  ja: '日本語',
};
