import { useStore } from '@nanostores/react';
import { $language, setLanguage, LANGUAGE_LABELS, type Language } from '@/stores/language';
import { Globe } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const LANGUAGES: Language[] = ['zh', 'en', 'ja'];

export default function LanguageSwitch() {
  const lang = useStore($language);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-9 px-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors text-sm"
        aria-label="Switch language"
      >
        <Globe size={16} />
        <span className="hidden sm:inline">{LANGUAGE_LABELS[lang]}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-32 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-lg py-1 z-50">
          {LANGUAGES.map((l) => (
            <button
              key={l}
              onClick={() => { setLanguage(l); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                l === lang
                  ? 'text-[var(--color-brand-nogi)] font-medium bg-[var(--bg-secondary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {LANGUAGE_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
