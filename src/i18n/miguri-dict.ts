import { $language, type Language } from '../stores/language.ts';

// One zh/ja/en table per area of /miguri (2026-10-26). zh is the original copy, unchanged.
export type Params = Record<string, string | number>;

export function dictionary<K extends string>(tables: Record<Language, Record<K, string>>) {
  const translator = (lang: Language) => (key: K, params: Params = {}): string => {
    let value = tables[lang][key];
    for (const [name, replacement] of Object.entries(params)) value = value.replaceAll(`{${name}}`, String(replacement));
    return value;
  };
  /**
   * For text made outside render (effects and subscriptions started on mount). Those closures keep the first,
   * hydration-time render, which is always zh; this reads the language at the moment of the call.
   */
  const now = (key: K, params?: Params) => translator($language.get())(key, params);
  return { translator, now };
}
