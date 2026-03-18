import { zh, type TranslationKey } from './zh';
import { en } from './en';
import { ja } from './ja';
import type { Language } from '@/stores/language';

const dictionaries: Record<Language, Record<TranslationKey, string>> = { zh, en, ja };

/**
 * Get a translated string by key.
 * Supports simple interpolation: t('footer.copyright', { year: '2025' })
 */
export function t(key: TranslationKey, lang: Language = 'zh', params?: Record<string, string>): string {
  let text = dictionaries[lang]?.[key] ?? dictionaries['zh'][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

/**
 * React hook-style helper: returns a t() bound to a specific language.
 */
export function createTranslator(lang: Language) {
  return (key: TranslationKey, params?: Record<string, string>) => t(key, lang, params);
}

export type { TranslationKey };
