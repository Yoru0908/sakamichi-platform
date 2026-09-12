import { $language, isLanguage } from '@/stores/language';
import { t, type TranslationKey } from './index';

export function applyStaticTranslations(root: ParentNode = document) {
  const lang = $language.get();
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  for (const attribute of ['text', 'content', 'aria-label'] as const) {
    const marker = attribute === 'text' ? 'data-i18n' : `data-i18n-${attribute}`;
    for (const element of root.querySelectorAll<HTMLElement>(`[${marker}]`)) {
      const key = element.getAttribute(marker) as TranslationKey;
      let params: Record<string, string> = {};
      try { params = JSON.parse(element.getAttribute('data-i18n-params') || '{}'); } catch { /* Keep the default text parameters. */ }
      const value = t(key, lang, params);
      if (attribute === 'text') element.textContent = value;
      else element.setAttribute(attribute, value);
    }
  }
}

$language.subscribe(() => applyStaticTranslations());
document.addEventListener('astro:after-swap', () => applyStaticTranslations());
document.addEventListener('astro:page-load', () => applyStaticTranslations());
window.addEventListener('storage', (event) => {
  if (event.key === 'lang') $language.set(isLanguage(event.newValue) ? event.newValue : 'zh');
});
