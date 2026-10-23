import { useState, useRef, useEffect, useId } from 'react';
import { useLanguage } from '@/i18n/use-language';
import { t } from '@/i18n';
import { ChevronDown } from 'lucide-react';
import type { NavItem } from '@/utils/navigation';

interface Props {
  item: NavItem;
  currentPath: string;
  pillState?: 'active' | 'hovered' | 'idle';
}

export default function ToolsDropdown({ item, currentPath, pillState = 'idle' }: Props) {
  const lang = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const [focusEdge, setFocusEdge] = useState<'first' | 'last' | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open || !focusEdge) return;
    const links = ref.current?.querySelectorAll<HTMLAnchorElement>('[data-dropdown-panel] a');
    const target = focusEdge === 'first' ? links?.[0] : links?.[(links?.length ?? 1) - 1];
    target?.focus();
    setFocusEdge(null);
  }, [open, focusEdge]);

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(true), 80);
  };

  const handleLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!ref.current?.contains(document.activeElement)) setOpen(false);
    }, 150);
  };

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}
      onKeyDown={(e) => {
        const trigger = e.target === triggerRef.current;
        if (e.key === 'Escape') {
          if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
        } else if ((trigger && e.key === ' ') || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          if (trigger) { setOpen(true); setFocusEdge(e.key === 'ArrowUp' ? 'last' : 'first'); }
          else {
            const links = Array.from(ref.current?.querySelectorAll<HTMLAnchorElement>('[data-dropdown-panel] a') ?? []);
            const at = links.indexOf(e.target as HTMLAnchorElement);
            links[(at + (e.key === 'ArrowUp' ? -1 : 1) + links.length) % links.length]?.focus();
          }
        }
      }}
    >
      <a
        ref={triggerRef}
        href={item.href}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="relative z-10 flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
        style={{
          color:
            pillState === 'hovered'
              ? 'var(--text-primary)'
              : pillState === 'active'
                ? '#fff'
                : 'var(--text-secondary)',
        }}
      >
        {t(item.labelKey, lang)}
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </a>

      {open && item.children && (
        <div id={panelId} data-dropdown-panel className="absolute left-0 top-full pt-1 z-50">
          <div className="w-56 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] shadow-lg py-1">
            {item.children.map((child) => (
              <a
                key={child.href}
                href={child.href}
                target={child.external ? '_blank' : undefined}
                rel={child.external ? 'noopener noreferrer' : undefined}
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
