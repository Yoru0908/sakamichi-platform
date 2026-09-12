import { useState, useRef, useEffect, useCallback } from 'react';
import { NAV_ITEMS, isNavItemActive } from '@/utils/navigation';
import { useLanguage } from '@/i18n/use-language';
import { t } from '@/i18n';
import ToolsDropdown from './ToolsDropdown';

type PillState = 'active' | 'hovered' | 'idle';
const RELOAD_HREFS = new Set(['/blog', '/repo']);

interface Props {
  currentPath: string;
}

export default function NavPill({ currentPath }: Props) {
  const lang = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | HTMLDivElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const activeIdx = NAV_ITEMS.findIndex((item) => isNavItemActive(item, currentPath));

  const measureItem = useCallback((idx: number) => {
    const el = itemRefs.current[idx];
    const container = containerRef.current;
    if (!el || !container) return null;
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    return { left: eRect.left - cRect.left, width: eRect.width };
  }, []);

  // Translated labels and late-loaded fonts change widths; track the actual items.
  useEffect(() => {
    const update = () => setPill(measureItem(hoveredIdx ?? activeIdx));
    update();
    const observer = new ResizeObserver(update);
    if (containerRef.current) observer.observe(containerRef.current);
    itemRefs.current.forEach((item) => { if (item) observer.observe(item); });
    return () => observer.disconnect();
  }, [activeIdx, hoveredIdx, lang, measureItem]);

  const handleMouseEnter = useCallback((idx: number) => {
    setHoveredIdx(idx);
    const m = measureItem(idx);
    if (m) setPill(m);
  }, [measureItem]);

  const handleMouseLeave = useCallback(() => {
    setHoveredIdx(null);
    if (activeIdx >= 0) {
      const m = measureItem(activeIdx);
      if (m) setPill(m);
    } else {
      setPill(null);
    }
  }, [activeIdx, measureItem]);

  return (
    <div
      ref={containerRef}
      className="hidden xl:flex shrink-0 whitespace-nowrap items-center gap-0.5 bg-[var(--bg-tertiary)]/60 backdrop-blur-sm rounded-full px-1 py-0.5 border border-[var(--border-secondary)] relative"
      onMouseLeave={handleMouseLeave}
    >
      {/* Sliding pill background */}
      {pill && (
        <div
          className="absolute rounded-full shadow-sm pointer-events-none"
          style={{
            left: pill.left,
            width: pill.width,
            top: '50%',
            transform: 'translateY(-50%)',
            height: 'calc(100% - 4px)',
            backgroundColor: hoveredIdx !== null
              ? 'var(--bg-primary)'
              : (activeIdx >= 0 ? 'var(--color-brand-nogi)' : 'transparent'),
            transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.2s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s ease',
            zIndex: 0,
          }}
        />
      )}

      {NAV_ITEMS.map((item, idx) => {
        const pillState: PillState = hoveredIdx !== null
          ? (hoveredIdx === idx ? 'hovered' : 'idle')
          : (isNavItemActive(item, currentPath) && pill ? 'active' : 'idle');
        return item.children ? (
          <div
            key={item.href}
            ref={(el) => { itemRefs.current[idx] = el; }}
            onMouseEnter={() => handleMouseEnter(idx)}
            className="relative z-10"
          >
            <ToolsDropdown item={item} currentPath={currentPath} pillState={pillState} />
          </div>
        ) : (
          <a
            key={item.href}
            ref={(el) => { itemRefs.current[idx] = el; }}
            href={item.href}
            {...(RELOAD_HREFS.has(item.href) ? { 'data-astro-reload': true } : {})}
            className="relative z-10 px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
            style={{
              color:
                pillState === 'hovered'
                  ? 'var(--text-primary)'
                  : pillState === 'active'
                    ? '#fff'
                    : 'var(--text-secondary)',
            }}
            onMouseEnter={() => handleMouseEnter(idx)}
          >
            {t(item.labelKey, lang)}
          </a>
        );
      })}
    </div>
  );
}
