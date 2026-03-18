import { useStore } from '@nanostores/react';
import { $mobileDrawerOpen, closeDrawer } from '@/stores/ui';
import { $language } from '@/stores/language';
import { $theme, toggleTheme } from '@/stores/theme';
import { $auth } from '@/stores/auth';
import { setLanguage, LANGUAGE_LABELS, type Language } from '@/stores/language';
import { t } from '@/i18n';
import { MOBILE_NAV_GROUPS } from '@/utils/navigation';
import { X, Moon, Sun, Globe, User, LogIn, ChevronRight } from 'lucide-react';

const LANGUAGES: Language[] = ['zh', 'en', 'ja'];

interface Props {
  currentPath: string;
}

export default function MobileDrawer({ currentPath }: Props) {
  const isOpen = useStore($mobileDrawerOpen);
  const lang = useStore($language);
  const theme = useStore($theme);
  const auth = useStore($auth);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={closeDrawer}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-72 bg-[var(--bg-primary)] shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-[var(--border-primary)]">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            Sakamichi Tools
          </span>
          <button
            onClick={closeDrawer}
            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto h-[calc(100%-4rem)] pb-8">
          {/* Navigation groups */}
          {MOBILE_NAV_GROUPS.map((group) => (
            <div key={group.groupKey} className="mt-4">
              <div className="px-4 py-1 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                {t(group.groupKey, lang)}
              </div>
              {group.items.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={closeDrawer}
                  {...(item.href === '/blog' ? { 'data-astro-reload': true } : {})}
                  className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                    currentPath === item.href || currentPath.startsWith(item.href + '/')
                      ? 'text-[var(--color-brand-nogi)] bg-[var(--bg-secondary)] font-medium'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                  }`}
                >
                  <span>{t(item.labelKey, lang)}</span>
                </a>
              ))}
            </div>
          ))}

          {/* Account section */}
          <div className="mt-4">
            <div className="px-4 py-1 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              {t('nav.group.account', lang)}
            </div>
            {auth.isLoggedIn ? (
              <>
                <a
                  href={`/user/${auth.userId}`}
                  onClick={closeDrawer}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <User size={16} />
                  <span>{t('nav.user.profile', lang)}</span>
                  <ChevronRight size={14} className="ml-auto text-[var(--text-tertiary)]" />
                </a>
                <a
                  href="/account/favorites"
                  onClick={closeDrawer}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <span>{t('nav.user.favorites', lang)}</span>
                </a>
                <a
                  href="/account/settings"
                  onClick={closeDrawer}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <span>{t('nav.user.settings', lang)}</span>
                </a>
              </>
            ) : (
              <a
                href="/auth/login"
                onClick={closeDrawer}
                className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <LogIn size={16} />
                <span>{t('nav.login', lang)}</span>
              </a>
            )}
          </div>

          {/* Settings: theme + language */}
          <div className="mt-6 mx-4 border-t border-[var(--border-primary)] pt-4 space-y-2">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-3 w-full px-2 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              <span>{theme === 'light' ? t('theme.dark', lang) : t('theme.light', lang)}</span>
            </button>

            <div className="flex items-center gap-3 px-2 py-2.5 text-sm text-[var(--text-secondary)]">
              <Globe size={16} />
              <div className="flex gap-1">
                {LANGUAGES.map((l) => (
                  <button
                    key={l}
                    onClick={() => setLanguage(l)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      l === lang
                        ? 'bg-[var(--color-brand-nogi)] text-white'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    {LANGUAGE_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Version */}
          <div className="mt-6 px-4 text-xs text-[var(--text-tertiary)]">
            v0.1.0
          </div>
        </div>
      </div>
    </>
  );
}
