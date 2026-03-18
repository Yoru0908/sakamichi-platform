import { useState, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $language } from '@/stores/language';
import { t } from '@/i18n';
import { ChevronDown } from 'lucide-react';
import type { NavItem } from '@/utils/navigation';

interface Props {
  item: NavItem;
  currentPath: string;
}

export default function ToolsDropdown({ item, currentPath }: Props) {
  const lang = useStore($language);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(true), 80);
  };

  const handleLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  const isActive = currentPath.startsWith(item.href);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <a
        href={item.href}
        className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
          isActive
            ? 'bg-[var(--color-brand-nogi)] text-white shadow-sm'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]'
        }`}
      >
        {t(item.labelKey, lang)}
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </a>

      {open && item.children && (
        <div className="absolute left-0 top-full pt-1 z-50">
          <div className="w-56 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-lg py-1">
            {item.children.map((child) => (
              <a
                key={child.href}
                href={child.href}
                className={`block px-4 py-2.5 text-sm transition-colors ${
                  currentPath === child.href
                    ? 'text-[var(--color-brand-nogi)] bg-[var(--bg-secondary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t(child.labelKey, lang)}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
